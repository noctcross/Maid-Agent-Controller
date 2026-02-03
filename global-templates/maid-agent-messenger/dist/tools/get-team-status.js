/**
 * get_team_status ツール（STDIOモード用ラッパー）
 *
 * 全メイドのステータス一覧を取得
 * Phase 3: フィルタ対応（status, agentId, includeCompleted）
 */
import { z } from "zod";
import { executeGetTeamStatus } from "../services/index.js";
import { MAID_IDS } from "../types/index.js";
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
};
export function registerGetTeamStatus(server) {
    server.tool("get_team_status", "全メイドのステータス一覧を取得します（メイド長・執事用）。フィルタ・完了タスク取得対応。", {
        status: z
            .array(z.string())
            .optional()
            .describe("ステータスでフィルタ（例: [\"working\", \"blocked\"]）"),
        agentId: z
            .enum(MAID_IDS)
            .optional()
            .describe("特定のエージェントのみ取得"),
        includeCompleted: z
            .number()
            .optional()
            .describe("直近N件の完了タスクを含める（tasks.yamlから取得）"),
    }, async ({ status, agentId, includeCompleted }) => {
        try {
            const result = await executeGetTeamStatus({
                queueMaidPath: PATHS.QUEUE_MAID,
                filter: {
                    status,
                    agentId,
                    includeCompleted,
                },
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
                            error: "チームステータス取得に失敗しました",
                            details: message,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
}
