/**
 * get_team_status ビジネスロジック
 *
 * 全メイドのステータス一覧を取得する処理
 */

import path from "path";
import { MAID_IDS, type AgentStatus, type GetTeamStatusOutput } from "../types/index.js";
import { readYamlFile, getTimestamp, fileExists } from "../utils/yaml-helper.js";

export interface GetTeamStatusParams {
  queueMaidPath: string;
}

/**
 * チームステータスを取得
 */
export async function executeGetTeamStatus(
  params: GetTeamStatusParams
): Promise<GetTeamStatusOutput> {
  const { queueMaidPath } = params;
  const timestamp = getTimestamp();
  const agents: AgentStatus[] = [];
  const summary: Record<string, number> = {};

  // 全メイドのステータスを取得
  for (const id of MAID_IDS) {
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
    } catch {
      agents.push({ id, status: "error", task_id: null });
      summary["error"] = (summary["error"] || 0) + 1;
    }
  }

  return {
    timestamp,
    summary,
    agents,
  };
}
