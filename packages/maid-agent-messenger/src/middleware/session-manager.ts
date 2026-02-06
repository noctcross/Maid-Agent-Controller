/**
 * セッション管理・リクエストヘルパー
 * SessionInfo, sessions Map, getProjectPathFromRequest
 */

import type { Request } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * MCPセッション情報
 */
export interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  projectPath: string;
}

/**
 * セッションID -> SessionInfo のマップ
 */
export const sessions = new Map<string, SessionInfo>();

/**
 * リクエストヘッダーからプロジェクトパスを取得する共通ヘルパー
 */
export function getProjectPathFromRequest(req: Request): string {
  const projectPath = req.headers["x-maid-project-path"] as string;
  if (!projectPath) {
    throw new Error("X-Maid-Project-Path header is required");
  }
  return projectPath;
}
