/**
 * get_team_status ツール
 *
 * 全メイドのステータス一覧を取得
 */
import { MAID_IDS, } from "../types/index.js";
import { readYamlFile, getTimestamp, fileExists } from "../utils/yaml-helper.js";
// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
    QUEUE_MAID: ".maid-agent/queue/maid",
};
export function registerGetTeamStatus(server) {
    server.tool("get_team_status", "全メイドのステータス一覧を取得します（メイド長・執事用）", {}, async () => {
        const timestamp = getTimestamp();
        const agents = [];
        const summary = {};
        try {
            // 全メイドのステータスを取得
            for (const id of MAID_IDS) {
                const filePath = `${PATHS.QUEUE_MAID}/${id}.yaml`;
                try {
                    if (!(await fileExists(filePath))) {
                        agents.push({ id, status: "unknown", task_id: null });
                        summary["unknown"] = (summary["unknown"] || 0) + 1;
                        continue;
                    }
                    const task = await readYamlFile(filePath);
                    const status = task.status || "idle";
                    agents.push({
                        id,
                        status,
                        task_id: task.task_id || null,
                    });
                    summary[status] = (summary[status] || 0) + 1;
                }
                catch {
                    agents.push({ id, status: "error", task_id: null });
                    summary["error"] = (summary["error"] || 0) + 1;
                }
            }
            const result = {
                timestamp,
                summary,
                agents,
            };
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
