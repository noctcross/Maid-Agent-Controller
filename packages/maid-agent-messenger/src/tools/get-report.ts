/**
 * get_report ツール（STDIOモード用ラッパー）
 *
 * タスクのレポートファイル内容を取得（執事・メイド長用）
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeGetReport } from "../services/index.js";

export function registerGetReport(server: McpServer, projectPath: string): void {
  server.tool(
    "get_report",
    "タスクのレポートファイル内容を取得します（執事・メイド長用）",
    {
      taskId: z
        .string()
        .describe("タスクID（例: 040, 040-1）"),
      limit: z
        .number()
        .optional()
        .describe("行数制限（省略時は全行返却）"),
    },
    async ({ taskId, limit }) => {
      try {
        const result = await executeGetReport(projectPath, { taskId, limit });

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
                error: "レポート取得に失敗しました",
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
