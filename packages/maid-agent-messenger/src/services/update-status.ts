/**
 * update_status ビジネスロジック
 *
 * タスクステータスを更新する処理
 * completed時のレポートローテーションも含む
 * Phase 3: tasks.yaml への同期も追加
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
import { executeUpdateTask } from "./task-manager.js";

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
  const { queueMaidPath, currentReportsPath, archiveReportsPath, agentId, status, summary } = params;
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

    // blocked/working 時の tasks.yaml 同期
    if ((status === "blocked" || status === "working") && task.task_id) {
      const taskIdNormalized = String(task.task_id)
        .replace(/^(task-)+/i, "")
        .replace(new RegExp(`-${agentId}$`, "i"), "");
      const projectPath = path.resolve(queueMaidPath, "..", "..", "..", "..");
      try {
        await executeUpdateTask(projectPath, {
          taskId: taskIdNormalized,
          status: status,
          summary: summary,
        });
        updatedFields.push("tasks_yaml_synced");
      } catch {
        // tasks.yaml 未導入環境への後方互換
      }
    }

    // completed に変更時、completed_at を設定 + レポートリネーム + tasks.yaml同期
    // archivePathはreturnで使うのでwithFileLockスコープ内で宣言
    let archivePath: string | undefined;
    if (status === "completed") {
      task.completed_at = timestamp;
      updatedFields.push("completed_at");

      // レポートファイルのアーカイブ（currentReportsPathからarchiveReportsPathへコピー）
      if (task.task_id) {
        // 作業中レポート: .maid-agent/reports/current_{agentId}.md
        const currentPath = path.join(currentReportsPath, `current_${agentId}.md`);
        // ファイル名にはtitleを使用（後方互換: titleがなければdescriptionを使用）
        const titleForFilename = sanitizeDescription(task.title || task.description);
        // task_id を正規化
        // 1. 先頭の "task-" を全て除去（複数回出現しても対応）
        // 2. 末尾の "-{agentId}" を除去（重複防止）
        const taskIdNormalized = String(task.task_id)
          .replace(/^(task-)+/i, "")
          .replace(new RegExp(`-${agentId}$`, "i"), "");
        // 完了レポート: .maid-agent/master/reports/task-{id}-{agentId}-{title}.md
        archivePath = path.join(
          archiveReportsPath,
          `task-${taskIdNormalized}-${agentId}-${titleForFilename}.md`
        );

        if (await fileExists(currentPath)) {
          const copied = await copyFile(currentPath, archivePath);
          if (copied) {
            updatedFields.push("report_archived");
          }
        }

        // Phase 3: tasks.yaml への同期
        // maidStatusPath から projectPath を導出（.maid-agent/system/data/maid の4階層上）
        const projectPath = path.resolve(queueMaidPath, "..", "..", "..", "..");
        try {
          await executeUpdateTask(projectPath, {
            taskId: taskIdNormalized,
            status: "completed",
            summary: summary,
            reportPath: archivePath,
          });
          updatedFields.push("tasks_yaml_synced");
        } catch {
          // tasks.yaml が存在しない場合などはスキップ（後方互換性のため）
          // エラーログは出さない（tasks.yamlが未導入の環境でも動作するため）
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
      ...(archivePath && { archive_path: archivePath }),
    };
  });
}
