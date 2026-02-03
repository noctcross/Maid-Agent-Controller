/**
 * get_team_status ビジネスロジック
 *
 * 全メイドのステータス一覧を取得する処理
 * Phase 3: フィルタ対応（status, agentId, includeCompleted）
 */
import path from "path";
import { MAID_IDS } from "../types/index.js";
import { readYamlFile, getTimestamp, fileExists } from "../utils/yaml-helper.js";
import { executeListTasks } from "./task-manager.js";
/**
 * チームステータスを取得
 * Phase 3: フィルタ対応
 */
export async function executeGetTeamStatus(params) {
    const { queueMaidPath, filter } = params;
    const timestamp = getTimestamp();
    let agents = [];
    const summary = {};
    // 対象メイドを決定（agentIdフィルタ）
    const targetIds = filter?.agentId
        ? MAID_IDS.filter((id) => id === filter.agentId)
        : MAID_IDS;
    // 全メイドのステータスを取得
    for (const id of targetIds) {
        const filePath = path.join(queueMaidPath, `${id}.yaml`);
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
    // statusフィルタ適用
    if (filter?.status && filter.status.length > 0) {
        agents = agents.filter((agent) => filter.status.includes(agent.status));
    }
    // includeCompleted: 直近N件の完了タスクを取得
    let recentCompleted;
    if (filter?.includeCompleted && filter.includeCompleted > 0) {
        try {
            // queueMaidPath から projectPath を導出
            const projectPath = path.resolve(queueMaidPath, "..", "..", "..");
            const completedResult = await executeListTasks(projectPath, {
                status: ["completed"],
                limit: filter.includeCompleted,
                sortField: "createdAt",
                sortOrder: "desc",
            });
            recentCompleted = completedResult.tasks;
        }
        catch {
            // tasks.yaml が存在しない場合などはスキップ
            recentCompleted = [];
        }
    }
    const result = {
        timestamp,
        summary,
        agents,
    };
    if (recentCompleted !== undefined) {
        result.recentCompleted = recentCompleted;
    }
    return result;
}
