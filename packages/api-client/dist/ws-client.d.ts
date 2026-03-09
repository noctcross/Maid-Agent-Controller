/**
 * WebSocket Client
 *
 * @maid-agent/api-client - WebSocket client for real-time updates
 */
import type { DashboardEvent, NotificationWSEvent } from "@maid-agent/types";
/**
 * WebSocketクライアント設定
 */
export interface WebSocketClientConfig {
    maxReconnectAttempts: number;
    initialReconnectDelay: number;
    maxReconnectDelay: number;
    reconnectBackoffMultiplier: number;
}
/**
 * イベントハンドラ型
 */
export type WSEventHandler<T> = (event: T) => void;
export type ConnectionStateHandler = (connected: boolean) => void;
/**
 * WebSocketクライアント基底クラス
 */
declare abstract class BaseWebSocketClient<TEvent> {
    protected ws: WebSocket | null;
    protected url: string;
    protected reconnectAttempts: number;
    protected reconnectTimer: ReturnType<typeof setTimeout> | null;
    protected handlers: WSEventHandler<TEvent>[];
    protected connectionStateHandlers: ConnectionStateHandler[];
    protected isManualClose: boolean;
    protected config: WebSocketClientConfig;
    protected sessionId: string | null;
    constructor(config?: Partial<WebSocketClientConfig>);
    /**
     * WebSocket接続を開始
     */
    connect(url: string): void;
    /**
     * URL変更時の再接続
     */
    reconnectWithNewUrl(url: string): void;
    protected createConnection(): void;
    protected abstract handleMessage(data: unknown): void;
    protected sendPong(): void;
    protected attemptReconnect(): void;
    protected cleanup(): void;
    /**
     * 手動切断
     */
    disconnect(): void;
    /**
     * イベントハンドラを登録
     */
    subscribe(handler: WSEventHandler<TEvent>): () => void;
    /**
     * 接続状態変更ハンドラを登録
     */
    onConnectionStateChange(handler: ConnectionStateHandler): () => void;
    protected notifyConnectionState(connected: boolean): void;
    /**
     * 接続状態を取得
     */
    isConnected(): boolean;
    /**
     * 現在のセッションIDを取得
     */
    getSessionId(): string | null;
    /**
     * 再接続を強制実行
     */
    forceReconnect(): void;
}
/**
 * ダッシュボードWebSocketクライアント
 */
export declare class DashboardWebSocket extends BaseWebSocketClient<DashboardEvent> {
    /**
     * プロジェクトに接続
     */
    connectToProject(baseUrl: string, projectPath: string): void;
    protected handleMessage(data: unknown): void;
}
/**
 * 通知WebSocketクライアント
 */
export declare class NotificationWebSocket extends BaseWebSocketClient<NotificationWSEvent> {
    /**
     * プロジェクトに接続
     */
    connectToProject(baseUrl: string, projectPath: string): void;
    protected handleMessage(data: unknown): void;
    /**
     * エージェントをサブスクライブ
     */
    subscribeAgents(agents: string[]): void;
    /**
     * 応答監視を開始
     */
    subscribeResponses(agent: string): void;
    /**
     * 応答監視を停止
     */
    unsubscribeResponses(): void;
    /**
     * メッセージを送信
     */
    private send;
}
export {};
//# sourceMappingURL=ws-client.d.ts.map