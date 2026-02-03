/**
 * get_team_status ツール（STDIOモード用ラッパー）
 *
 * 全メイドのステータス一覧を取得
 * Phase 3: フィルタ対応（status, agentId, includeCompleted）
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerGetTeamStatus(server: McpServer): void;
