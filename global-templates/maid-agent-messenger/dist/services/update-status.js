/**
 * update_status ビジネスロジック
 *
 * タスクステータスを更新する処理
 * completed時のレポートローテーションも含む
 * Phase 3: tasks.yaml への同期も追加
 */
import path from "path";
import { readYamlFile, writeYamlFile, getTimestamp, fileExists, sanitizeDescription, copyFile, } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
import { executeUpdateTask } from "./task-manager.js";
/**
 * ステータスを更新
 */
export async function executeUpdateStatus(params) {
    const { queueMaidPath, reportsPath, agentId, status, summary } = params;
    const filePath = path.join(queueMaidPath, `${agentId}.yaml`);
    const timestamp = getTimestamp();
    return await withFileLock(filePath, async () => {
        // YAML読み込み
        const task = await readYamlFile(filePath);
        const updatedFields = ["status"];
        // ステータス更新
        task.status = status;
        // working に変更時、started_at を設定
        if (status === "working" && !task.started_at) {
            task.started_at = timestamp;
            updatedFields.push("started_at");
        }
        // completed に変更時、completed_at を設定 + レポートリネーム + tasks.yaml同期
        if (status === "completed") {
            task.completed_at = timestamp;
            updatedFields.push("completed_at");
            // レポートファイルのアーカイブ（コピーして保存、currentは残す）
            let archivePath;
            if (task.task_id) {
                const currentPath = path.join(reportsPath, `current_${agentId}.md`);
                const description = sanitizeDescription(task.description);
                // task_id を正規化
                // 1. 先頭の "task-" を全て除去（複数回出現しても対応）
                // 2. 末尾の "-{agentId}" を除去（重複防止）
                const taskIdNormalized = String(task.task_id)
                    .replace(/^(task-)+/i, "")
                    .replace(new RegExp(`-${agentId}$`, "i"), "");
                archivePath = path.join(reportsPath, `task-${taskIdNormalized}-${agentId}-${description}.md`);
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
                }
                catch {
                    // tasks.yaml が存在しない場合などはスキップ（後方互換性のため）
                    // エラーログは出さない（tasks.yamlが未導入の環境でも動作するため）
                }
            }
        }
        // サマリがあれば追加
        if (summary) {
            task.completion_summary = summary;
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
