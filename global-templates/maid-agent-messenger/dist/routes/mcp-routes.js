/**
 * MCP Streamable HTTP エンドポイント
 * POST /mcp, GET /mcp, DELETE /mcp
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
export function createMcpRoutes(deps) {
    const { sessions, createMcpServer } = deps;
    const router = Router();
    // POST /mcp
    router.post("/mcp", async (req, res) => {
        // プロジェクトパスをヘッダーから取得
        const projectPath = req.headers["x-maid-project-path"];
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
        const sessionId = req.headers["mcp-session-id"];
        // 既存セッションがある場合はそれを使用
        if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            console.log(`Reusing session: ${sessionId}`);
            try {
                await session.transport.handleRequest(req, res, req.body);
            }
            catch (error) {
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
                onsessioninitialized: (sid) => {
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
        }
        catch (error) {
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
    router.get("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
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
        const session = sessions.get(sessionId);
        console.log(`SSE stream requested for session: ${sessionId}`);
        try {
            await session.transport.handleRequest(req, res);
        }
        catch (error) {
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
    router.delete("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
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
