/**
 * MCP Server 設定ローダー
 *
 * .maid-agent/config/mcp-server.yaml から設定を読み込む
 */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as yaml from "yaml";
const DEFAULT_CONFIG = {
    server: {
        mode: "hybrid",
        port: 3100,
        host: "127.0.0.1",
    },
    central: {
        connection_timeout: 3000,
        reconnect_interval: 30000,
        max_reconnect_attempts: 10,
        reconnect_backoff_factor: 1.5,
        max_reconnect_interval: 120000,
    },
    fallback: {
        enabled: true,
        auto_recover: true,
    },
    dashboard: {
        editor: "vscode",
    },
    keepalive: {
        session_idle_timeout: 1800000,
        gc_interval: 60000,
        http_keepalive_timeout: 65000,
        http_headers_timeout: 66000,
        ping_enabled: true,
        ping_interval: 30000,
        ping_timeout: 5000,
        max_missed_pings: 2,
    },
    pm2: {
        max_memory_restart: "500M",
        instances: 1,
        autorestart: true,
        watch: false,
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
    // グローバル設定: ~/.maid-agent/system/config/mcp-server.yaml
    const homeDir = os.homedir();
    return path.join(homeDir, ".maid-agent", "system", "config", "mcp-server.yaml");
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
            central: { ...DEFAULT_CONFIG.central, ...parsed.central },
            fallback: { ...DEFAULT_CONFIG.fallback, ...parsed.fallback },
            dashboard: { ...DEFAULT_CONFIG.dashboard, ...parsed.dashboard },
            keepalive: { ...DEFAULT_CONFIG.keepalive, ...parsed.keepalive },
            pm2: { ...DEFAULT_CONFIG.pm2, ...parsed.pm2 },
        };
        return cachedConfig;
    }
    catch (error) {
        // 設定ファイルがない場合はデフォルト値を使用
        console.error(`Config file not found at ${configPath}, using defaults`);
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
 */
export function getServerUrl(config) {
    return `http://${config.server.host}:${config.server.port}`;
}
