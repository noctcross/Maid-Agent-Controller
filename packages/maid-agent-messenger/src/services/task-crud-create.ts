/**
 * タスク作成操作
 *
 * task-crud.ts から分割。Create 操作を提供。
 *
 * @module task-crud-create
 */

import type {
  Task,
  TaskCategory,
  TaskType,
  TaskSubstatus,
  TaskSize,
} from "../types/task-manager-types.js";
import { getTimestamp } from "../utils/yaml-helper.js";
import { withTasksLock } from "./task-core.js";

// === Create操作 ===

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

        // 祖先が improvement カテゴリの場合 → task に昇格
        // 子タスク（Work）が発行されたことで、改善提案から通常タスクに昇格
        if (ancestorTask.category === "improvement") {
          ancestorTask.category = "task";
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
