/**
 * MCP Streamable HTTP エンドポイント
 * POST /mcp, GET /mcp, DELETE /mcp
 */
import { Router } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionInfo } from "../middleware/session-manager.js";
export type { SessionInfo };
export interface McpRoutesDeps {
    sessions: Map<string, SessionInfo>;
    createMcpServer: (projectPath: string) => McpServer;
}
export declare function createMcpRoutes(deps: McpRoutesDeps): Router;
