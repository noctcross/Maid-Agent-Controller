/**
 * Maid Agent MCP Server (STDIO Mode)
 *
 * Maid Agent System のタスク管理用 MCP サーバー
 * Claude Code から STDIO で起動される
 *
 * ハイブリッド方式:
 * - 中央サーバーが起動している場合: 中央サーバーを使用（このファイルは使われない）
 * - 中央サーバーが停止している場合: このファイルがSTDIOで起動される（フォールバック）
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerGetMyTask } from "./tools/get-my-task.js";
import { registerUpdateStatus } from "./tools/update-status.js";
import { registerAssignTask } from "./tools/assign-task.js";
import { registerGetTeamStatus } from "./tools/get-team-status.js";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";

const SERVER_NAME = "maid-agent-messenger";
const SERVER_VERSION = "2.0.0";

/**
 * 中央サーバーが起動しているかチェック
 */
async function checkCentralServer(timeout: number = 3000): Promise<boolean> {
  try {
    const config = await loadConfig();
    const url = getServerUrl(config);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${url}/health`, {
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  // コマンドライン引数を解析
  const args = process.argv.slice(2);
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : "hybrid";

  // 設定を読み込み
  const config = await loadConfig();

  // hybridモードで中央サーバーが起動している場合は通知
  if (mode === "hybrid" || config.server.mode === "hybrid") {
    const isCentralAvailable = await checkCentralServer(
      config.central.connection_timeout
    );

    if (isCentralAvailable) {
      // 中央サーバーが利用可能なので、STDIOサーバーは起動しない
      // Claude Codeは中央サーバーを使用する
      console.error(
        `Central server available at ${getServerUrl(config)}, skipping STDIO startup`
      );
      // ただし、Claude CodeはSTDIOでこのプロセスを起動するため、
      // 終了せずに待機状態にする必要がある場合がある
      // 現時点では通常通りSTDIOサーバーを起動
    }
  }

  // MCPサーバー作成
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // ツール登録
  registerGetMyTask(server);
  registerUpdateStatus(server);
  registerAssignTask(server);
  registerGetTeamStatus(server);

  // STDIO トランスポートで接続
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 起動ログ（stderrに出力）
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started (STDIO mode)`);
}

// エントリーポイント
main().catch((error) => {
  console.error("Server startup failed:", error);
  process.exit(1);
});
