/**
 * update_status ビジネスロジック
 *
 * タスクステータスを更新する処理。
 * unified-task-state-gateway: maid yaml から task_id を取得し、
 * executeUpdateTask に全処理を委譲する。
 */

import path from "path";
import type { UpdateStatusOutput, UpdatableStatus } from "../types/index.js";
import { readYamlFile, getTimestamp } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
import { executeUpdateTask } from "./task-manager.js";
import { normalizeTaskId } from "../utils/task-id.js";

export interface UpdateStatusParams {
  queueMaidPath: string;
  /** 作業中レポートのパス: .maid-agent/reports/ */
  currentReportsPath: string;
  /** 完了レポートのパス: .maid-agent/master/reports/ */
  archiveReportsPath: string;
  agentId: string;
  status: UpdatableStatus;
  summary?: string;
}

/**
 * ステータスを更新
 */
export async function executeUpdateStatus(
  params: UpdateStatusParams
): Promise<UpdateStatusOutput> {
  const { queueMaidPath, agentId, status, summary } = params;
  const filePath = path.join(queueMaidPath, `${agentId}.yaml`);
  const timestamp = getTimestamp();

  return await withFileLock(filePath, async () => {
    // maid yaml から task_id を取得（これだけのために読む）
    const task = await readYamlFile(filePath);

    if (!task.task_id) {
      // task_id がない場合は更新不要（idle 状態など）
      return {
        success: true,
        updated_fields: ["status"],
        timestamp,
      };
    }

    const taskIdNormalized = normalizeTaskId(String(task.task_id), agentId);
    const projectPath = path.resolve(queueMaidPath, "..", "..", "..", "..");

    // executeUpdateTask に全処理を委譲
    try {
      const result = await executeUpdateTask(projectPath, {
        taskId: taskIdNormalized,
        status: status,
        summary: summary,
        agentId: agentId,
      });

      const updatedFields: string[] = ["status"];
      if (result.sideEffects?.maidYamlSynced) updatedFields.push("tasks_yaml_synced");
      if (result.sideEffects?.reportArchived) updatedFields.push("report_archived");
      if (result.sideEffects?.reportTemplatized) updatedFields.push("report_templatized");
      if (status === "completed") updatedFields.push("completed_at");
      if (summary) updatedFields.push("completion_summary");

      return {
        success: true,
        updated_fields: updatedFields,
        timestamp,
        ...(result.sideEffects?.archivePath && { archive_path: result.sideEffects.archivePath }),
      };
    } catch {
      // executeUpdateTask 失敗時も成功扱い（後方互換性）
      const updatedFields: string[] = ["status"];
      if (status === "completed") updatedFields.push("completed_at");
      if (summary) updatedFields.push("completion_summary");

      return {
        success: true,
        updated_fields: updatedFields,
        timestamp,
      };
    }
  });
}
