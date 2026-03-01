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
import legacyRoutes from "./routes/legacy-routes.js";
import { createTaskApiRoutes } from "./routes/task-api-routes.js";
import { createCliApiRoutes } from "./routes/cli-api-routes.js";
import { createDashboardRoutes } from "./routes/dashboard-routes.js";
import { createTopPageRoutes } from "./routes/top-page-routes.js";
import fileRoutes from "./routes/file-routes.js";
import imageRoutes from "./routes/image-routes.js";
import qualityRoutes from "./routes/quality-routes.js";
// ビュー
import { generateDashboardHtml, generateV2TeamStatusHtml } from "./views/dashboard-html.js";
import { generateTopPageHtml } from "./views/top-page-html.js";
import { generateTaskHtml, composeMasterWaitingHtml } from "./views/task-html.js";
// V2.1 ビュー
import { generateTaskTreeHtml, generateReviewQueueHtml, generateArtifactsHtml, generateV2StatsHtml, } from "./views/task-html-v2.js";
import { loopbackOnly } from "./middleware/loopback-only.js";
import { DashboardWebSocketServer } from "./websocket/dashboard-ws.js";
import { logger } from "./utils/logger.js";
const app = express();
app.use(express.json());
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
    const wsServer = new DashboardWebSocketServer(server, {
        pingInterval: config.keepalive.ping_interval || TIMEOUTS.PING_INTERVAL,
        pongTimeout: 10000,
    });
    // ========================================
    // ルートマウント
    // ========================================
    // 公開エンドポイント（LAN公開OK）を先にマウント
    // ※ loopbackOnly付きルートを先にマウントすると、パス指定なしの
    //    app.use(loopbackOnly, router) が全リクエストをブロックしてしまうため
    app.use(createTopPageRoutes({ generateTopPageHtml })); // トップページ（プロジェクト一覧）
    app.use(createDashboardRoutes({
        generateDashboardHtml,
        generateTaskHtml,
        composeMasterWaitingHtml,
        generateTaskTreeHtml,
        generateReviewQueueHtml,
        generateArtifactsHtml,
        generateV2StatsHtml,
        generateV2TeamStatusHtml,
        wsServer,
    }));
    app.use(fileRoutes);
    app.use(imageRoutes);
    // 非公開エンドポイント（loopbackのみ）
    app.use(loopbackOnly, legacyRoutes);
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
    });
    // HTTP Keep-Alive タイムアウト設定
    // プロキシの60秒タイムアウトより長く設定してpremature close を防止
    server.keepAliveTimeout = config.keepalive.http_keepalive_timeout;
    server.headersTimeout = config.keepalive.http_headers_timeout;
    // プロセス終了時のクリーンアップ（グレースフルシャットダウン）
    const gracefulShutdown = () => {
        wsServer.close();
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
