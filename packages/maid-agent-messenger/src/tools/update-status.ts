/**
 * update_status ツール
 *
 * 自分のタスクステータスを更新
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MAID_IDS,
  UPDATABLE_STATUSES,
  type UpdateStatusOutput,
} from "../types/index.js";
import {
  readYamlFile,
  writeYamlFile,
  getTimestamp,
} from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";

// STDIO モード用パス（カレントディレクトリ = プロジェクトディレクトリ）
const PATHS = {
  QUEUE_MAID: ".maid-agent/queue/maid",
} as const;

export function registerUpdateStatus(server: McpServer): void {
  server.tool(
    "update_status",
    "自分のタスクステータスを更新します",
    {
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
    },
    async ({ agent_id, status, summary }) => {
      const filePath = `${PATHS.QUEUE_MAID}/${agent_id}.yaml`;
      const timestamp = getTimestamp();

      try {
        const result = await withFileLock(filePath, async () => {
          // YAML読み込み
          const task = await readYamlFile(filePath);
          const updatedFields: string[] = ["status"];

          // ステータス更新
          task.status = status;

          // working に変更時、started_at を設定
          if (status === "working" && !task.started_at) {
            task.started_at = timestamp;
            updatedFields.push("started_at");
          }

          // completed に変更時、completed_at を設定
          if (status === "completed") {
            task.completed_at = timestamp;
            updatedFields.push("completed_at");
          }

          // サマリがあれば追加
          if (summary) {
            (task as unknown as Record<string, unknown>).completion_summary = summary;
            updatedFields.push("completion_summary");
          }

          // YAML書き込み
          await writeYamlFile(filePath, task);

          return {
            success: true,
            updated_fields: updatedFields,
            timestamp,
          } satisfies UpdateStatusOutput;
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
                success: false,
                error: "ステータス更新に失敗しました",
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
