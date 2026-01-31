"use strict";
/**
 * assign_task ツール
 *
 * メイドにタスクを割り当て（メイド長専用）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAssignTask = registerAssignTask;
const zod_1 = require("zod");
const index_js_1 = require("../types/index.js");
const yaml_helper_js_1 = require("../utils/yaml-helper.js");
const file_lock_js_1 = require("../utils/file-lock.js");
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
};
function registerAssignTask(server) {
    server.tool("assign_task", "メイドにタスクを割り当てます（メイド長専用）", {
        task_id: zod_1.z.string().describe("タスクID（例: task-025-001）"),
        target_agent: zod_1.z
            .enum(index_js_1.MAID_IDS)
            .describe("割り当て先エージェント（例: emma, flora）"),
        description: zod_1.z
            .string()
            .max(500)
            .describe("タスク説明（500文字以内）"),
        target_path: zod_1.z
            .string()
            .optional()
            .describe("作業対象パス（オプション）"),
    }, async ({ task_id, target_agent, description, target_path }) => {
        const filePath = `${PATHS.QUEUE_MAID}/${target_agent}.yaml`;
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        try {
            const result = await (0, file_lock_js_1.withFileLock)(filePath, async () => {
                // YAML読み込み
                const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
                // 作業中の場合は警告
                if (task.status === "working") {
                    return {
                        success: false,
                        assigned_to: target_agent,
                        task_id: task.task_id || "",
                        error: `${target_agent} は現在作業中です（${task.task_id}）`,
                    };
                }
                // 新しいタスクを設定
                task.task_id = task_id;
                task.description = description;
                task.target_path = target_path || null;
                task.status = "assigned";
                task.substatus = null;
                task.assigned_at = timestamp;
                task.started_at = null;
                task.completed_at = null;
                // YAML書き込み
                await (0, yaml_helper_js_1.writeYamlFile)(filePath, task);
                return {
                    success: true,
                    assigned_to: target_agent,
                    task_id,
                };
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                isError: !result.success,
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
                            assigned_to: target_agent,
                            task_id,
                            error: `タスク割り当てに失敗しました: ${message}`,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=assign-task.js.map