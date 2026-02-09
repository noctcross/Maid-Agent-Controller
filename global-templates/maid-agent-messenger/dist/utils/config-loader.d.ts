/**
 * MCP Server 設定ローダー
 *
 * .maid-agent/config/mcp-server.yaml から設定を読み込む
 */
export interface KeepAliveConfig {
    session_idle_timeout: number;
    gc_interval: number;
    http_keepalive_timeout: number;
    http_headers_timeout: number;
    ping_enabled: boolean;
    ping_interval: number;
    ping_timeout: number;
    max_missed_pings: number;
}
export interface ServerConfig {
    mode: "central" | "local" | "hybrid";
    port: number;
    host: string;
}
export interface CentralConfig {
    connection_timeout: number;
    reconnect_interval: number;
    max_reconnect_attempts: number;
    reconnect_backoff_factor: number;
    max_reconnect_interval: number;
}
export interface FallbackConfig {
    enabled: boolean;
    auto_recover: boolean;
}
export interface DashboardConfig {
    editor: "vscode" | "windsurf" | "cursor";
}
export interface Pm2Config {
    max_memory_restart: string;
    instances: number;
    autorestart: boolean;
    watch: boolean;
}
export interface McpServerConfig {
    server: ServerConfig;
    central: CentralConfig;
    fallback: FallbackConfig;
    dashboard: DashboardConfig;
    keepalive: KeepAliveConfig;
    pm2: Pm2Config;
}
/**
 * 設定ファイルを読み込む
 */
export declare function loadConfig(): Promise<McpServerConfig>;
/**
 * キャッシュをクリア（テスト用）
 */
export declare function clearConfigCache(): void;
/**
 * サーバーURLを取得
 */
export declare function getServerUrl(config: McpServerConfig): string;
