/**
 * assign_task ビジネスロジック
 *
 * メイドにタスクを割り当てる処理。
 * unified-task-state-gateway: ガード条件のみ担当し、
 * executeUpdateTask に全処理を委譲する。
 */

import path from "path";
import type { AssignTaskOutput } from "../types/index.js";
import { readYamlFile } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
import { executeUpdateTask, executeGetTask, executeGetTaskChildren } from "./task-manager.js";
import { normalizeTaskId } from "../utils/task-id.js";

export interface AssignTaskParams {
  queueMaidPath: string;
  /** 作業中レポートのパス: .maid-agent/reports/ */
  currentReportsPath: string;
  /** テンプレートのパス: .maid-agent/master/reports/ */
  templatePath: string;
  taskId: string;
  targetAgent: string;
  title: string;          // タスクタイトル（短い概要）
  description?: string;   // タスク説明（詳細、省略可）
  targetPath?: string;
  force?: boolean;        // 既存の割り当てを上書きする場合は true
}

/**
 * タスクを割り当て
 */
export async function executeAssignTask(
  params: AssignTaskParams
): Promise<AssignTaskOutput> {
  const { queueMaidPath, taskId, targetAgent, title, description, targetPath, force } = params;
  const filePath = path.join(queueMaidPath, `${targetAgent}.yaml`);

  // ガード条件: maid yaml を読んで作業中かチェック
  // ※ ロックはガードチェックのみで解放する。executeUpdateTask の副作用
  //    (syncMaidYaml) が同じ maid yaml をロックするため、ネストするとデッドロックになる。
  const maidTask = await withFileLock(filePath, async () => {
    return await readYamlFile(filePath);
  });

  if (maidTask.status === "working") {
    return {
      success: false,
      assigned_to: targetAgent,
      task_id: maidTask.task_id || "",
      error: `${targetAgent} は現在作業中です（${maidTask.task_id}）`,
    };
  }

  // executeUpdateTask に全処理を委譲（maid yaml ロック解放済み）
  const projectPath = path.resolve(queueMaidPath, "..", "..", "..", "..");
  const taskIdNormalized = normalizeTaskId(taskId);

  // 存在チェック: 未 create の subtask ID を拒否（subtask-creation-rule.md 機械強制化・Q-5-3）
  const taskResult = await executeGetTask(projectPath, { taskId: taskIdNormalized });
  if (!taskResult.task) {
    return {
      success: false,
      assigned_to: targetAgent,
      task_id: taskId,
      error: `タスク #${taskId} が見つかりません。先に maidctl create task --parent で作成してください。`,
    };
  }

  // 前タスクID流用警告: 既に completed のタスクへの再アサインは、
  // 新規サブタスクを create せず古い ID を使い回した可能性がある（subtask-creation-rule.md 想定事故）
  let warning: string | undefined;
  if (taskResult.task.status === "completed") {
    warning = `タスク #${taskId} は既に completed です。前タスクIDの流用ではないか確認してください（新規サブタスクは maidctl create task --parent で作成）。`;
  }

  // 既存 assignees チェック
  if (taskResult.task && taskResult.task.assignees && taskResult.task.assignees.length > 0) {
    if (!force) {
      const existingAgents = taskResult.task.assignees.map(a => a.agentId).join(", ");
      return {
        success: false,
        assigned_to: targetAgent,
        task_id: taskId,
        error: `タスク #${taskId} には既に ${existingAgents} が割り当てられています。上書きする場合は --force オプション（または force: true パラメータ）を使用してください。`,
      };
    }
    // force=true の場合は上書きを許可（既存ロジックへ進む）
  }

  // 子タスクが存在する親Taskへのアサインチェック
  const childTasks = await executeGetTaskChildren(projectPath, taskIdNormalized);
  if (childTasks.length > 0 && !force) {
    const childIds = childTasks.map(c => c.id).join(", ");
    return {
      success: false,
      assigned_to: targetAgent,
      task_id: taskId,
      error: `タスク #${taskId} には子タスクが存在します（${childIds}）。子タスクにアサインするか、--force オプションを使用してください。`,
    };
  }

  const result = await executeUpdateTask(projectPath, {
    taskId: taskIdNormalized,
    status: "assigned",
    assignees: [{ agentId: targetAgent, role: null, subTaskId: null }],
    description: description,
    targetPath: targetPath,
  });

  if (!result.success) {
    return {
      success: false,
      assigned_to: targetAgent,
      task_id: taskId,
      error: "tasks.yaml更新失敗",
    };
  }

  return {
    success: true,
    assigned_to: targetAgent,
    task_id: taskId,
    warning,
  };
}
