/**
 * MCP Streamable HTTP エンドポイント
 * POST /mcp, GET /mcp, DELETE /mcp
 */
import { Router } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionInfo } from "../middleware/session-manager.js";
import type { KeepAliveManager } from "../middleware/keepalive-manager.js";
export type { SessionInfo };
export interface McpRoutesDeps {
    sessions: Map<string, SessionInfo>;
    createMcpServer: (projectPath: string) => McpServer;
    keepAliveManager?: KeepAliveManager;
}
export declare function createMcpRoutes(deps: McpRoutesDeps): Router;
