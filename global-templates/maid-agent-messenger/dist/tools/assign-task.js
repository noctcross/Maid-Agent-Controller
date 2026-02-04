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
    MAID_STATUS: ".maid-agent/system/data/maid",
    CURRENT_REPORTS: ".maid-agent/system/data/reports", // 作業中レポート（中間ファイル）
    // テンプレートは CURRENT_REPORTS と同じ場所
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
                queueMaidPath: PATHS.MAID_STATUS,
                currentReportsPath: PATHS.CURRENT_REPORTS,
                templatePath: PATHS.CURRENT_REPORTS, // テンプレートは作業中レポートと同じ場所
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
