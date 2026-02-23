/**
 * セッション管理・リクエストヘルパー
 * SessionInfo, sessions Map, getProjectPathFromRequest
 */
import type { Request } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { InMemoryEventStore } from "./event-store.js";
/**
 * MCPセッション情報
 */
export interface SessionInfo {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    projectPath: string;
    createdAt: Date;
    lastActivity: Date;
    missedPings: number;
    pingTimer?: ReturnType<typeof setInterval>;
    eventStore?: InMemoryEventStore;
}
/**
 * セッションID -> SessionInfo のマップ
 */
export declare const sessions: Map<string, SessionInfo>;
/**
 * リクエストヘッダーからプロジェクトパスを取得する共通ヘルパー
 */
/**
 * アイドル状態のセッションをクリーンアップ
 * @returns 削除されたセッション数
 */
export declare function cleanupIdleSessions(idleTimeoutMs: number): Promise<number>;
/**
 * プロジェクトパスが有効か検証する
 * .maid-agent/ ディレクトリの存在を確認
 * @returns エラーメッセージ。有効な場合は null
 */
export declare function validateProjectPath(projectPath: string): string | null;
export declare function getProjectPathFromRequest(req: Request): string;
