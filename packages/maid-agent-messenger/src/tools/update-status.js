"use strict";
/**
 * update_status ツール
 *
 * 自分のタスクステータスを更新
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUpdateStatus = registerUpdateStatus;
const zod_1 = require("zod");
const index_js_1 = require("../types/index.js");
const yaml_helper_js_1 = require("../utils/yaml-helper.js");
const file_lock_js_1 = require("../utils/file-lock.js");
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
};
function registerUpdateStatus(server) {
    server.tool("update_status", "自分のタスクステータスを更新します", {
        agent_id: zod_1.z
            .enum(index_js_1.MAID_IDS)
            .describe("エージェントID（例: emma, flora）"),
        status: zod_1.z
            .enum(index_js_1.UPDATABLE_STATUSES)
            .describe("新しいステータス（working, completed, blocked）"),
        summary: zod_1.z
            .string()
            .max(100)
            .optional()
            .describe("作業サマリ（100文字以内、オプション）"),
    }, async ({ agent_id, status, summary }) => {
        const filePath = `${PATHS.QUEUE_MAID}/${agent_id}.yaml`;
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        try {
            const result = await (0, file_lock_js_1.withFileLock)(filePath, async () => {
                // YAML読み込み
                const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
                const updatedFields = ["status"];
                // ステータス更新
                task.status = status;
                // working に変更時、started_at を設定
                if (status === "working" && !task.started_at) {
                    task.started_at = timestamp;
                    updatedFields.push("started_at");
                }
                // completed に変更時、completed_at を設定
                if (status === "completed") {
                    task.completed_at = timestamp;
                    updatedFields.push("completed_at");
                }
                // サマリがあれば追加
                if (summary) {
                    task.completion_summary = summary;
                    updatedFields.push("completion_summary");
                }
                // YAML書き込み
                await (0, yaml_helper_js_1.writeYamlFile)(filePath, task);
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
//# sourceMappingURL=update-status.js.map