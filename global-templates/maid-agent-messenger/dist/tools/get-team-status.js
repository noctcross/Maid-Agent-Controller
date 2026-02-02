/**
 * get_team_status ツール（STDIOモード用ラッパー）
 *
 * 全メイドのステータス一覧を取得
 */
import { executeGetTeamStatus } from "../services/index.js";
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
};
export function registerGetTeamStatus(server) {
    server.tool("get_team_status", "全メイドのステータス一覧を取得します（メイド長・執事用）", {}, async () => {
        try {
            const result = await executeGetTeamStatus({
                queueMaidPath: PATHS.QUEUE_MAID,
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
