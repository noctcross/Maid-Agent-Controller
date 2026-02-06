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

import express, { Request, Response, NextFunction } from "express";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
import { getTimestamp } from "./utils/yaml-helper.js";

// セッション管理
import { sessions } from "./middleware/session-manager.js";

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

const app = express();
app.use(express.json());

// リクエストログ
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ========================================
// HTTP エンドポイント
// ========================================

// ヘルスチェック
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: getTimestamp(),
    version: "4.1.0",
    mode: "streamable-http-multiproject",
    activeConnections: sessions.size,
  });
});


// ========================================
// ルートマウント
// ========================================

app.use(createMcpRoutes({ sessions, createMcpServer }));
app.use(legacyRoutes);
app.use(taskApiRoutes);
app.use(createDashboardRoutes({ generateDashboardHtml, generateTaskHtml }));
app.use(fileRoutes);

// ========================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ========================================
// サーバー起動
// ========================================

async function main(): Promise<void> {
  const config = await loadConfig();
  const { port, host } = config.server;

  app.listen(port, host, () => {
    console.log(`Central MCP Server v4.1.0 running on ${getServerUrl(config)}`);
    console.log(`MCP endpoint: ${getServerUrl(config)}/mcp`);
    console.log(`Health check: ${getServerUrl(config)}/health`);
    console.log(`Mode: Streamable HTTP Transport (Multi-Project Support)`);
    console.log(`Note: Requires X-Maid-Project-Path header for project identification`);
  });
}

main().catch((error) => {
  console.error("Server startup failed:", error);
  process.exit(1);
});
