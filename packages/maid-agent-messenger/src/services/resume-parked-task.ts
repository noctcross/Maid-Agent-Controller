/**
 * resume_parked_task ビジネスロジック（task-1688-2・案B）
 *
 * パーク中タスクを maid yaml のアクティブスロットへ再開（昇格）する。
 * tasks.yaml 側のstatus遷移（blocked→working）は対象外——それは引き続き
 * メイド自身が `maidctl set my-status working` で行う（update-status.ts は無改修）。
 * 本関数は「メイドのアクティブスロットがどのタスクを指すか」というローカルな
 * スワップ・昇格のみを担う。
 *
 * 優先順位のブレ防止: 自動昇格は一切行わない。チーフが明示的にこの関数（コマンド）を
 * 呼んだときのみ再開が発生する。
 */

import path from "path";
import type { ParkedTask, TaskYaml } from "../types/index.js";
import { toMaidTaskStatus } from "../types/index.js";
import { readYamlFile, writeYamlFile, getTimestamp } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
import { executeGetTask } from "./task-manager.js";
import type { Task, TaskSummary } from "./task-manager.js";
import { normalizeTaskId } from "../utils/task-id.js";

/**
 * executeGetTask は summaryOnly 未指定時（本モジュールの呼び出し方）は必ず
 * 完全な Task を返すが、戻り値の静的型は Task | TaskSummary の合併型のまま。
 * TaskSummary には無い description で判定して狭める。
 */
function isFullTask(task: Task | TaskSummary): task is Task {
  return "description" in task;
}

export interface ResumeParkedTaskParams {
  queueMaidPath: string;
  projectPath: string;
  agentId: string;
  /** 再開対象のパーク中タスクID */
  taskId: string;
}

export interface ResumeParkedTaskOutput {
  success: boolean;
  agent_id: string;
  task_id: string;
  error?: string;
}

export async function executeResumeParkedTask(
  params: ResumeParkedTaskParams
): Promise<ResumeParkedTaskOutput> {
  const { queueMaidPath, projectPath, agentId, taskId } = params;
  const filePath = path.join(queueMaidPath, `${agentId}.yaml`);
  const taskIdNormalized = normalizeTaskId(taskId);
  const fullTaskId = `task-${taskIdNormalized}`;

  let output: ResumeParkedTaskOutput | null = null;

  await withFileLock(filePath, async () => {
    const maidYaml = await readYamlFile(filePath);
    const parkedTasks = maidYaml.parked_tasks ?? [];
    const parkedIndex = parkedTasks.findIndex((p) => p.task_id === fullTaskId);

    if (parkedIndex === -1) {
      output = {
        success: false,
        agent_id: agentId,
        task_id: fullTaskId,
        error: `${agentId} のパーク中タスクに ${fullTaskId} が見つかりません。`,
      };
      return;
    }

    // アクティブタスクが進行中（working）の場合は再開を拒否する（安全側。強制中断はしない）
    if (maidYaml.status === "working") {
      output = {
        success: false,
        agent_id: agentId,
        task_id: fullTaskId,
        error: `${agentId} は現在 ${maidYaml.task_id} で作業中です。完了を待ってから再開してください。`,
      };
      return;
    }

    // 再開対象タスクの最新情報を tasks.yaml から取得する（title/description/target_path等の
    // 鮮度を保証するため、パーク時点のスナップショット=ParkedTaskではなく都度再取得する）
    const taskResult = await executeGetTask(projectPath, { taskId: taskIdNormalized });
    if (!taskResult.task || !isFullTask(taskResult.task)) {
      output = {
        success: false,
        agent_id: agentId,
        task_id: fullTaskId,
        error: `タスク #${fullTaskId} が tasks.yaml に見つかりません。`,
      };
      return;
    }
    const freshTask = taskResult.task;

    const nextParkedTasks: ParkedTask[] = parkedTasks.filter((_, i) => i !== parkedIndex);

    // アクティブタスクが blocked の場合のみ、現在のアクティブタスクをパークへ退避する
    // （idle=task_id無し／completed=既に完了済み、のいずれもスワップ不要でそのまま昇格）
    if (maidYaml.status === "blocked" && maidYaml.task_id) {
      nextParkedTasks.push({
        task_id: maidYaml.task_id,
        title: maidYaml.title,
        substatus: maidYaml.substatus,
        parked_at: getTimestamp(),
      });
    }

    const updated: TaskYaml = {
      ...maidYaml,
      task_id: fullTaskId,
      title: freshTask.title,
      description: freshTask.description,
      target_path: freshTask.targetPath ?? null,
      status: toMaidTaskStatus(freshTask.status),
      substatus: freshTask.substatus,
      assigned_at: freshTask.assignedAt,
      started_at: freshTask.startedAt,
      completed_at: freshTask.completedAt,
      completion_summary: freshTask.summary,
      parked_tasks: nextParkedTasks,
    };

    await writeYamlFile(filePath, updated);

    output = {
      success: true,
      agent_id: agentId,
      task_id: fullTaskId,
    };
  });

  return output!;
}
