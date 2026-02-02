/**
 * get_my_task ツール（STDIOモード用ラッパー）
 *
 * 自分に割り当てられたタスク情報を取得
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MAID_IDS } from "../types/index.js";
import { executeGetMyTask } from "../services/index.js";

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
      try {
        const result = await executeGetMyTask({
          queueMaidPath: PATHS.QUEUE_MAID,
          agentId: agent_id,
        });

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
