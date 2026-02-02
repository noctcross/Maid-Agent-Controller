/**
 * update_status ビジネスロジック
 *
 * タスクステータスを更新する処理
 * completed時のレポートローテーションも含む
 */

import path from "path";
import type { UpdateStatusOutput, UpdatableStatus } from "../types/index.js";
import {
  readYamlFile,
  writeYamlFile,
  getTimestamp,
  fileExists,
  sanitizeDescription,
  copyFile,
} from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";

export interface UpdateStatusParams {
  queueMaidPath: string;
  reportsPath: string;
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
  const { queueMaidPath, reportsPath, agentId, status, summary } = params;
  const filePath = path.join(queueMaidPath, `${agentId}.yaml`);
  const timestamp = getTimestamp();

  return await withFileLock(filePath, async () => {
    // YAML読み込み
    const task = await readYamlFile(filePath);
    const updatedFields: string[] = ["status"];

    // ステータス更新
    task.status = status;

    // working に変更時、started_at を設定
    if (status === "working" && !task.started_at) {
      task.started_at = timestamp;
      updatedFields.push("started_at");
    }

    // completed に変更時、completed_at を設定 + レポートリネーム
    if (status === "completed") {
      task.completed_at = timestamp;
      updatedFields.push("completed_at");

      // レポートファイルのアーカイブ（コピーして保存、currentは残す）
      if (task.task_id) {
        const currentPath = path.join(reportsPath, `current_${agentId}.md`);
        const description = sanitizeDescription(task.description);
        const archivePath = path.join(
          reportsPath,
          `task-${task.task_id}-${agentId}-${description}.md`
        );

        if (await fileExists(currentPath)) {
          const copied = await copyFile(currentPath, archivePath);
          if (copied) {
            updatedFields.push("report_archived");
          }
        }
      }
    }

    // サマリがあれば追加
    if (summary) {
      (task as unknown as Record<string, unknown>).completion_summary = summary;
      updatedFields.push("completion_summary");
    }

    // YAML書き込み
    await writeYamlFile(filePath, task);

    return {
      success: true,
      updated_fields: updatedFields,
      timestamp,
    };
  });
}
