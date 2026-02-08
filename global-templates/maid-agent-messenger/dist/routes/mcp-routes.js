/**
 * MCP Streamable HTTP エンドポイント
 * POST /mcp, GET /mcp, DELETE /mcp
 */
import { Router } from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryEventStore } from "../middleware/event-store.js";
import { validateProjectPath } from "../middleware/session-manager.js";
export function createMcpRoutes(deps) {
    const { sessions, createMcpServer, keepAliveManager } = deps;
    const router = Router();
    // POST /mcp
    router.post("/mcp", async (req, res) => {
        // プロジェクトパスをヘッダーから取得
        const projectPath = req.headers["x-maid-project-path"];
        const pathError = validateProjectPath(projectPath);
        if (pathError) {
            console.error(`MCP request rejected: ${pathError}`);
            res.status(400).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: pathError,
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
            session.lastActivity = new Date();
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
        // セッションIDがあるが見つからない → 404（MCP仕様: クライアントに再初期化を促す）
        if (sessionId) {
            console.log(`[MCP] Session expired or unknown: ${sessionId}`);
            res.status(404).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Session not found. Client should create a new session by sending an initialize request.",
                },
                id: null,
            });
            return;
        }
        // セッションIDなし + initialize以外 → 400
        const body = req.body;
        const isInitializeRequest = body && body.method === "initialize";
        if (!isInitializeRequest) {
            console.log(`[MCP] Non-initialize request without session ID: method=${body?.method}`);
            res.status(400).json({
                jsonrpc: "2.0",
                error: {
                    code: -32600,
                    message: "Mcp-Session-Id header is required for non-initialize requests",
                },
                id: null,
            });
            return;
        }
        // 新規セッションを作成
        console.log(`New MCP connection request for project: ${projectPath}`);
        try {
            const newSessionId = randomUUID();
            // EventStore: SSEストリーム再開可能性を提供
            const eventStore = new InMemoryEventStore();
            // StreamableHTTPServerTransport を作成
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => newSessionId,
                onsessioninitialized: (sid) => {
                    console.log(`Session initialized: ${sid} (project: ${projectPath})`);
                },
                eventStore,
            });
            // McpServer インスタンスを作成
            const server = createMcpServer(projectPath);
            // セッション情報を保存
            const now = new Date();
            sessions.set(newSessionId, {
                transport,
                server,
                projectPath,
                createdAt: now,
                lastActivity: now,
                missedPings: 0,
            });
            // サーバーに接続
            await server.connect(transport);
            // Phase 3: Pingタイマー開始
            if (keepAliveManager) {
                keepAliveManager.startPing(newSessionId, sessions.get(newSessionId));
            }
            // リクエストを処理
            await transport.handleRequest(req, res, req.body);
            // セッション終了時のクリーンアップ（transportのcloseイベント）
            transport.onclose = () => {
                console.log(`Session closed: ${newSessionId}`);
                if (keepAliveManager) {
                    keepAliveManager.stopPing(newSessionId, sessions.get(newSessionId));
                }
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
        if (!sessionId) {
            res.status(400).json({
                jsonrpc: "2.0",
                error: { code: -32600, message: "Mcp-Session-Id header is required" },
                id: null,
            });
            return;
        }
        if (!sessions.has(sessionId)) {
            res.status(404).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Session not found. Client should create a new session by sending an initialize request.",
                },
                id: null,
            });
            return;
        }
        const session = sessions.get(sessionId);
        session.lastActivity = new Date();
        console.log(`SSE stream requested for session: ${sessionId}`);
        // SSE再接続時: Pingタイマーが停止していれば再開（Phase 2-2）
        if (keepAliveManager && !session.pingTimer) {
            console.log(`[KeepAlive] Restarting ping for reconnected session: ${sessionId}`);
            session.missedPings = 0;
            keepAliveManager.startPing(sessionId, session);
        }
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
        if (!session) {
            res.status(404).json({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Session not found" },
                id: null,
            });
            return;
        }
        console.log(`Session terminated: ${sessionId}`);
        if (keepAliveManager) {
            keepAliveManager.stopPing(sessionId, session);
        }
        await session.transport.close();
        sessions.delete(sessionId);
        res.status(204).end();
    });
    return router;
}
