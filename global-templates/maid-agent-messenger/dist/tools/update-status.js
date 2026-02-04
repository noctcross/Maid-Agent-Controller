/**
 * update_status ツール（STDIOモード用ラッパー）
 *
 * 自分のタスクステータスを更新
 */
import { z } from "zod";
import { MAID_IDS, UPDATABLE_STATUSES } from "../types/index.js";
import { executeUpdateStatus } from "../services/index.js";
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    MAID_STATUS: ".maid-agent/system/data/maid",
    CURRENT_REPORTS: ".maid-agent/system/data/reports", // 作業中レポート（中間ファイル）
    ARCHIVE_REPORTS: ".maid-agent/master/reports", // 完了レポート
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
        try {
            const result = await executeUpdateStatus({
                queueMaidPath: PATHS.MAID_STATUS,
                currentReportsPath: PATHS.CURRENT_REPORTS,
                archiveReportsPath: PATHS.ARCHIVE_REPORTS,
                agentId: agent_id,
                status,
                summary,
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
