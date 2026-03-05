/**
 * タスク自動クローズ・依存解消処理
 *
 * - 子タスク完了時の親タスク自動クローズ
 * - 依存タスク完了時のブロック解消
 *
 * task-manager.ts から責務分割のため分離。
 */

import type {
  Task,
} from "../types/task-manager-types.js";
import { getTimestamp } from "../utils/yaml-helper.js";
import { withTasksLock, loadTasksReadOnly } from "./task-core.js";
import { inferTaskType, convertToV2Status } from "./task-v2-migration.js";

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
 * タスク完了時に依存しているタスクを自動的に waiting → assigned に更新
 *
 * V2.1 設計書より:
 * 1. タスクA完了: maidctl my-status completed
 * 2. システムが blockedBy を検索
 * 3. タスクBが blockedBy: ["A"] を持つ場合
 *    → タスクBの担当者に自動通知
 *    → タスクBの substatus を waiting → assigned に更新
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

      // blockedBy が空になったら waiting → assigned に変更
      if (task.blockedBy.length === 0 && task.v2Substatus === "waiting") {
        task.v2Substatus = "assigned";
        task.substatus = "assigned";
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
 * V2.1: Goal の自動クローズ判定
 *
 * 条件:
 * - 全Phaseが completed
 * - レビューPhaseが存在する場合は approved
 * - 除外カテゴリなし (skill_candidate, improvement)
 * - actionRequired フラグ付きタスクは別途管理
 */
export async function checkGoalAutoClose(
  projectPath: string,
  goalId: string
): Promise<{ canAutoClose: boolean; reason?: string }> {
  const data = await loadTasksReadOnly(projectPath);

  const goal = data.tasks.find((t) => t.id === goalId);
  if (!goal) {
    return { canAutoClose: false, reason: "Task not found" };
  }

  if (inferTaskType(goal) !== "task") {
    return { canAutoClose: false, reason: "Not a task" };
  }

  // 除外カテゴリチェック（V2.1: action_required は actionRequired フラグに移行）
  if (["skill_candidate", "improvement"].includes(goal.category)) {
    return { canAutoClose: false, reason: `Excluded category: ${goal.category}` };
  }

  // tentative Task は手動クローズ
  if (goal.tentative) {
    return { canAutoClose: false, reason: "Tentative task requires manual close" };
  }

  // simple Task (Work省略) は手動クローズ
  if (goal.size === "simple") {
    return { canAutoClose: false, reason: "Simple task requires manual close" };
  }

  // 子Workを取得
  const phases = data.tasks.filter(
    (t) => t.parentId === goalId && inferTaskType(t) === "work"
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

/**
 * 子タスク完了時に親タスクを再帰的に自動クローズ
 *
 * 処理フロー:
 * 1. タスクが completed になったとき
 * 2. 親タスクを取得
 * 3. 親の全子タスクが completed かチェック
 * 4. 全完了なら親も completed に変更
 * 5. 再帰的に祖先までチェック
 *
 * @param projectPath プロジェクトパス
 * @param completedTaskId 完了したタスクのID
 * @returns 自動クローズされた親タスクのID配列
 */
export async function checkAndAutoCloseParent(
  projectPath: string,
  completedTaskId: string
): Promise<{ autoClosedIds: string[] }> {
  const autoClosedIds: string[] = [];

  // 再帰的に親をチェック
  let currentTaskId = completedTaskId;

  while (true) {
    const data = await loadTasksReadOnly(projectPath);
    const currentTask = data.tasks.find((t) => t.id === currentTaskId);

    if (!currentTask || !currentTask.parentId) {
      // 親がない場合は終了
      break;
    }

    const parentId = currentTask.parentId;
    const parent = data.tasks.find((t) => t.id === parentId);

    if (!parent) {
      break;
    }

    // 親がすでに完了している場合はスキップ
    const { substatus: parentSubstatus } = convertToV2Status(parent);
    if (parentSubstatus === "completed" || parentSubstatus === "archived") {
      // 親がすでに完了していても、さらに上の親をチェック
      currentTaskId = parentId;
      continue;
    }

    // 除外条件チェック
    // 1. stepRequired フラグがある場合は自動クローズしない
    if (parent.stepRequired) {
      break;
    }

    // 2. category が skill_candidate/improvement の場合は自動クローズしない
    if (["skill_candidate", "improvement"].includes(parent.category)) {
      break;
    }

    // 3. tentative Task は手動クローズ
    if (parent.tentative) {
      break;
    }

    // 4. simple Task (Work省略) は手動クローズ
    if (parent.size === "simple") {
      break;
    }

    // 親の全子タスクを取得
    const siblings = data.tasks.filter((t) => t.parentId === parentId);

    if (siblings.length === 0) {
      break;
    }

    // 全子タスクが completed かチェック
    const allSiblingsCompleted = siblings.every((s) => {
      const { substatus } = convertToV2Status(s);
      return substatus === "completed" || substatus === "archived";
    });

    if (!allSiblingsCompleted) {
      // 全子が完了していない場合は終了
      break;
    }

    // レビューが必要な子タスクの approved チェック（reviewStatus がある場合）
    const reviewSiblings = siblings.filter((s) => s.reviewStatus !== undefined);
    if (reviewSiblings.length > 0) {
      const allReviewsApproved = reviewSiblings.every((s) => s.reviewStatus === "approved");
      if (!allReviewsApproved) {
        break;
      }
    }

    // 親を自動クローズ
    await withTasksLock(projectPath, async (lockData) => {
      const parentTask = lockData.tasks.find((t) => t.id === parentId);
      if (parentTask) {
        const now = getTimestamp();
        parentTask.mainStatus = "closed";
        parentTask.v2Substatus = "completed";
        parentTask.status = "completed";
        parentTask.completedAt = now;
        parentTask.updatedAt = now;
      }
      return { data: lockData, result: null };
    });

    autoClosedIds.push(parentId);

    // 次の親をチェック
    currentTaskId = parentId;
  }

  return { autoClosedIds };
}
