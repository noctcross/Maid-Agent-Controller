/**
 * get_my_task ツール
 *
 * 自分に割り当てられたタスク情報を取得
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MAID_IDS, type GetMyTaskOutput } from "../types/index.js";
import { readYamlFile, getFirstLine, fileExists } from "../utils/yaml-helper.js";

// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
  QUEUE_MAID: ".maid-agent/queue/maid",
} as const;

export function registerGetMyTask(server: McpServer): void {
  server.tool(
    "get_my_task",
    "自分に割り当てられたタスク情報を取得します",
    {
      agent_id: z
        .enum(MAID_IDS)
        .describe("エージェントID（例: emma, flora）"),
    },
    async ({ agent_id }) => {
      const filePath = `${PATHS.QUEUE_MAID}/${agent_id}.yaml`;

      try {
        // ファイル存在確認
        if (!(await fileExists(filePath))) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  task_id: null,
                  description: null,
                  target_path: null,
                  status: "idle",
                  assigned_at: null,
                  started_at: null,
                  message: "タスクファイルが見つかりません",
                } satisfies GetMyTaskOutput & { message: string }),
              },
            ],
          };
        }

        // YAML読み込み
        const task = await readYamlFile(filePath);

        // 必要な情報のみ抽出（トークン削減）
        const result: GetMyTaskOutput = {
          task_id: task.task_id || null,
          description: getFirstLine(task.description), // 1行目のみ
          target_path: task.target_path || null,
          status: task.status || "idle",
          assigned_at: task.assigned_at || null,
          started_at: task.started_at || null,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "タスク取得に失敗しました",
                details: message,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
