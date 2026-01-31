/**
 * MCP Server 設定ローダー
 *
 * .maid-agent/config/mcp-server.yaml から設定を読み込む
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";

export interface ServerConfig {
  mode: "central" | "local" | "hybrid";
  port: number;
  host: string;
}

export interface CentralConfig {
  connection_timeout: number;
  reconnect_interval: number;
}

export interface FallbackConfig {
  enabled: boolean;
  auto_recover: boolean;
}

export interface McpServerConfig {
  server: ServerConfig;
  central: CentralConfig;
  fallback: FallbackConfig;
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
  },
  fallback: {
    enabled: true,
    auto_recover: true,
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
  // デフォルトパス
  return ".maid-agent/config/mcp-server.yaml";
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
    const absolutePath = path.resolve(process.cwd(), configPath);
    const content = await fs.readFile(absolutePath, "utf-8");
    const parsed = yaml.parse(content) as Partial<McpServerConfig>;

    // デフォルト値とマージ
    cachedConfig = {
      server: { ...DEFAULT_CONFIG.server, ...parsed.server },
      central: { ...DEFAULT_CONFIG.central, ...parsed.central },
      fallback: { ...DEFAULT_CONFIG.fallback, ...parsed.fallback },
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
