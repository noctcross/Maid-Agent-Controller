"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const get_my_task_js_1 = require("./tools/get-my-task.js");
const update_status_js_1 = require("./tools/update-status.js");
const assign_task_js_1 = require("./tools/assign-task.js");
const get_team_status_js_1 = require("./tools/get-team-status.js");
const config_loader_js_1 = require("./utils/config-loader.js");
const SERVER_NAME = "maid-agent-messenger";
const SERVER_VERSION = "2.0.0";
/**
 * 中央サーバーが起動しているかチェック
 */
async function checkCentralServer(timeout = 3000) {
    try {
        const config = await (0, config_loader_js_1.loadConfig)();
        const url = (0, config_loader_js_1.getServerUrl)(config);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(`${url}/health`, {
                signal: controller.signal,
            });
            return response.ok;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    catch {
        return false;
    }
}
async function main() {
    // コマンドライン引数を解析
    const args = process.argv.slice(2);
    const modeArg = args.find((arg) => arg.startsWith("--mode="));
    const mode = modeArg ? modeArg.split("=")[1] : "hybrid";
    // 設定を読み込み
    const config = await (0, config_loader_js_1.loadConfig)();
    // hybridモードで中央サーバーが起動している場合は通知
    if (mode === "hybrid" || config.server.mode === "hybrid") {
        const isCentralAvailable = await checkCentralServer(config.central.connection_timeout);
        if (isCentralAvailable) {
            // 中央サーバーが利用可能なので、STDIOサーバーは起動しない
            // Claude Codeは中央サーバーを使用する
            console.error(`Central server available at ${(0, config_loader_js_1.getServerUrl)(config)}, skipping STDIO startup`);
            // ただし、Claude CodeはSTDIOでこのプロセスを起動するため、
            // 終了せずに待機状態にする必要がある場合がある
            // 現時点では通常通りSTDIOサーバーを起動
        }
    }
    // MCPサーバー作成
    const server = new mcp_js_1.McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
    });
    // ツール登録
    (0, get_my_task_js_1.registerGetMyTask)(server);
    (0, update_status_js_1.registerUpdateStatus)(server);
    (0, assign_task_js_1.registerAssignTask)(server);
    (0, get_team_status_js_1.registerGetTeamStatus)(server);
    // STDIO トランスポートで接続
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    // 起動ログ（stderrに出力）
    console.error(`${SERVER_NAME} v${SERVER_VERSION} started (STDIO mode)`);
}
// エントリーポイント
main().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map