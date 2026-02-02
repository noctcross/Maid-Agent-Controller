/**
 * update_status ツール
 *
 * 自分のタスクステータスを更新
 */
import { z } from "zod";
import { MAID_IDS, UPDATABLE_STATUSES, } from "../types/index.js";
import { readYamlFile, writeYamlFile, getTimestamp, fileExists, sanitizeDescription, renameFile, } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
    REPORTS: ".maid-agent/reports",
};
export function registerUpdateStatus(server) {
    server.tool("update_status", "自分のタスクステータスを更新します", {
        agent_id: z
            .enum(MAID_IDS)
            .describe("エージェントID（例: emma, flora）"),
        status: z
            .enum(UPDATABLE_STATUSES)
            .describe("新しいステータス（working, completed, blocked）"),
        summary: z
            .string()
            .max(100)
            .optional()
            .describe("作業サマリ（100文字以内、オプション）"),
    }, async ({ agent_id, status, summary }) => {
        const filePath = `${PATHS.QUEUE_MAID}/${agent_id}.yaml`;
        const timestamp = getTimestamp();
        try {
            const result = await withFileLock(filePath, async () => {
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
                // completed に変更時、completed_at を設定 + レポートリネーム
                if (status === "completed") {
                    task.completed_at = timestamp;
                    updatedFields.push("completed_at");
                    // レポートファイルのリネーム
                    if (task.task_id) {
                        const currentPath = `${PATHS.REPORTS}/current_${agent_id}.md`;
                        const description = sanitizeDescription(task.description);
                        const newPath = `${PATHS.REPORTS}/task-${task.task_id}-${agent_id}-${description}.md`;
                        if (await fileExists(currentPath)) {
                            const renamed = await renameFile(currentPath, newPath);
                            if (renamed) {
                                updatedFields.push("report_renamed");
                            }
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
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "ステータス更新に失敗しました",
                            details: message,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
}
