/**
 * Maid Agent Messenger 設定ローダー
 *
 * ~/.maid-agent/system/config/maid-agent-messenger.yaml から設定を読み込む
 */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as yaml from "yaml";
import { TIMEOUTS } from "./constants.js";
import { logger } from "./logger.js";
const DEFAULT_CONFIG = {
    server: {
        port: 3100,
        host: "0.0.0.0",
    },
    dashboard: {
        editor: "vscode",
    },
    keepalive: {
        http_keepalive_timeout: 65000,
        http_headers_timeout: 66000,
        ping_interval: TIMEOUTS.PING_INTERVAL,
    },
    pm2: {
        max_memory_restart: "500M",
        instances: 1,
        autorestart: true,
        watch: false,
    },
    formatter: {
        sanitize_description_max_length: 15,
    },
};
let cachedConfig = null;
/**
 * 設定ファイルのパスを取得
 */
function getConfigPath() {
    // 環境変数で指定されている場合はそちらを使用
    if (process.env.MAID_MCP_CONFIG) {
        return process.env.MAID_MCP_CONFIG;
    }
    // グローバル設定: ~/.maid-agent/system/config/maid-agent-messenger.yaml
    const homeDir = os.homedir();
    return path.join(homeDir, ".maid-agent", "system", "config", "maid-agent-messenger.yaml");
}
/**
 * 設定ファイルを読み込む
 */
export async function loadConfig() {
    // キャッシュがあれば返す
    if (cachedConfig) {
        return cachedConfig;
    }
    const configPath = getConfigPath();
    try {
        // configPath はすでに絶対パス
        const content = await fs.readFile(configPath, "utf-8");
        const parsed = yaml.parse(content);
        // デフォルト値とマージ
        cachedConfig = {
            server: { ...DEFAULT_CONFIG.server, ...parsed.server },
            dashboard: { ...DEFAULT_CONFIG.dashboard, ...parsed.dashboard },
            keepalive: { ...DEFAULT_CONFIG.keepalive, ...parsed.keepalive },
            pm2: { ...DEFAULT_CONFIG.pm2, ...parsed.pm2 },
            formatter: { ...DEFAULT_CONFIG.formatter, ...parsed.formatter },
        };
        return cachedConfig;
    }
    catch {
        // 設定ファイルがない場合はデフォルト値を使用
        logger.info(`Config file not found at ${configPath}, using defaults`);
        cachedConfig = DEFAULT_CONFIG;
        return cachedConfig;
    }
}
/**
 * キャッシュをクリア（テスト用）
 */
export function clearConfigCache() {
    cachedConfig = null;
}
/**
 * サーバーURLを取得
 * ブラウザからアクセス可能なURLを返す（0.0.0.0 → localhost に変換）
 */
export function getServerUrl(config) {
    const host = config.server.host === "0.0.0.0" ? "localhost" : config.server.host;
    return `http://${host}:${config.server.port}`;
}
