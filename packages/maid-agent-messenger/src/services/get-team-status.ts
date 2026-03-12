/**
 * get_team_status ビジネスロジック
 *
 * 全メイドのステータス一覧を取得する処理
 * フィルタ対応（status, agentId, includeCompleted）
 */

import path from "path";
import { MAID_IDS, type AgentStatus, type GetTeamStatusOutput } from "../types/index.js";
import { readYamlFile, getTimestamp, fileExists } from "../utils/yaml-helper.js";
import { executeListTasks, type Task, type TaskStatus } from "./task-manager.js";

export interface GetTeamStatusParams {
  queueMaidPath: string;
  // フィルタオプション
  filter?: {
    status?: string[];
    agentId?: string;
    includeCompleted?: number;  // 直近N件の完了タスクを含む
    summaryOnly?: boolean;  // true: 軽量版（recentCompletedを省略）
  };
}

export interface ExtendedGetTeamStatusOutput extends GetTeamStatusOutput {
  recentCompleted?: Task[];
}

/**
 * チームステータスを取得
 * フィルタ対応（status, agentId, includeCompleted）
 */
export async function executeGetTeamStatus(
  params: GetTeamStatusParams
): Promise<ExtendedGetTeamStatusOutput> {
  const { queueMaidPath, filter } = params;
  const timestamp = getTimestamp();
  let agents: AgentStatus[] = [];
  const summary: Record<string, number> = {};

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
        // チーム状態詳細化用フィールド
        started_at: task.started_at || null,
        task_title: task.title || null,
        task_description: task.description || null,
        substatus: task.substatus || null,
      });

      summary[status] = (summary[status] || 0) + 1;
    } catch {
      agents.push({ id, status: "error", task_id: null });
      summary["error"] = (summary["error"] || 0) + 1;
    }
  }

  // statusフィルタ適用
  if (filter?.status && filter.status.length > 0) {
    agents = agents.filter((agent) => filter.status!.includes(agent.status));
  }

  // includeCompleted: 直近N件の完了タスクを取得
  let recentCompleted: Task[] | undefined;
  if (filter?.includeCompleted && filter.includeCompleted > 0) {
    try {
      // maidStatusPath から projectPath を導出（.maid-agent/system/data/maid の4階層上）
      const projectPath = path.resolve(queueMaidPath, "..", "..", "..", "..");
      const completedResult = await executeListTasks(projectPath, {
        status: ["completed"] as TaskStatus[],
        limit: filter.includeCompleted,
        sortField: "createdAt",
        sortOrder: "desc",
      });
      recentCompleted = completedResult.tasks as Task[];
    } catch {
      // tasks.yaml が存在しない場合などはスキップ
      recentCompleted = [];
    }
  }

  const result: ExtendedGetTeamStatusOutput = {
    timestamp,
    summary,
    agents,
  };

  if (recentCompleted !== undefined) {
    result.recentCompleted = recentCompleted;
  }

  return result;
}
