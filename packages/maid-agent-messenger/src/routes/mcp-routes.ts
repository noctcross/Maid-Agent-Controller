/**
 * MCP Streamable HTTP エンドポイント
 * POST /mcp, GET /mcp, DELETE /mcp
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  projectPath: string;
}

export interface McpRoutesDeps {
  sessions: Map<string, SessionInfo>;
  createMcpServer: (projectPath: string) => McpServer;
}

export function createMcpRoutes(deps: McpRoutesDeps): Router {
  const { sessions, createMcpServer } = deps;
  const router = Router();

  // POST /mcp
  router.post("/mcp", async (req: Request, res: Response) => {
    // プロジェクトパスをヘッダーから取得
    const projectPath = req.headers["x-maid-project-path"] as string;

    if (!projectPath) {
      console.error("MCP request rejected: X-Maid-Project-Path header is required");
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "X-Maid-Project-Path header is required",
        },
        id: null,
      });
      return;
    }

    // セッションIDをヘッダーから取得
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // 既存セッションがある場合はそれを使用
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      console.log(`Reusing session: ${sessionId}`);
      try {
        await session.transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Request handling error:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
      return;
    }

    // セッションIDなしのリクエスト: 自動的に新しいセッションを作成
    const body = req.body;
    const isInitializeRequest = body && body.method === "initialize";

    if (!isInitializeRequest) {
      // 自動セッション作成モード: initializeなしでもセッションを作成して処理
      console.log(`Auto-creating session for method=${body?.method} (no session ID)`);
    }

    // 新規セッションを作成
    console.log(`New MCP connection request for project: ${projectPath}`);

    try {
      const newSessionId = randomUUID();

      // StreamableHTTPServerTransport を作成
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid: string) => {
          console.log(`Session initialized: ${sid} (project: ${projectPath})`);
        },
      });

      // McpServer インスタンスを作成
      const server = createMcpServer(projectPath);

      // セッション情報を保存
      sessions.set(newSessionId, { transport, server, projectPath });

      // サーバーに接続
      await server.connect(transport);

      // リクエストを処理
      await transport.handleRequest(req, res, req.body);

      // セッション終了時のクリーンアップ（transportのcloseイベント）
      transport.onclose = () => {
        console.log(`Session closed: ${newSessionId}`);
        sessions.delete(newSessionId);
      };

    } catch (error) {
      console.error("MCP connection error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Connection failed" },
          id: null,
        });
      }
    }
  });

  // GET /mcp (SSEストリーム、オプション)
  router.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Invalid or missing session ID",
        },
        id: null,
      });
      return;
    }

    const session = sessions.get(sessionId)!;
    console.log(`SSE stream requested for session: ${sessionId}`);

    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error("SSE stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Stream failed" },
          id: null,
        });
      }
    }
  });

  // DELETE /mcp (セッション終了)
  router.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session ID required" },
        id: null,
      });
      return;
    }

    const session = sessions.get(sessionId);
    if (session) {
      console.log(`Session terminated: ${sessionId}`);
      await session.transport.close();
      sessions.delete(sessionId);
    }

    res.status(204).end();
  });

  return router;
}
