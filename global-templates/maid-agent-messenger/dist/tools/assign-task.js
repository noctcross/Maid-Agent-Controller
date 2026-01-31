/**
 * assign_task ツール
 *
 * メイドにタスクを割り当て（メイド長専用）
 */
import { z } from "zod";
import { MAID_IDS } from "../types/index.js";
import { readYamlFile, writeYamlFile, getTimestamp, } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
};
export function registerAssignTask(server) {
    server.tool("assign_task", "メイドにタスクを割り当てます（メイド長専用）", {
        task_id: z.string().describe("タスクID（例: task-025-001）"),
        target_agent: z
            .enum(MAID_IDS)
            .describe("割り当て先エージェント（例: emma, flora）"),
        description: z
            .string()
            .max(500)
            .describe("タスク説明（500文字以内）"),
        target_path: z
            .string()
            .optional()
            .describe("作業対象パス（オプション）"),
    }, async ({ task_id, target_agent, description, target_path }) => {
        const filePath = `${PATHS.QUEUE_MAID}/${target_agent}.yaml`;
        const timestamp = getTimestamp();
        try {
            const result = await withFileLock(filePath, async () => {
                // YAML読み込み
                const task = await readYamlFile(filePath);
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
                await writeYamlFile(filePath, task);
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
