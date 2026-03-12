/**
 * Maid Agent Messenger 設定ローダー
 *
 * ~/.maid-agent/system/config/maid-agent-messenger.yaml から設定を読み込む
 */
export interface KeepAliveConfig {
    http_keepalive_timeout: number;
    http_headers_timeout: number;
    ping_interval: number;
}
export interface ServerConfig {
    port: number;
    host: string;
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
export interface FormatterConfig {
    sanitize_description_max_length: number;
}
export interface McpServerConfig {
    server: ServerConfig;
    dashboard: DashboardConfig;
    keepalive: KeepAliveConfig;
    pm2: Pm2Config;
    formatter: FormatterConfig;
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
 * ブラウザからアクセス可能なURLを返す（0.0.0.0 → localhost に変換）
 */
export declare function getServerUrl(config: McpServerConfig): string;
