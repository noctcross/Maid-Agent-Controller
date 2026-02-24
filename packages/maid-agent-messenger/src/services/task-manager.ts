/**
 * タスク管理サービス
 *
 * MCPタスク管理システムのコアロジック
 * tasks.yaml を単一ファイルで管理
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { parse } from "yaml";
import { withFileLock } from "../utils/file-lock.js";
import { getTimestamp, fileExists, stringifyYaml } from "../utils/yaml-helper.js";

// === 型定義 ===

// 後方互換: 旧ステータス
export type TaskStatus =
  | "pending"
  | "assigned"
  | "working"
  | "completed"
  | "blocked"
  | "cancelled";

// V2.1: タスク種別
export type TaskType = "goal" | "phase" | "action" | "investigation";

// V2.1: メインステータス（open/closed/cancelled）
export type TaskMainStatus = "open" | "closed" | "cancelled";

// V2.1: サブステータス
export type TaskSubstatus =
  | "active"
  | "paused"
  | "checkpoint"
  | "waiting"
  | "completed"
  | "archived";

// V2.1: Goal サイズ
export type GoalSize = "simple" | "standard" | "complex";

// V2.1: レビューステータス
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected";

// V2.1: Retention レベル
export type RetentionLevel = "L1" | "L2" | "L3";

// V2.1: 成果物
export interface TaskArtifact {
  type: string;                    // summary, design, report, etc.
  path: string;                    // 相対パス
  base?: "temporary" | "permanent"; // ベースディレクトリ
  retention: RetentionLevel;
}

export interface Assignee {
  agentId: string;
  role: string | null;
  subTaskId: string | null;
}

export type TaskCategory = "task" | "action_required" | "skill_candidate" | "improvement";

export interface Task {
  id: string;
  parentId: string | null;
  title: string;           // タスクタイトル（短い概要）
  description: string;     // タスク説明（詳細）
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  substatus: string | null;
  category: TaskCategory;
  assignees: Assignee[];
  targetPath?: string | null;     // 作業対象パス（optional for backward compat）
  createdAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;           // 最終更新日時
  reportPaths: string[];
  summary: string | null;
  reviewed?: boolean;        // チェック済みフラグ（完了タスク用）
  starred?: boolean;         // スター付きフラグ（完了タスク用）
  reviewedAt?: string | null;  // チェック日時
  starredAt?: string | null;   // スター日時
  escalation?: boolean;          // エスカレーションフラグ（ご主人様判断待ち）
  escalatedAt?: string | null;   // エスカレーション日時

  // === V2.1 拡張フィールド ===
  type?: TaskType;                  // goal/phase/action/investigation (default: action)
  mainStatus?: TaskMainStatus;      // open/closed (V2.1ステータス)
  v2Substatus?: TaskSubstatus;      // V2.1サブステータス
  size?: GoalSize;                  // simple/standard/complex (Goal only)
  tentative?: boolean;              // 暫定Goal (Goal only)
  blockedBy?: string[];             // 依存先タスクID (waiting時)
  artifacts?: TaskArtifact[];       // 成果物リスト
  reviewStatus?: ReviewStatus;      // pending/in_review/approved/rejected

  // === V2.1: アーカイブフラグ（独立フラグ） ===
  archived?: boolean;               // アーカイブ済み（デフォルト: false）
  archivedAt?: string | null;       // アーカイブ日時
}

/**
 * 軽量版タスク（summaryOnly: true 時に返却）
 */
export interface TaskSummary {
  id: string;
  parentId: string | null;
  title: string;
  status: TaskStatus;
  priority: "high" | "medium" | "low";
  category: TaskCategory;
  assignees: Assignee[];
}

export interface TasksData {
  lastTaskNumber: number;
  tasks: Task[];
}

// === ファイルパス ===

const getTasksFilePath = (projectPath: string): string => {
  return path.join(projectPath, ".maid-agent", "system", "data", "tasks.yaml");
};

// === ファイルロック付き操作 ===

/**
 * YAMLコンテンツをパースしてバリデーション
 */
function parseTasksData(content: string): TasksData {
  try {
    const data = parse(content) as TasksData;

    // バリデーション
    if (
      !data ||
      typeof data.lastTaskNumber !== "number" ||
      !Array.isArray(data.tasks)
    ) {
      throw new Error("Invalid tasks.yaml format");
    }

    // updatedAt マイグレーション（既存データの後方互換）
    for (const task of data.tasks) {
      if (!task.updatedAt) {
        const timestamps = [
          task.completedAt,
          task.starredAt,
          task.reviewedAt,
          task.escalatedAt,
          task.startedAt,
          task.assignedAt,
          task.createdAt,
        ].filter((t): t is string => t != null);
        task.updatedAt = timestamps.length > 0
          ? timestamps.sort().pop()!
          : task.createdAt;
      }
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to parse tasks.yaml: ${message}`);
  }
}

/**
 * 初期データを作成
 */
function createInitialData(): TasksData {
  return { lastTaskNumber: 0, tasks: [] };
}

/**
 * ファイルロックを取得してタスクデータを操作する
 * 読み取り→加工→書き込みを一貫したロックで保護
 */
async function withTasksLock<T>(
  projectPath: string,
  operation: (data: TasksData) => Promise<{ data: TasksData; result: T }>
): Promise<T> {
  const filePath = getTasksFilePath(projectPath);
  const dirPath = path.dirname(filePath);

  // ディレクトリ作成
  if (!fsSync.existsSync(dirPath)) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  // ファイルが存在しない場合は初期ファイル作成
  if (!(await fileExists(filePath))) {
    const initialContent = stringifyYaml(createInitialData());
    await fs.writeFile(filePath, initialContent, "utf-8");
  }

  // ファイルロックを取得して操作
  return withFileLock(
    filePath,
    async () => {
      // 読み取り
      const content = await fs.readFile(filePath, "utf-8");
      const data = parseTasksData(content);

      // 操作実行
      const { data: newData, result } = await operation(data);

      // 書き込み（統一設定: stringifyYaml 使用）
      const yamlContent = stringifyYaml(newData);
      await fs.writeFile(filePath, yamlContent, "utf-8");

      return result;
    },
    { retries: 5, stale: 10000 }
  );
}

/**
 * 読み取り専用（ロックなし）- 一覧表示など更新を伴わない場合
 */
async function loadTasksReadOnly(projectPath: string): Promise<TasksData> {
  const filePath = getTasksFilePath(projectPath);

  if (!(await fileExists(filePath))) {
    return createInitialData();
  }

  const content = await fs.readFile(filePath, "utf-8");
  return parseTasksData(content);
}

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
  size?: GoalSize;                  // simple/standard/complex (Goal only)
  tentative?: boolean;              // 暫定Goal (Goal only)
  blockedBy?: string[];             // 依存先タスクID
}

export interface CreateTaskResult {
  taskId: string;
  task: Task;
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
    if (params.parentId) {
      // サブタスクの場合: 親ID-連番
      const siblings = data.tasks.filter((t) => t.parentId === params.parentId);
      const nextSeq = siblings.length + 1;
      taskId = `${params.parentId}-${nextSeq}`;
    } else {
      // メインタスクの場合: 連番（3桁ゼロ埋め）
      data.lastTaskNumber += 1;
      taskId = String(data.lastTaskNumber).padStart(3, "0");
    }

    const now = getTimestamp();

    // V2.1: タスク種別の決定（デフォルト: action）
    const taskType = params.type || "action";

    // V2.1: 初期ステータスの設定
    // - blockedBy があれば waiting
    // - それ以外は active
    const hasBlockers = params.blockedBy && params.blockedBy.length > 0;
    const initialV2Substatus: TaskSubstatus = hasBlockers ? "waiting" : "active";

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
      size: taskType === "goal" ? (params.size || "standard") : undefined,
      tentative: taskType === "goal" ? (params.tentative || false) : undefined,
      blockedBy: params.blockedBy || [],
      artifacts: [],
      reviewStatus: undefined,
    };

    data.tasks.push(newTask);
    return { data, result: { taskId, task: newTask } };
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

export interface UpdateTaskParams {
  taskId: string;
  // --- 既存 ---
  status?: TaskStatus;
  substatus?: string;
  category?: TaskCategory;
  assignees?: Assignee[];
  summary?: string;
  reportPath?: string;
  reviewed?: boolean;
  starred?: boolean;
  escalation?: boolean;          // エスカレーションフラグ
  // --- 追加: unified-task-state-gateway ---
  description?: string;        // タスク説明（assign_task が独自の詳細説明を渡す場合に使用）
  targetPath?: string;         // 作業対象パス（assign_task からの伝達用）
  agentId?: string;            // 操作元メイドID（update_status からの伝達用）

  // === V2.1 拡張パラメータ ===
  mainStatus?: TaskMainStatus;     // open/closed
  v2Substatus?: TaskSubstatus;     // V2.1サブステータス
  type?: TaskType;                 // goal/phase/action/investigation
  size?: GoalSize;                 // simple/standard/complex (Goal only)
  tentative?: boolean;             // 暫定Goal (Goal only)
  blockedBy?: string[];            // 依存先タスクID
  artifacts?: TaskArtifact[];      // 成果物リスト
  artifactAdd?: TaskArtifact;      // 成果物追加
  reviewStatus?: ReviewStatus;     // pending/in_review/approved/rejected
  archived?: boolean;              // アーカイブフラグ（独立フラグ）
}

export interface SideEffectResults {
  maidYamlSynced?: boolean;
  reportArchived?: boolean;
  reportArchiveSkipped?: boolean;
  archiveSkipReason?: string;
  reportTemplatized?: boolean;
  archivePath?: string;
  // V2.1: 依存解消結果
  dependencyResolved?: boolean;
  unblockedTasks?: Array<{
    taskId: string;
    assignees: string[];
    previousSubstatus: string;
  }>;
  // V2.1: Goal自動クローズ結果
  goalAutoClosed?: string;
}

export interface UpdateTaskResult {
  success: boolean;
  task: Task | null;
  sideEffects?: SideEffectResults;
}

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
    if (params.description !== undefined) {
      task.description = params.description;
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
    if (params.escalation !== undefined) {
      task.escalation = params.escalation;
      task.escalatedAt = params.escalation ? now : null;
    }

    // === V2.1 フィールドの更新 ===
    if (params.mainStatus !== undefined) {
      task.mainStatus = params.mainStatus;
      // closed に変更時は completedAt を設定
      if (params.mainStatus === "closed" && !task.completedAt) {
        task.completedAt = now;
      }
    }
    if (params.v2Substatus !== undefined) {
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
      } else if (params.v2Substatus === "active") {
        task.status = "working";
        task.mainStatus = "open";
        if (!task.startedAt) {
          task.startedAt = now;
        }
      } else if (params.v2Substatus === "checkpoint" || params.v2Substatus === "waiting") {
        task.status = "blocked";
        task.mainStatus = "open";
      } else if (params.v2Substatus === "paused") {
        task.status = "pending";
        task.mainStatus = "open";
      }
    }
    if (params.type !== undefined) {
      task.type = params.type;
    }
    if (params.size !== undefined && task.type === "goal") {
      task.size = params.size;
    }
    if (params.tentative !== undefined && task.type === "goal") {
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
        } catch {
          // reportPaths 追加失敗は握りつぶす
        }
      }
    } catch {
      // 副作用全体の失敗は握りつぶす
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
      } catch {
        // 依存解消失敗は握りつぶす（メイン処理に影響させない）
      }
    }

    // V2.1: Phase完了時に親Goalの自動クローズ判定
    if (isCompleted && result.task) {
      const taskType = inferTaskType(result.task);
      if (taskType === "phase" && result.task.parentId) {
        try {
          const autoCloseResult = await checkGoalAutoClose(projectPath, result.task.parentId);
          if (autoCloseResult.canAutoClose) {
            // 親Goalを自動クローズ
            await withTasksLock(projectPath, async (data) => {
              const goal = data.tasks.find((t) => t.id === result.task!.parentId);
              if (goal) {
                goal.mainStatus = "closed";
                goal.v2Substatus = "completed";
                goal.status = "completed";
                goal.completedAt = getTimestamp();
                goal.updatedAt = getTimestamp();
              }
              return { data, result: null };
            });
            result.sideEffects = result.sideEffects || {};
            result.sideEffects.goalAutoClosed = result.task.parentId;
          }
        } catch {
          // Goal自動クローズ失敗は握りつぶす
        }
      }
    }
  }

  return result;
}

// =============================================================================
// V2.1: 依存解消自動通知機能
// =============================================================================

/**
 * 依存解消時の自動更新結果
 */
export interface DependencyResolutionResult {
  unblockedTasks: Array<{
    taskId: string;
    assignees: string[];
    previousSubstatus: string;
  }>;
}

/**
 * タスク完了時に依存しているタスクを自動的に waiting → active に更新
 *
 * V2.1 設計書より:
 * 1. タスクA完了: maidctl my-status completed
 * 2. システムが blockedBy を検索
 * 3. タスクBが blockedBy: ["A"] を持つ場合
 *    → タスクBの担当者に自動通知
 *    → タスクBの substatus を waiting → active に更新
 */
export async function resolveBlockedTasks(
  projectPath: string,
  completedTaskId: string
): Promise<DependencyResolutionResult> {
  const unblockedTasks: DependencyResolutionResult["unblockedTasks"] = [];

  await withTasksLock(projectPath, async (data) => {
    const now = getTimestamp();

    // blockedBy に completedTaskId を持つタスクを検索
    for (const task of data.tasks) {
      if (!task.blockedBy || !task.blockedBy.includes(completedTaskId)) {
        continue;
      }

      const previousSubstatus = task.v2Substatus || task.substatus || "";

      // blockedBy から completedTaskId を削除
      task.blockedBy = task.blockedBy.filter((id) => id !== completedTaskId);

      // blockedBy が空になったら waiting → active に変更
      if (task.blockedBy.length === 0 && task.v2Substatus === "waiting") {
        task.v2Substatus = "active";
        task.substatus = "active";
        task.status = "assigned"; // 旧ステータス互換
        task.mainStatus = "open";
        task.updatedAt = now;

        // 通知対象として記録
        unblockedTasks.push({
          taskId: task.id,
          assignees: task.assignees.map((a) => a.agentId),
          previousSubstatus,
        });
      }

      task.updatedAt = now;
    }

    return { data, result: null };
  });

  return { unblockedTasks };
}

/**
 * V2.1: タスク種別の判定（後方互換）
 * type が未設定の場合、parentId の有無で推定
 */
export function inferTaskType(task: Task): TaskType {
  if (task.type) {
    return task.type;
  }
  // 後方互換: parentId があればサブタスク（action）、なければ親タスク（goal）
  return task.parentId ? "action" : "goal";
}

/**
 * V2.1: ステータス変換（旧 → 新）
 */
export function convertToV2Status(task: Task): { mainStatus: TaskMainStatus; substatus: TaskSubstatus } {
  // 既にV2.1形式の場合
  if (task.mainStatus && task.v2Substatus) {
    return { mainStatus: task.mainStatus, substatus: task.v2Substatus };
  }

  // 旧ステータスから変換
  switch (task.status) {
    case "pending":
      return { mainStatus: "open", substatus: "paused" };
    case "assigned":
      return { mainStatus: "open", substatus: "active" };
    case "working":
      return { mainStatus: "open", substatus: "active" };
    case "completed":
      return { mainStatus: "closed", substatus: "completed" };
    case "blocked":
      // blockedBy の有無で checkpoint/waiting を判断
      if (task.blockedBy && task.blockedBy.length > 0) {
        return { mainStatus: "open", substatus: "waiting" };
      }
      return { mainStatus: "open", substatus: "checkpoint" };
    case "cancelled":
      return { mainStatus: "cancelled", substatus: "archived" };
    default:
      return { mainStatus: "open", substatus: "active" };
  }
}

/**
 * V2.1: Goal階層連動 - 子Phaseの状態から親Goalの表示ステータスを計算
 *
 * 設計書より:
 * - 全Phase pending → Goal「未着手」⏸️
 * - いずれかPhase assigned → Goal「準備中」📋
 * - いずれかPhase working → Goal「進行中」🔵
 * - いずれかPhase waiting/checkpoint → Goal「ブロック中」⚠️
 * - 全Phase completed → Goal「完了可能」✅
 */
export function computeGoalDisplayStatus(
  goalSubstatus: string,
  phases: Array<{ v2Substatus: string; mainStatus?: string }>
): { displayStatus: string; displayIcon: string } {
  // Phaseがない場合はGoal自身のステータスを使用
  if (phases.length === 0) {
    return mapSubstatusToDisplay(goalSubstatus);
  }

  const substatuses = phases.map((p) => p.v2Substatus);

  // ブロック中（waiting/checkpoint）を最優先
  if (substatuses.some((s) => s === "waiting" || s === "checkpoint")) {
    return { displayStatus: "ブロック中", displayIcon: "⚠️" };
  }

  // 全Phase完了
  if (phases.every((p) => p.v2Substatus === "completed" || p.mainStatus === "closed")) {
    return { displayStatus: "完了可能", displayIcon: "✅" };
  }

  // いずれかPhase working
  if (substatuses.some((s) => s === "working" || s === "active")) {
    return { displayStatus: "進行中", displayIcon: "🔵" };
  }

  // いずれかPhase assigned
  if (substatuses.some((s) => s === "assigned")) {
    return { displayStatus: "準備中", displayIcon: "📋" };
  }

  // 全Phase pending/paused
  if (substatuses.every((s) => s === "pending" || s === "paused")) {
    return { displayStatus: "未着手", displayIcon: "⏸️" };
  }

  // フォールバック
  console.warn(`[computeGoalDisplayStatus] Unexpected phase states: ${substatuses.join(", ")}, defaulting to 進行中`);
  return { displayStatus: "進行中", displayIcon: "🔵" };
}

/**
 * substatusを表示用ステータスにマッピング
 */
function mapSubstatusToDisplay(substatus: string): { displayStatus: string; displayIcon: string } {
  switch (substatus) {
    case "pending":
    case "paused":
      return { displayStatus: "未着手", displayIcon: "⏸️" };
    case "assigned":
      return { displayStatus: "準備中", displayIcon: "📋" };
    case "working":
    case "active":
      return { displayStatus: "進行中", displayIcon: "🔵" };
    case "waiting":
      return { displayStatus: "依存待ち", displayIcon: "⏳" };
    case "checkpoint":
      return { displayStatus: "確認待ち", displayIcon: "🔶" };
    case "completed":
      return { displayStatus: "完了", displayIcon: "✅" };
    case "archived":
      return { displayStatus: "アーカイブ", displayIcon: "📦" };
    default:
      return { displayStatus: "進行中", displayIcon: "🔵" };
  }
}

/**
 * V2.1: Goal の自動クローズ判定
 *
 * 条件:
 * - 全Phaseが completed
 * - レビューPhaseが存在する場合は approved
 * - 除外カテゴリなし (skill_candidate, improvement, action_required)
 */
export async function checkGoalAutoClose(
  projectPath: string,
  goalId: string
): Promise<{ canAutoClose: boolean; reason?: string }> {
  const data = await loadTasksReadOnly(projectPath);

  const goal = data.tasks.find((t) => t.id === goalId);
  if (!goal) {
    return { canAutoClose: false, reason: "Goal not found" };
  }

  if (inferTaskType(goal) !== "goal") {
    return { canAutoClose: false, reason: "Not a goal" };
  }

  // 除外カテゴリチェック
  if (["skill_candidate", "improvement", "action_required"].includes(goal.category)) {
    return { canAutoClose: false, reason: `Excluded category: ${goal.category}` };
  }

  // tentative Goal は手動クローズ
  if (goal.tentative) {
    return { canAutoClose: false, reason: "Tentative goal requires manual close" };
  }

  // simple Goal (Phase省略) は手動クローズ
  if (goal.size === "simple") {
    return { canAutoClose: false, reason: "Simple goal requires manual close" };
  }

  // 子Phaseを取得
  const phases = data.tasks.filter(
    (t) => t.parentId === goalId && inferTaskType(t) === "phase"
  );

  if (phases.length === 0) {
    return { canAutoClose: false, reason: "No phases found" };
  }

  // 全Phaseが completed かチェック
  const allPhasesCompleted = phases.every((p) => {
    const { substatus } = convertToV2Status(p);
    return substatus === "completed" || substatus === "archived";
  });

  if (!allPhasesCompleted) {
    return { canAutoClose: false, reason: "Not all phases completed" };
  }

  // レビューPhaseの approved チェック（reviewStatus がある場合）
  const reviewPhases = phases.filter((p) => p.reviewStatus !== undefined);
  if (reviewPhases.length > 0) {
    const allReviewsApproved = reviewPhases.every((p) => p.reviewStatus === "approved");
    if (!allReviewsApproved) {
      return { canAutoClose: false, reason: "Not all reviews approved" };
    }
  }

  return { canAutoClose: true };
}

// =============================================================================
// V2.1: ダッシュボードデータ生成
// =============================================================================

/**
 * V2.1 ダッシュボードデータ
 */
export interface V2DashboardData {
  v2Goals: V2GoalData[];
  v2ReviewQueue: V2ReviewTaskData[];
  v2Artifacts: V2ArtifactData[];
  v2Stats: V2StatsData;
  totalGoals: number;
}

export interface V2ActionData {
  id: string;
  title: string;
  type: "action";
  mainStatus: string;
  v2Substatus: string;
  assignees?: Array<{ agentId: string }>;
}

export interface V2PhaseData {
  id: string;
  title: string;
  type: "phase";
  mainStatus: string;
  v2Substatus: string;
  reviewStatus?: string;
  assignees?: Array<{ agentId: string }>;
  actions: V2ActionData[];
}

export interface V2GoalData {
  id: string;
  title: string;
  type: "goal";
  mainStatus: string;
  v2Substatus: string;
  size?: string;
  reviewStatus?: string;
  assignees: Array<{ agentId: string }>;
  phases: V2PhaseData[];
  // Goal階層連動: 子Phaseの状態から計算された表示用ステータス
  displayStatus?: string;
  displayIcon?: string;
  // V2.1: アーカイブフラグ
  archived?: boolean;
  // V2.1: 更新日時（ソート用）
  updatedAt?: string;
}

export interface V2ReviewTaskData {
  id: string;
  title: string;
  type: string;
  reviewStatus: string;
  priority: string;
  completedAt: string;
  assignees: Array<{ agentId: string }>;
}

export interface V2ArtifactData {
  path: string;
  type: string;
  retention: string;
  taskId: string;
  createdAt: string;
}

export interface V2StatsData {
  goalCount: number;
  phaseCount: number;
  actionCount: number;
  completedCount: number;
  actionRequiredCount: number;
  reviewPendingCount: number;
  proposalCount: number;
}

/**
 * V2.1 ダッシュボードデータ生成オプション
 */
export interface V2DashboardOptions {
  showArchived?: boolean;                      // アーカイブ済みを表示（デフォルト: false）
  statusFilter?: "open" | "closed" | "all";    // ステータスフィルタ（デフォルト: "open"）
  offset?: number;                              // ページネーション: オフセット
  limit?: number;                               // ページネーション: 件数（デフォルト: 10）
  sortField?: "id" | "updatedAt";              // ソートフィールド（デフォルト: "id"）
  sortOrder?: "asc" | "desc";                   // ソート順（デフォルト: "desc"）
}

/**
 * タスク一覧からV2.1ダッシュボードデータを生成
 */
export async function generateV2DashboardData(
  projectPath: string,
  options: V2DashboardOptions = {}
): Promise<V2DashboardData> {
  const { showArchived = false, statusFilter = "open", offset = 0, limit = 10, sortField = "id", sortOrder = "desc" } = options;
  const data = await loadTasksReadOnly(projectPath);
  const tasks = data.tasks;

  // タスクのMapを作成（親タスク参照用）
  const taskMap = new Map<string, Task>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  /**
   * タスク種別を判定（親タスクの情報も使用）
   * 1. type が 'goal', 'phase', 'investigation' の場合はそのまま使用
   * 2. type が 'action' または未設定の場合は親タスク構造で判定:
   *    - parentId がない → goal
   *    - parentId があり、親の parentId がない → phase（Goalの直接の子）
   *    - parentId があり、親の parentId もある → action（孫タスク）
   */
  function inferTypeWithContext(task: Task): TaskType {
    // type が 'goal', 'phase', 'investigation' の場合はそのまま使用
    if (task.type === "goal" || task.type === "phase" || task.type === "investigation") {
      return task.type;
    }
    // type が 'action' または未設定の場合は親タスク構造で判定
    if (!task.parentId) return "goal";
    // 親タスクを取得
    const parent = taskMap.get(task.parentId);
    // 親タスクが存在し、その親がない場合はphase（Goalの直接の子）
    if (parent && !parent.parentId) return "phase";
    // それ以外はaction（孫タスク）
    return "action";
  }

  // Goal/Phase/Action を分類
  const goals: Task[] = [];
  const phases: Task[] = [];
  const actions: Task[] = [];
  const investigations: Task[] = [];

  // Goal階層から除外するカテゴリ（提案・要対応は別パネルで表示）
  const excludedCategories = ["skill_candidate", "improvement", "action_required"];

  for (const task of tasks) {
    const taskType = inferTypeWithContext(task);
    switch (taskType) {
      case "goal":
        // 提案・要対応カテゴリはGoal階層から除外
        if (!excludedCategories.includes(task.category || "task")) {
          goals.push(task);
        }
        break;
      case "phase":
        phases.push(task);
        break;
      case "action":
        actions.push(task);
        break;
      case "investigation":
        investigations.push(task);
        break;
    }
  }

  // タスクID比較用ヘルパー（数値部分を考慮）
  const compareTaskIds = (idA: string, idB: string): number => {
    const partsA = idA.split("-");
    const partsB = idB.split("-");
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const pa = i < partsA.length ? parseInt(partsA[i], 10) : -1;
      const pb = i < partsB.length ? parseInt(partsB[i], 10) : -1;
      const numA = isNaN(pa) ? -1 : pa;
      const numB = isNaN(pb) ? -1 : pb;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  };

  // V2Goals: Goal階層構造を構築（ソートオプションに基づく）
  const v2Goals: V2GoalData[] = goals
    .sort((a, b) => {
      let cmp: number;
      if (sortField === "updatedAt") {
        const aTime = a.updatedAt || a.createdAt || "";
        const bTime = b.updatedAt || b.createdAt || "";
        cmp = aTime.localeCompare(bTime);
      } else {
        // デフォルト: id でソート
        cmp = compareTaskIds(a.id, b.id);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    })
    // archivedフィルタ: デフォルトでarchivedを除外
    .filter((g) => showArchived || g.archived !== true)
    // statusフィルタ: open/closed/all
    .filter((g) => {
      if (statusFilter === "all") return true;
      const { mainStatus } = convertToV2Status(g);
      if (statusFilter === "open") return mainStatus === "open";
      if (statusFilter === "closed") return mainStatus === "closed";
      return true;
    })
    .map((goal) => {
      const { mainStatus, substatus } = convertToV2Status(goal);

      // このGoalに属するPhaseを取得（updatedAt降順でソート）
      const goalPhases = phases
        .filter((p) => p.parentId === goal.id)
        .sort((a, b) => {
          const aTime = a.updatedAt || a.createdAt || "";
          const bTime = b.updatedAt || b.createdAt || "";
          return bTime.localeCompare(aTime);
        });

      const v2Phases: V2PhaseData[] = goalPhases.map((phase) => {
        const phaseStatus = convertToV2Status(phase);

        // このPhaseに属するActionを取得（updatedAt降順でソート）
        const phaseActions = actions
          .filter((a) => a.parentId === phase.id)
          .sort((a, b) => {
            const aTime = a.updatedAt || a.createdAt || "";
            const bTime = b.updatedAt || b.createdAt || "";
            return bTime.localeCompare(aTime);
          });

        const v2Actions: V2ActionData[] = phaseActions.map((action) => {
          const actionStatus = convertToV2Status(action);
          return {
            id: action.id,
            title: action.title || `Action #${action.id}`,
            type: "action" as const,
            mainStatus: actionStatus.mainStatus,
            v2Substatus: actionStatus.substatus,
            assignees: action.assignees?.map((a) => ({ agentId: a.agentId })),
          };
        });

        return {
          id: phase.id,
          title: phase.title || `Phase #${phase.id}`,
          type: "phase" as const,
          mainStatus: phaseStatus.mainStatus,
          v2Substatus: phaseStatus.substatus,
          reviewStatus: phase.reviewStatus,
          assignees: phase.assignees?.map((a) => ({ agentId: a.agentId })),
          actions: v2Actions,
        };
      });

      // Goal階層連動: 子Phaseの状態から表示ステータスを計算
      const { displayStatus, displayIcon } = computeGoalDisplayStatus(
        substatus,
        v2Phases.map((p) => ({ v2Substatus: p.v2Substatus, mainStatus: p.mainStatus }))
      );

      return {
        id: goal.id,
        title: goal.title || `Goal #${goal.id}`,
        type: "goal" as const,
        mainStatus,
        v2Substatus: substatus,
        size: goal.size,
        reviewStatus: goal.reviewStatus,
        assignees: goal.assignees?.map((a) => ({ agentId: a.agentId })) || [],
        phases: v2Phases,
        displayStatus,
        displayIcon,
        archived: goal.archived || substatus === "archived",
        updatedAt: goal.updatedAt,
      };
    });

  // ページネーション: totalGoals はフィルタリング後の件数
  const totalGoals = v2Goals.length;
  const paginatedV2Goals = v2Goals.slice(offset, offset + limit);

  // V2ReviewQueue: レビュー待ちタスク（updatedAt降順でソート）
  const v2ReviewQueue: V2ReviewTaskData[] = tasks
    .filter((t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review")
    .sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt || "";
      const bTime = b.updatedAt || b.createdAt || "";
      return bTime.localeCompare(aTime);
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      type: inferTaskType(task),
      reviewStatus: task.reviewStatus || "pending",
      priority: task.priority || "medium",
      completedAt: task.completedAt || "",
      assignees: task.assignees?.map((a) => ({ agentId: a.agentId })) || [],
    }));

  // V2Artifacts: 成果物一覧（createdAt降順でソート）
  const v2Artifacts: V2ArtifactData[] = [];
  for (const task of tasks) {
    if (task.artifacts && Array.isArray(task.artifacts)) {
      for (const artifact of task.artifacts) {
        v2Artifacts.push({
          path: artifact.path,
          type: artifact.type || "default",
          retention: artifact.retention || "L1",
          taskId: task.id,
          createdAt: task.createdAt,  // TaskArtifact には createdAt がないので task から取得
        });
      }
    }
  }
  // 成果物を作成日時の降順でソート
  v2Artifacts.sort((a, b) => {
    const aTime = a.createdAt || "";
    const bTime = b.createdAt || "";
    return bTime.localeCompare(aTime);
  });

  // V2Stats: 統計情報
  const completedCount = tasks.filter((t) => {
    const status = convertToV2Status(t);
    return status.substatus === "completed" || status.substatus === "archived";
  }).length;

  const actionRequiredCount = tasks.filter(
    (t) => t.category === "action_required" && t.status !== "completed"
  ).length;

  const reviewPendingCount = tasks.filter(
    (t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review"
  ).length;

  // 提案カウント: closed/cancelled/archivedを除外
  const proposalCount = tasks.filter((t) => {
    if (t.category !== "skill_candidate" && t.category !== "improvement") {
      return false;
    }
    // V1ステータスでの除外
    if (t.status === "completed" || t.status === "cancelled") {
      return false;
    }
    // アーカイブ済みを除外
    if (t.archived === true) {
      return false;
    }
    // V2.1ステータスでの除外（mainStatus: closed）
    const { mainStatus } = convertToV2Status(t);
    if (mainStatus === "closed") {
      return false;
    }
    return true;
  }).length;

  const v2Stats: V2StatsData = {
    goalCount: goals.length,
    phaseCount: phases.length,
    actionCount: actions.length + investigations.length,
    completedCount,
    actionRequiredCount,
    reviewPendingCount,
    proposalCount,
  };

  return {
    v2Goals: paginatedV2Goals,
    v2ReviewQueue,
    v2Artifacts,
    v2Stats,
    totalGoals,
  };
}

// =============================================================================
// V2.1: マイグレーション機能
// =============================================================================

/**
 * 旧ステータスから V2.1 ステータスへのマッピング
 *
 * 実装計画書 3.2 準拠
 */
export function mapLegacyToV2Status(
  legacyStatus: TaskStatus,
  legacySubstatus: string | null
): { mainStatus: TaskMainStatus; v2Substatus: TaskSubstatus } {
  switch (legacyStatus) {
    case "pending":
      return { mainStatus: "open", v2Substatus: "paused" };
    case "assigned":
      return { mainStatus: "open", v2Substatus: "active" };
    case "working":
      return { mainStatus: "open", v2Substatus: "active" };
    case "blocked":
      if (legacySubstatus === "waiting") {
        return { mainStatus: "open", v2Substatus: "waiting" };
      }
      return { mainStatus: "open", v2Substatus: "checkpoint" };
    case "completed":
      return { mainStatus: "closed", v2Substatus: "completed" };
    case "cancelled":
      return { mainStatus: "cancelled", v2Substatus: "archived" };
    default:
      console.warn(`[mapLegacyToV2Status] Unknown legacyStatus: ${legacyStatus}, defaulting to open/paused`);
      return { mainStatus: "open", v2Substatus: "paused" };
  }
}

/**
 * 単一タスクを V2.1 形式にマイグレーション
 *
 * 実装計画書 3.6 準拠
 * - 既に V2.1 形式の場合はそのまま返す
 * - archivedフラグを独立フラグとして設定
 */
export function migrateTaskToV2(task: Task): Task {
  // 既に V2.1 形式の場合はそのまま返す
  if (task.mainStatus && task.v2Substatus) {
    return task;
  }

  // 旧ステータスからV2.1ステータスへ変換
  const { mainStatus, v2Substatus } = mapLegacyToV2Status(
    task.status,
    task.substatus
  );

  // archivedフラグの決定
  // - 旧 substatus が "archived" の場合
  // - reviewed が true の場合（チェック済み完了タスク）
  const archived = task.substatus === "archived" || task.reviewed === true;

  // タスク種別の推定
  const type = task.type || inferTaskType(task);

  return {
    ...task,
    type,
    mainStatus,
    v2Substatus,
    archived,
    archivedAt: archived ? (task.reviewedAt || task.completedAt || null) : null,
    // Goal専用フィールドの初期化
    size: type === "goal" ? (task.size || "standard") : undefined,
    tentative: type === "goal" ? (task.tentative || false) : undefined,
    // 配列フィールドの初期化
    artifacts: task.artifacts || [],
    blockedBy: task.blockedBy || [],
  };
}

/**
 * マイグレーション結果
 */
export interface MigrationResult {
  totalTasks: number;
  migratedTasks: number;
  skippedTasks: number;
  details: Array<{
    taskId: string;
    action: "migrated" | "skipped";
    changes?: Record<string, unknown>;
    reason?: string;
  }>;
}

/**
 * 既存タスクを V2.1 形式にマイグレーション
 *
 * 設計書より:
 * 1. 既存タスクに type: action を付与（デフォルト）
 * 2. 親タスクを type: goal に変更
 * 3. サブタスクグループを type: phase に変更（直接の親が goal の場合）
 * 4. 調査系タスクを type: investigation に変更
 * 5. mainStatus/v2Substatus を旧 status から変換
 */
export async function migrateToV2(
  projectPath: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalTasks: 0,
    migratedTasks: 0,
    skippedTasks: 0,
    details: [],
  };

  await withTasksLock(projectPath, async (data) => {
    result.totalTasks = data.tasks.length;
    const now = getTimestamp();

    for (const task of data.tasks) {
      // 既に V2.1 形式の場合はスキップ
      if (task.type && task.mainStatus && task.v2Substatus) {
        result.skippedTasks++;
        result.details.push({
          taskId: task.id,
          action: "skipped",
          reason: "Already migrated",
        });
        continue;
      }

      const changes: Record<string, unknown> = {};

      // 1. type の決定
      if (!task.type) {
        if (!task.parentId) {
          // 親タスクなし → Goal
          task.type = "goal";
          changes.type = "goal";
        } else {
          // 親タスクあり
          const parent = data.tasks.find((t) => t.id === task.parentId);
          if (parent && !parent.parentId) {
            // 親が Goal (parentId なし) → 子は Phase の可能性
            // サブタスクがある場合は Phase、ない場合は Action
            const hasChildren = data.tasks.some((t) => t.parentId === task.id);
            if (hasChildren) {
              task.type = "phase";
              changes.type = "phase";
            } else {
              // タイトルに「調査」「分析」「リサーチ」が含まれる場合は Investigation
              const investigationKeywords = ["調査", "分析", "リサーチ", "research", "investigation", "analyze"];
              const titleLower = (task.title || "").toLowerCase();
              const descLower = (task.description || "").toLowerCase();
              const isInvestigation = investigationKeywords.some(
                (kw) => titleLower.includes(kw) || descLower.includes(kw)
              );
              task.type = isInvestigation ? "investigation" : "action";
              changes.type = task.type;
            }
          } else {
            // 孫タスク → Action
            task.type = "action";
            changes.type = "action";
          }
        }
      }

      // 2. mainStatus / v2Substatus の決定
      if (!task.mainStatus || !task.v2Substatus) {
        const { mainStatus, substatus } = convertToV2Status(task);
        task.mainStatus = mainStatus;
        task.v2Substatus = substatus;
        changes.mainStatus = mainStatus;
        changes.v2Substatus = substatus;
      }

      // 3. Goal 専用フィールドの初期化
      if (task.type === "goal") {
        if (task.size === undefined) {
          // 子タスク数から size を推定
          const children = data.tasks.filter((t) => t.parentId === task.id);
          const phaseCount = children.filter(
            (c) => c.type === "phase" || data.tasks.some((t) => t.parentId === c.id)
          ).length;

          if (phaseCount === 0 || phaseCount === 1) {
            task.size = "simple";
          } else if (phaseCount <= 4) {
            task.size = "standard";
          } else {
            task.size = "complex";
          }
          changes.size = task.size;
        }

        if (task.tentative === undefined) {
          task.tentative = false;
          changes.tentative = false;
        }
      }

      // 4. artifacts 初期化
      if (task.artifacts === undefined) {
        task.artifacts = [];
        changes.artifacts = [];
      }

      // 5. blockedBy 初期化
      if (task.blockedBy === undefined) {
        task.blockedBy = [];
        changes.blockedBy = [];
      }

      // 6. archived フラグの初期化（独立フラグ）
      // - 旧 substatus が "archived" の場合
      // - reviewed が true の場合（チェック済み完了タスク）
      if (task.archived === undefined) {
        const shouldArchive = task.substatus === "archived" || task.reviewed === true;
        task.archived = shouldArchive;
        task.archivedAt = shouldArchive ? (task.reviewedAt || task.completedAt || null) : null;
        if (shouldArchive) {
          changes.archived = true;
          changes.archivedAt = task.archivedAt;
        }
      }

      // 更新時刻
      if (Object.keys(changes).length > 0 && !options.dryRun) {
        task.updatedAt = now;
      }

      result.migratedTasks++;
      result.details.push({
        taskId: task.id,
        action: "migrated",
        changes,
      });
    }

    // dryRun の場合は変更を保存しない
    if (options.dryRun) {
      return { data: await loadTasksReadOnly(projectPath), result: null };
    }

    return { data, result: null };
  });

  return result;
}

/**
 * V2.1 マイグレーション状況の確認
 */
export async function checkMigrationStatus(
  projectPath: string
): Promise<{
  totalTasks: number;
  v2Tasks: number;
  legacyTasks: number;
  migrationRequired: boolean;
}> {
  const data = await loadTasksReadOnly(projectPath);

  let v2Tasks = 0;
  let legacyTasks = 0;

  for (const task of data.tasks) {
    if (task.type && task.mainStatus && task.v2Substatus) {
      v2Tasks++;
    } else {
      legacyTasks++;
    }
  }

  return {
    totalTasks: data.tasks.length,
    v2Tasks,
    legacyTasks,
    migrationRequired: legacyTasks > 0,
  };
}
