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
export declare const sessions: Map<string, SessionInfo>;
/**
 * リクエストヘッダーからプロジェクトパスを取得する共通ヘルパー
 */
export declare function getProjectPathFromRequest(req: Request): string;
