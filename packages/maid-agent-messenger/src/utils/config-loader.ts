/**
 * MCP Server 設定ローダー
 *
 * .maid-agent/config/mcp-server.yaml から設定を読み込む
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as yaml from "yaml";

export interface KeepAliveConfig {
  // Phase 1
  session_idle_timeout: number;      // ms。デフォルト: 1800000（30分）
  gc_interval: number;               // ms。デフォルト: 60000（1分）
  // Phase 2
  http_keepalive_timeout: number;    // ms。デフォルト: 65000（65秒）
  http_headers_timeout: number;      // ms。デフォルト: 66000（66秒）
  // Phase 3
  ping_enabled: boolean;             // デフォルト: true
  ping_interval: number;             // ms。デフォルト: 30000（30秒）
  ping_timeout: number;              // ms。デフォルト: 5000（5秒）
  max_missed_pings: number;          // デフォルト: 2
}

export interface ServerConfig {
  mode: "central" | "local" | "hybrid";
  port: number;
  host: string;
}

export interface CentralConfig {
  connection_timeout: number;
  reconnect_interval: number;
  max_reconnect_attempts: number;    // デフォルト: 10
  reconnect_backoff_factor: number;  // デフォルト: 1.5
  max_reconnect_interval: number;    // ms。デフォルト: 120000（2分）
}

export interface FallbackConfig {
  enabled: boolean;
  auto_recover: boolean;
}

export interface DashboardConfig {
  editor: "vscode" | "windsurf" | "cursor";
}

export interface Pm2Config {
  max_memory_restart: string;  // デフォルト: "500M"
  instances: number;           // デフォルト: 1
  autorestart: boolean;        // デフォルト: true
  watch: boolean;              // デフォルト: false
}

export interface FormatterConfig {
  sanitize_description_max_length: number;  // デフォルト: 15
}

export interface McpServerConfig {
  server: ServerConfig;
  central: CentralConfig;
  fallback: FallbackConfig;
  dashboard: DashboardConfig;
  keepalive: KeepAliveConfig;
  pm2: Pm2Config;
  formatter: FormatterConfig;
}

const DEFAULT_CONFIG: McpServerConfig = {
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
  formatter: {
    sanitize_description_max_length: 15,
  },
};

let cachedConfig: McpServerConfig | null = null;

/**
 * 設定ファイルのパスを取得
 */
function getConfigPath(): string {
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
export async function loadConfig(): Promise<McpServerConfig> {
  // キャッシュがあれば返す
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  try {
    // configPath はすでに絶対パス
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = yaml.parse(content) as Partial<McpServerConfig>;

    // デフォルト値とマージ
    cachedConfig = {
      server: { ...DEFAULT_CONFIG.server, ...parsed.server },
      central: { ...DEFAULT_CONFIG.central, ...parsed.central },
      fallback: { ...DEFAULT_CONFIG.fallback, ...parsed.fallback },
      dashboard: { ...DEFAULT_CONFIG.dashboard, ...parsed.dashboard },
      keepalive: { ...DEFAULT_CONFIG.keepalive, ...(parsed as Record<string, unknown>).keepalive as Partial<KeepAliveConfig> },
      pm2: { ...DEFAULT_CONFIG.pm2, ...(parsed as Record<string, unknown>).pm2 as Partial<Pm2Config> },
      formatter: { ...DEFAULT_CONFIG.formatter, ...(parsed as Record<string, unknown>).formatter as Partial<FormatterConfig> },
    };

    return cachedConfig;
  } catch (error) {
    // 設定ファイルがない場合はデフォルト値を使用
    console.error(`Config file not found at ${configPath}, using defaults`);
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * サーバーURLを取得
 */
export function getServerUrl(config: McpServerConfig): string {
  return `http://${config.server.host}:${config.server.port}`;
}
