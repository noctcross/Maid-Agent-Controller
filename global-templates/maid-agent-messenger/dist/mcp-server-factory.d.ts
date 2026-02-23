/**
 * MCP Server ファクトリ関数
 * 各セッションごとに新しい McpServer を作成
 * projectPath を受け取って動的にパスを解決
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function createMcpServer(projectPath: string): McpServer;
