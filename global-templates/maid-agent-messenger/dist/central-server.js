/**
 * Central MCP Server (Streamable HTTP Transport)
 *
 * 中央集約サーバー（ユーザーフォルダ版）
 * - MCP Streamable HTTP プロトコル対応（Claude Code から直接接続可能）
 * - 複数のClaude Codeセッションから共有で使用
 * - プロジェクトパスはヘッダー（X-Maid-Project-Path）で指定
 * - pm2で常時稼働させる
 *
 * メモリ効率: 700MB → 90MB（87%削減）
 */
import express from "express";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
import { getTimestamp } from "./utils/yaml-helper.js";
// セッション管理
import { sessions, cleanupIdleSessions } from "./middleware/session-manager.js";
// ルーター
import { createMcpRoutes } from "./routes/mcp-routes.js";
import legacyRoutes from "./routes/legacy-routes.js";
import taskApiRoutes from "./routes/task-api-routes.js";
import { createDashboardRoutes } from "./routes/dashboard-routes.js";
import fileRoutes from "./routes/file-routes.js";
// ビュー
import { generateDashboardHtml } from "./views/dashboard-html.js";
import { generateTaskHtml } from "./views/task-html.js";
// MCPサーバーファクトリ
import { createMcpServer } from "./mcp-server-factory.js";
import { KeepAliveManager } from "./middleware/keepalive-manager.js";
const app = express();
app.use(express.json());
// リクエストログ
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// ========================================
// HTTP エンドポイント
// ========================================
// ヘルスチェック
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        timestamp: getTimestamp(),
        version: "4.1.0",
        mode: "streamable-http-multiproject",
        activeConnections: sessions.size,
    });
});
// ========================================
// サーバー起動
// ========================================
async function main() {
    const config = await loadConfig();
    const { port, host } = config.server;
    // Phase 3: KeepAliveManager
    const keepAliveManager = config.keepalive.ping_enabled
        ? new KeepAliveManager(config.keepalive)
        : undefined;
    // ========================================
    // ルートマウント
    // ========================================
    app.use(createMcpRoutes({ sessions, createMcpServer, keepAliveManager }));
    app.use(legacyRoutes);
    app.use(taskApiRoutes);
    app.use(createDashboardRoutes({ generateDashboardHtml, generateTaskHtml }));
    app.use(fileRoutes);
    // ========================================
    app.use((err, _req, res, _next) => {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    });
    const server = app.listen(port, host, () => {
        console.log(`Central MCP Server v4.1.0 running on ${getServerUrl(config)}`);
        console.log(`MCP endpoint: ${getServerUrl(config)}/mcp`);
        console.log(`Health check: ${getServerUrl(config)}/health`);
        console.log(`Mode: Streamable HTTP Transport (Multi-Project Support)`);
        console.log(`Note: Requires X-Maid-Project-Path header for project identification`);
        console.log(`Session GC: interval=${config.keepalive.gc_interval}ms, idle_timeout=${config.keepalive.session_idle_timeout}ms`);
    });
    // HTTP Keep-Alive タイムアウト設定
    // プロキシの60秒タイムアウトより長く設定してpremature close を防止
    server.keepAliveTimeout = config.keepalive.http_keepalive_timeout;
    server.headersTimeout = config.keepalive.http_headers_timeout;
    // セッションGCタイマー
    const gcTimer = setInterval(() => {
        const cleaned = cleanupIdleSessions(config.keepalive.session_idle_timeout);
        if (cleaned > 0) {
            console.log(`[SessionGC] ${cleaned} idle session(s) cleaned up. Remaining: ${sessions.size}`);
        }
    }, config.keepalive.gc_interval);
    // プロセス終了時にタイマーをクリア
    process.on("SIGTERM", () => {
        clearInterval(gcTimer);
        if (keepAliveManager) {
            keepAliveManager.stopAll();
        }
        server.close();
    });
}
main().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
});
