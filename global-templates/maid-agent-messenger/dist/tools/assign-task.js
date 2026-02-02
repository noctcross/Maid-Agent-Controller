/**
 * assign_task ツール（STDIOモード用ラッパー）
 *
 * メイドにタスクを割り当て（メイド長専用）
 */
import { z } from "zod";
import { MAID_IDS } from "../types/index.js";
import { executeAssignTask } from "../services/index.js";
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
    REPORTS: ".maid-agent/reports",
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
        try {
            const result = await executeAssignTask({
                queueMaidPath: PATHS.QUEUE_MAID,
                reportsPath: PATHS.REPORTS,
                taskId: task_id,
                targetAgent: target_agent,
                description,
                targetPath: target_path,
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
