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

export interface KeepAliveConfig {
  http_keepalive_timeout: number;    // ms。デフォルト: 65000（65秒）
  http_headers_timeout: number;      // ms。デフォルト: 66000（66秒）
  ping_interval: number;             // ms。デフォルト: 30000（30秒）
}

export interface ServerConfig {
  port: number;
  host: string;
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
  dashboard: DashboardConfig;
  keepalive: KeepAliveConfig;
  pm2: Pm2Config;
  formatter: FormatterConfig;
}

const DEFAULT_CONFIG: McpServerConfig = {
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

let cachedConfig: McpServerConfig | null = null;

/**
 * 設定ファイルのパスを取得
 */
function getConfigPath(): string {
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
      dashboard: { ...DEFAULT_CONFIG.dashboard, ...parsed.dashboard },
      keepalive: { ...DEFAULT_CONFIG.keepalive, ...(parsed as Record<string, unknown>).keepalive as Partial<KeepAliveConfig> },
      pm2: { ...DEFAULT_CONFIG.pm2, ...(parsed as Record<string, unknown>).pm2 as Partial<Pm2Config> },
      formatter: { ...DEFAULT_CONFIG.formatter, ...(parsed as Record<string, unknown>).formatter as Partial<FormatterConfig> },
    };

    return cachedConfig;
  } catch {
    // 設定ファイルがない場合はデフォルト値を使用
    logger.info(`Config file not found at ${configPath}, using defaults`);
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
 * ブラウザからアクセス可能なURLを返す（0.0.0.0 → localhost に変換）
 */
export function getServerUrl(config: McpServerConfig): string {
  const host = config.server.host === "0.0.0.0" ? "localhost" : config.server.host;
  return `http://${host}:${config.server.port}`;
}
