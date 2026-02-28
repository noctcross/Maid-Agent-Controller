/**
 * タスク CRUD 操作
 *
 * create, get, list, update 操作を提供。
 * task-manager.ts から責務分割のため分離。
 */

import * as path from "path";
import type {
  TaskStatus,
  Task,
  TaskSummary,
  TasksData,
  Assignee,
  TaskCategory,
  TaskType,
  TaskSubstatus,
  OperatorRole,
  UpdateTaskParams,
  SideEffectResults,
  UpdateTaskResult,
  TaskSize,
} from "../types/task-manager-types.js";
import { getTimestamp } from "../utils/yaml-helper.js";
import { withTasksLock, loadTasksReadOnly } from "./task-core.js";
import { logger } from "../utils/logger.js";
import { getAgentRole, validateStatusTransition, convertToV2Status } from "./task-v2-migration.js";
import { checkAndAutoCloseParent, resolveBlockedTasks } from "./task-auto-close.js";

// === CRUD操作 ===

export interface CreateTaskParams {
  title: string;           // タスクタイトル（短い概要）
  description?: string;    // タスク説明（詳細、省略可）
  priority?: "high" | "medium" | "low";
  parentId?: string;
  category?: TaskCategory;
  // Note: assigneesはcreate_taskでは指定不可。assign_taskで別途アサインする設計。
  // 理由: 作業中メイドへのアサインを防ぐガード条件がassign_taskにあるため。

  // === V2.1 拡張パラメータ ===
  type?: TaskType;                  // goal/phase/action/investigation (default: action)
  size?: TaskSize;                  // simple/standard/complex (Task only)
  tentative?: boolean;              // 暫定Task (Task only)
  blockedBy?: string[];             // 依存先タスクID
}

export interface CreateTaskResult {
  taskId: string;
  task: Task;
  reopenedParent?: Task;  // 直接の親タスクが再オープンされた場合、その情報を含める（後方互換）
  reopenedAncestors?: Task[];  // 全ての再オープンされた祖先タスク（親→祖先の順）
}

/**
 * タスク作成
 *
 * Note: assigneesはcreate_taskでは指定不可。assign_taskで別途アサインする。
 * 理由: 作業中メイドへのアサインを防ぐガード条件がassign_taskにあるため。
 */
export async function executeCreateTask(
  projectPath: string,
  params: CreateTaskParams
): Promise<CreateTaskResult> {
  return withTasksLock(projectPath, async (data) => {
    // 新しいタスクID生成
    let taskId: string;
    let reopenedParent: Task | undefined;  // 直接の親タスク（後方互換）
    const reopenedAncestors: Task[] = [];  // 全ての再オープンされた祖先

    if (params.parentId) {
      // サブタスクの場合: 親ID-連番
      const siblings = data.tasks.filter((t) => t.parentId === params.parentId);
      const nextSeq = siblings.length + 1;
      taskId = `${params.parentId}-${nextSeq}`;

      // 祖先タスクの自動再オープン
      // 子タスクが追加されたら、全ての祖先を open/working に変更
      let currentParentId: string | null = params.parentId;
      while (currentParentId) {
        const ancestorTask = data.tasks.find((t) => t.id === currentParentId);
        if (!ancestorTask) break;

        let ancestorUpdated = false;

        // 祖先が closed の場合 → open/working に変更
        if (ancestorTask.mainStatus === "closed") {
          ancestorTask.mainStatus = "open";
          ancestorTask.v2Substatus = "working";
          ancestorTask.status = "working";  // 旧ステータスも同期
          ancestorTask.updatedAt = getTimestamp();
          ancestorUpdated = true;
        }
        // 祖先が archived の場合 → archived:false に変更
        if (ancestorTask.archived === true) {
          ancestorTask.archived = false;
          ancestorTask.updatedAt = getTimestamp();
          ancestorUpdated = true;
        }

        // 祖先タスクが更新された場合、リストに追加
        if (ancestorUpdated) {
          reopenedAncestors.push({ ...ancestorTask });  // コピーを作成
          // 最初の祖先（直接の親）を後方互換のために保持
          if (!reopenedParent) {
            reopenedParent = { ...ancestorTask };
          }
        }

        // 次の祖先へ
        currentParentId = ancestorTask.parentId;
      }
    } else {
      // メインタスクの場合: 連番（3桁ゼロ埋め）
      data.lastTaskNumber += 1;
      taskId = String(data.lastTaskNumber).padStart(3, "0");
    }

    const now = getTimestamp();

    // V2.1: タスク種別の決定（デフォルト: step）
    const taskType = params.type || "step";

    // V2.1: 初期ステータスの設定
    // - blockedBy があれば waiting
    // - それ以外は pending（未着手）
    const hasBlockers = params.blockedBy && params.blockedBy.length > 0;
    const initialV2Substatus: TaskSubstatus = hasBlockers ? "waiting" : "pending";

    const newTask: Task = {
      id: taskId,
      parentId: params.parentId || null,
      title: params.title,
      description: params.description || "",
      priority: params.priority || "medium",
      status: "pending",
      substatus: null,
      category: params.category || "task",
      assignees: [],
      targetPath: null,
      createdAt: now,
      updatedAt: now,
      assignedAt: null,
      startedAt: null,
      completedAt: null,
      reportPaths: [],
      summary: null,

      // === V2.1 拡張フィールド ===
      type: taskType,
      mainStatus: "open",
      v2Substatus: initialV2Substatus,
      size: taskType === "task" ? (params.size || "standard") : undefined,
      tentative: taskType === "task" ? (params.tentative || false) : undefined,
      blockedBy: params.blockedBy || [],
      artifacts: [],
      reviewStatus: undefined,
    };

    data.tasks.push(newTask);
    return { data, result: { taskId, task: newTask, reopenedParent, reopenedAncestors: reopenedAncestors.length > 0 ? reopenedAncestors : undefined } };
  });
}

export interface GetTaskParams {
  taskId: string;
  includeSubtasks?: boolean;
  summaryOnly?: boolean;  // true: 軽量版（TaskSummary）を返却
}

export interface GetTaskResult {
  task: Task | TaskSummary | null;
  subtasks?: (Task | TaskSummary)[];
}

/**
 * Task を TaskSummary に変換
 */
function toTaskSummary(task: Task): TaskSummary {
  return {
    id: task.id,
    parentId: task.parentId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    category: task.category,
    assignees: task.assignees,
  };
}

/**
 * タスク取得
 */
export async function executeGetTask(
  projectPath: string,
  params: GetTaskParams
): Promise<GetTaskResult> {
  const data = await loadTasksReadOnly(projectPath);
  const fullTask = data.tasks.find((t) => t.id === params.taskId) || null;

  if (!fullTask) {
    return { task: null };
  }

  const task = params.summaryOnly ? toTaskSummary(fullTask) : fullTask;

  let subtasks: (Task | TaskSummary)[] | undefined;
  if (params.includeSubtasks) {
    const fullSubtasks = data.tasks.filter((t) => t.parentId === params.taskId);
    subtasks = params.summaryOnly
      ? fullSubtasks.map(toTaskSummary)
      : fullSubtasks;
  }

  return { task, subtasks };
}

export interface ListTasksParams {
  status?: TaskStatus[];
  assignee?: string;
  parentId?: string | null;
  category?: TaskCategory[];
  reviewed?: boolean;
  starred?: boolean;
  actionRequired?: boolean;  // true: actionRequired=trueのタスクのみ
  search?: string;        // テキスト検索（id, title, description を部分一致検索）
  limit?: number;
  offset?: number;
  sortField?: "createdAt" | "completedAt" | "priority" | "status" | "id" | "updatedAt";
  sortOrder?: "asc" | "desc";
  summaryOnly?: boolean;  // true: 軽量版（TaskSummary[]）を返却
}

export interface ListTasksResult {
  tasks: (Task | TaskSummary)[];
  total: number;
  hasMore: boolean;
}

/**
 * タスクIDを数値的に比較する
 * 例: "048" < "048-1" < "048-2" < "048-10" (文字列比較だと "048-10" < "048-2" になる)
 */
export function compareTaskIds(a: string, b: string): number {
  const partsA = a.split("-").map(Number);
  const partsB = b.split("-").map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] ?? -1;
    const numB = partsB[i] ?? -1;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

/**
 * タスク一覧取得
 */
export async function executeListTasks(
  projectPath: string,
  params: ListTasksParams = {}
): Promise<ListTasksResult> {
  const data = await loadTasksReadOnly(projectPath);
  let tasks = [...data.tasks];

  // フィルタリング
  if (params.status?.length) {
    tasks = tasks.filter((t) => params.status!.includes(t.status));
  }
  if (params.assignee) {
    tasks = tasks.filter((t) =>
      t.assignees.some((a) => a.agentId === params.assignee)
    );
  }
  if (params.parentId !== undefined) {
    tasks = tasks.filter((t) => t.parentId === params.parentId);
  }
  if (params.category?.length) {
    tasks = tasks.filter((t) => params.category!.includes(t.category || "task"));
  }
  if (params.reviewed !== undefined) {
    tasks = tasks.filter((t) =>
      params.reviewed ? t.reviewed === true : !t.reviewed
    );
  }
  if (params.starred !== undefined) {
    tasks = tasks.filter((t) =>
      params.starred ? t.starred === true : !t.starred
    );
  }
  if (params.actionRequired !== undefined) {
    tasks = tasks.filter((t) =>
      params.actionRequired ? t.actionRequired === true : !t.actionRequired
    );
  }
  // テキスト検索（id, title, description を部分一致検索）
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    tasks = tasks.filter((t) => {
      const idMatch = t.id?.toLowerCase().includes(searchLower) || false;
      const titleMatch = t.title?.toLowerCase().includes(searchLower) || false;
      const descMatch = t.description?.toLowerCase().includes(searchLower) || false;
      return idMatch || titleMatch || descMatch;
    });
  }

  // ソート
  if (params.sortField) {
    const order = params.sortOrder || "desc";
    if (params.sortField === "id") {
      tasks.sort((a, b) => {
        const cmp = compareTaskIds(a.id, b.id);
        return order === "asc" ? cmp : -cmp;
      });
    } else {
      const field = params.sortField;
      tasks.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return order === "asc" ? -1 : 1;
        if (bVal === null) return order === "asc" ? 1 : -1;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return order === "asc" ? cmp : -cmp;
      });
    }
  }

  const total = tasks.length;

  // ページネーション
  const offset = params.offset || 0;
  const limit = params.limit || 50;
  tasks = tasks.slice(offset, offset + limit);

  return {
    tasks: params.summaryOnly ? tasks.map(toTaskSummary) : tasks,
    total,
    hasMore: offset + tasks.length < total,
  };
}

// === Phase 3: update_task ===
// 型定義は ../types/task-manager-types.ts から再エクスポート

/**
 * タスク更新
 *
 * unified-task-state-gateway: 唯一の書き込みゲートウェイ。
 * tasks.yaml 更新後、副作用（maid yaml同期・レポートアーカイブ・テンプレート初期化）を実行。
 */
export async function executeUpdateTask(
  projectPath: string,
  params: UpdateTaskParams
): Promise<UpdateTaskResult> {
  // Phase 1: tasks.yaml 更新（ロック内）
  const lockResult = await withTasksLock<{
    result: UpdateTaskResult;
    prevStatus: string;
    prevAssignees: Assignee[];
  }>(projectPath, async (data) => {
    const taskIndex = data.tasks.findIndex((t) => t.id === params.taskId);

    if (taskIndex === -1) {
      const result: UpdateTaskResult = { success: false, task: null };
      return { data, result: { result, prevStatus: "", prevAssignees: [] } };
    }

    const task = data.tasks[taskIndex];
    const now = getTimestamp();

    // 更新前の状態を保持（副作用判定用）
    const prevStatus = task.status;
    const prevAssignees = [...task.assignees];

    // 更新適用
    if (params.status !== undefined) {
      task.status = params.status;
      if (params.status === "working" && !task.startedAt) {
        task.startedAt = now;
      }
      if (params.status === "completed") {
        task.completedAt = now;
      }
      // V2.1: 旧ステータス→V2.1ステータス自動同期
      // params.v2Substatus が明示的に指定されている場合はそちらを優先
      if (params.v2Substatus === undefined) {
        if (params.status === "working") {
          task.mainStatus = "open";
          task.v2Substatus = "working";
        } else if (params.status === "completed") {
          task.mainStatus = "closed";
          task.v2Substatus = "completed";
        } else if (params.status === "blocked") {
          task.mainStatus = "open";
          task.v2Substatus = "checkpoint";
        } else if (params.status === "assigned") {
          task.mainStatus = "open";
          task.v2Substatus = "assigned";
        } else if (params.status === "pending") {
          task.mainStatus = "open";
          task.v2Substatus = "pending";
        } else if (params.status === "cancelled") {
          task.mainStatus = "cancelled";
          task.v2Substatus = "archived";
        }
      }
    }
    if (params.substatus !== undefined) {
      task.substatus = params.substatus;
    }
    if (params.category !== undefined) {
      task.category = params.category;
    }
    if (params.assignees !== undefined) {
      task.assignees = params.assignees;
      if (!task.assignedAt) {
        task.assignedAt = now;
      }
    }
    if (params.title !== undefined) {
      task.title = params.title;
    }
    if (params.description !== undefined) {
      task.description = params.description;
    }
    if (params.priority !== undefined) {
      task.priority = params.priority;
    }
    if (params.targetPath !== undefined) {
      task.targetPath = params.targetPath;
    }
    if (params.summary !== undefined) {
      task.summary = params.summary;
    }
    if (params.reportPath) {
      // ファイル名で重複チェック（絶対パス/相対パスの違いを吸収）
      const newFileName = path.basename(params.reportPath);
      const isDuplicate = task.reportPaths.some((existing) => {
        const existingFileName = path.basename(existing);
        return existingFileName === newFileName;
      });
      if (!isDuplicate) {
        task.reportPaths.push(params.reportPath);
      }
    }
    if (params.reviewed !== undefined) {
      task.reviewed = params.reviewed;
      task.reviewedAt = params.reviewed ? now : null;
    }
    if (params.starred !== undefined) {
      task.starred = params.starred;
      task.starredAt = params.starred ? now : null;
    }
    if (params.actionRequired !== undefined) {
      task.actionRequired = params.actionRequired;
      task.actionRequiredAt = params.actionRequired ? now : null;
    }

    // === V2.1 フィールドの更新 ===
    if (params.mainStatus !== undefined) {
      task.mainStatus = params.mainStatus;
      // closed に変更時は completedAt を設定
      if (params.mainStatus === "closed" && !task.completedAt) {
        task.completedAt = now;
      }
    }

    // V2.1: ステータス遷移バリデーション
    if (params.v2Substatus !== undefined) {
      const currentSubstatus = (task.v2Substatus || task.substatus || "pending") as TaskSubstatus;
      const operatorRole = params.agentId ? getAgentRole(params.agentId) : "maid";

      const validation = validateStatusTransition(
        currentSubstatus,
        params.v2Substatus,
        operatorRole
      );

      if (!validation.valid) {
        // 不正遷移: WARNログを出力
        logger.warn("Invalid status transition attempted", {
          taskId: task.id,
          currentStatus: currentSubstatus,
          attemptedStatus: params.v2Substatus,
          operator: params.agentId || "unknown",
          operatorRole,
          timestamp: now,
          error: validation.error,
        });
        // 不正遷移は無視し、ステータスは変更しない
        // ただし、他のフィールド更新は継続
      } else {
        // 正常遷移: 既存の更新処理を実行
        task.v2Substatus = params.v2Substatus;
        // V2.1 substatus が設定されたら、後方互換の status/substatus も更新
        task.substatus = params.v2Substatus;
        // V2.1 → 旧ステータス変換
        if (params.v2Substatus === "completed" || params.v2Substatus === "archived") {
          task.status = "completed";
          task.mainStatus = "closed";
          if (!task.completedAt) {
            task.completedAt = now;
          }
        } else if (params.v2Substatus === "working") {
          task.status = "working";
          task.mainStatus = "open";
          if (!task.startedAt) {
            task.startedAt = now;
          }
        } else if (params.v2Substatus === "assigned") {
          task.status = "assigned";
          task.mainStatus = "open";
        } else if (params.v2Substatus === "checkpoint" || params.v2Substatus === "waiting") {
          task.status = "blocked";
          task.mainStatus = "open";
        } else if (params.v2Substatus === "pending") {
          task.status = "pending";
          task.mainStatus = "open";
        }
      }
    }
    if (params.type !== undefined) {
      task.type = params.type;
    }
    if (params.size !== undefined && task.type === "task") {
      task.size = params.size;
    }
    if (params.tentative !== undefined && task.type === "task") {
      task.tentative = params.tentative;
    }
    if (params.blockedBy !== undefined) {
      task.blockedBy = params.blockedBy;
    }
    if (params.artifacts !== undefined) {
      task.artifacts = params.artifacts;
    }
    if (params.artifactAdd !== undefined) {
      if (!task.artifacts) {
        task.artifacts = [];
      }
      task.artifacts.push(params.artifactAdd);
    }
    if (params.reviewStatus !== undefined) {
      task.reviewStatus = params.reviewStatus;
    }
    if (params.archived !== undefined) {
      task.archived = params.archived;
      task.archivedAt = params.archived ? now : null;
    }

    // 最終更新日時を自動設定
    task.updatedAt = now;

    const result: UpdateTaskResult = { success: true, task };
    return { data, result: { result, prevStatus, prevAssignees } };
  });

  const { result, prevStatus, prevAssignees } = lockResult;

  // Phase 2: 副作用実行（tasks.yaml ロック外）
  if (result.success && result.task) {
    try {
      const { executeSideEffects } = await import("./task-side-effects.js");
      const sideEffects = await executeSideEffects(
        projectPath, result.task, params, prevStatus, prevAssignees
      );
      result.sideEffects = sideEffects;

      // archivePath を tasks.yaml の reportPaths に追加（再ロック）
      if (sideEffects.archivePath) {
        try {
          await withTasksLock(projectPath, async (data) => {
            const task = data.tasks.find((t) => t.id === params.taskId);
            if (task) {
              const newFileName = path.basename(sideEffects.archivePath!);
              const isDuplicate = task.reportPaths.some((existing) => {
                const existingFileName = path.basename(existing);
                return existingFileName === newFileName;
              });
              if (!isDuplicate) {
                task.reportPaths.push(sideEffects.archivePath!);
              }
            }
            return { data, result: null };
          });
        } catch (error) {
          logger.error("Failed to add archivePath to reportPaths", error instanceof Error ? error : { error });
        }
      }
    } catch (error) {
      logger.error("Failed to execute side effects", error instanceof Error ? error : { error });
    }

    // V2.1: タスク完了時に依存タスクを自動解消
    // status=completed または v2Substatus=completed の場合
    const isCompleted =
      params.status === "completed" ||
      params.v2Substatus === "completed";

    if (isCompleted) {
      try {
        const dependencyResult = await resolveBlockedTasks(projectPath, params.taskId);

        // 解消されたタスクがある場合、sideEffects に追加
        if (dependencyResult.unblockedTasks.length > 0) {
          result.sideEffects = result.sideEffects || {};
          result.sideEffects.dependencyResolved = true;
          result.sideEffects.unblockedTasks = dependencyResult.unblockedTasks;
        }
      } catch (error) {
        logger.error("Failed to resolve blocked tasks", error instanceof Error ? error : { error });
      }
    }

    // V2.1: 子タスク完了時に親タスクを再帰的に自動クローズ
    // Step完了→親Work、Work完了→親Task、さらに祖先まで連鎖
    if (isCompleted && result.task && result.task.parentId) {
      try {
        const autoCloseResult = await checkAndAutoCloseParent(projectPath, params.taskId);
        if (autoCloseResult.autoClosedIds.length > 0) {
          result.sideEffects = result.sideEffects || {};
          result.sideEffects.autoClosedParents = autoCloseResult.autoClosedIds;
          // 後方互換: 最初にクローズされた親を goalAutoClosed に設定
          result.sideEffects.goalAutoClosed = autoCloseResult.autoClosedIds[0];
        }
      } catch (error) {
        logger.error("Failed to auto-close parent tasks", error instanceof Error ? error : { error });
      }
    }
  }

  return result;
}
