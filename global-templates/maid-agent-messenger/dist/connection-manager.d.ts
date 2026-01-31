/**
 * Connection Manager
 *
 * ハイブリッド方式の接続管理
 * - 中央サーバー（HTTP）への接続を優先
 * - 失敗時はローカルサーバー（STDIO）にフォールバック
 * - 中央サーバー復旧時は自動的に切り替え
 */
export type ConnectionMode = "central" | "local" | "disconnected";
export interface ConnectionStatus {
    mode: ConnectionMode;
    url?: string;
    lastCheck: string;
    error?: string;
}
export declare class ConnectionManager {
    private config;
    private mode;
    private baseUrl;
    private localServer;
    private reconnectTimer;
    /**
     * 初期化と接続
     */
    connect(): Promise<ConnectionStatus>;
    /**
     * ハイブリッド接続（中央優先、フォールバックあり）
     */
    private connectHybrid;
    /**
     * 中央サーバーに接続
     */
    private connectToCentral;
    /**
     * ローカルサーバーを起動
     */
    private startLocalServer;
    /**
     * 再接続をスケジュール
     */
    private scheduleReconnect;
    /**
     * ツールを呼び出す
     */
    callTool<T>(toolName: string, params: Record<string, unknown>): Promise<T>;
    /**
     * 接続ステータスを取得
     */
    getStatus(): ConnectionStatus;
    /**
     * 現在のモードを取得
     */
    getMode(): ConnectionMode;
    /**
     * 切断
     */
    disconnect(): void;
}
export declare const connectionManager: ConnectionManager;
