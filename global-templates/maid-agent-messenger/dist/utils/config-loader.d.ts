/**
 * MCP Server 設定ローダー
 *
 * .maid-agent/config/mcp-server.yaml から設定を読み込む
 */
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
export interface DashboardConfig {
    editor: "vscode" | "windsurf" | "cursor";
}
export interface McpServerConfig {
    server: ServerConfig;
    central: CentralConfig;
    fallback: FallbackConfig;
    dashboard: DashboardConfig;
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
