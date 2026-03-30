/**
 * Central Dashboard Server
 *
 * 中央集約サーバー（ユーザーフォルダ版）
 * - 複数のClaude Codeセッションから共有で使用
 * - プロジェクトパスはヘッダー（X-Maid-Project-Path）で指定
 * - pm2で常時稼働させる
 *
 * メモリ効率: 700MB → 90MB（87%削減）
 */
import express from "express";
import { createServer } from "http";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
import { getTimestamp } from "./utils/yaml-helper.js";
import { TIMEOUTS } from "./utils/constants.js";
// ルーター
import { createTaskApiRoutes } from "./routes/task-api-routes.js";
import { createCliApiRoutes } from "./routes/cli-api-routes.js";
import { createDashboardRoutes } from "./routes/dashboard-routes.js";
import { createTopPageRoutes } from "./routes/top-page-routes.js";
import fileRoutes from "./routes/file-routes.js";
import fileApiRoutes from "./routes/file-api-routes.js";
import notificationApiRoutes from "./routes/notification-api-routes.js";
import responseApiRoutes from "./routes/response-api-routes.js";
import imageRoutes from "./routes/image-routes.js";
import qualityRoutes from "./routes/quality-routes.js";
// ビュー
import { generateTopPageHtml } from "./views/top-page-html.js";
import { loopbackOnly } from "./middleware/loopback-only.js";
import { DashboardWebSocketServer } from "./websocket/dashboard-ws.js";
import { NotificationWebSocketServer } from "./websocket/notification-ws.js";
import { logger } from "./utils/logger.js";
const app = express();
app.use(express.json());
// CORS設定（VSCode Webview対応）
app.use((req, res, next) => {
    // VSCode Webview や他のオリジンからのリクエストを許可
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-Transaction-Id, X-Maid-Project-Path");
    // プリフライトリクエスト（OPTIONS）への応答
    if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
    }
    next();
});
// リクエストログ
app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
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
        version: "5.0.0",
        mode: "dashboard-only",
    });
});
// ========================================
// サーバー起動
// ========================================
async function main() {
    const config = await loadConfig();
    const { port, host } = config.server;
    // ========================================
    // HTTPサーバー・WebSocketサーバー作成
    // ========================================
    const server = createServer(app);
    // noServer: true で WebSocketServer を作成
    const wsServer = new DashboardWebSocketServer(null, {
        pingInterval: config.keepalive.ping_interval || TIMEOUTS.PING_INTERVAL,
        pongTimeout: 10000,
    });
    const notificationWsServer = new NotificationWebSocketServer(null);
    // HTTP upgrade イベントを手動で処理（複数の WebSocketServer をサポート）
    server.on("upgrade", (request, socket, head) => {
        const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
        if (wsServer.shouldHandle(pathname)) {
            wsServer.handleUpgrade(request, socket, head);
        }
        else if (notificationWsServer.shouldHandle(pathname)) {
            notificationWsServer.handleUpgrade(request, socket, head);
        }
        else {
            socket.destroy();
        }
    });
    // ========================================
    // ルートマウント
    // ========================================
    // 公開エンドポイント（LAN公開OK）を先にマウント
    // ※ loopbackOnly付きルートを先にマウントすると、パス指定なしの
    //    app.use(loopbackOnly, router) が全リクエストをブロックしてしまうため
    app.use(createTopPageRoutes({ generateTopPageHtml })); // トップページ（プロジェクト一覧）
    app.use(createDashboardRoutes({ wsServer })); // SPA版ダッシュボード
    app.use(fileRoutes);
    app.use(fileApiRoutes);
    app.use(notificationApiRoutes);
    app.use(responseApiRoutes);
    app.use(imageRoutes);
    // 非公開エンドポイント（loopbackのみ）
    app.use(loopbackOnly, createTaskApiRoutes({ wsServer }));
    app.use(loopbackOnly, createCliApiRoutes({ wsServer }));
    app.use(loopbackOnly, qualityRoutes);
    // ========================================
    app.use((err, _req, res, _next) => {
        logger.error("Server error", err);
        res.status(500).json({ error: "Internal server error" });
    });
    server.listen(port, host, () => {
        logger.info(`Central Dashboard Server v5.0.0 running on ${getServerUrl(config)}`);
        logger.info(`Health check: ${getServerUrl(config)}/health`);
        logger.info(`Dashboard: ${getServerUrl(config)}/dashboard`);
        logger.info(`Mode: Multi-Project Support`);
        logger.info(`Note: Requires X-Maid-Project-Path header for project identification`);
        logger.info(`WebSocket endpoint: ws://${host}:${port}/dashboard/ws`);
        logger.info(`Notification WS: ws://${host}:${port}/ws/notifications`);
        // PM2 ready signal（wait_ready: true 対応）
        if (process.send) {
            process.send('ready');
        }
    });
    // HTTP Keep-Alive タイムアウト設定
    // プロキシの60秒タイムアウトより長く設定してpremature close を防止
    server.keepAliveTimeout = config.keepalive.http_keepalive_timeout;
    server.headersTimeout = config.keepalive.http_headers_timeout;
    // プロセス終了時のクリーンアップ（グレースフルシャットダウン）
    const gracefulShutdown = () => {
        wsServer.close();
        notificationWsServer.close();
        server.close();
    };
    // PM2はデフォルトでSIGINTを最初に送信し、応答がなければSIGKILLを送る
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);
}
main().catch((error) => {
    logger.error("Server startup failed", error instanceof Error ? error : { error });
    process.exit(1);
});
