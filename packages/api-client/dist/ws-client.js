/**
 * WebSocket Client
 *
 * @maid-agent/api-client - WebSocket client for real-time updates
 */
import { ENDPOINTS, buildWebSocketUrl } from "./endpoints.js";
/**
 * デフォルト設定
 */
const DEFAULT_CONFIG = {
    maxReconnectAttempts: Infinity,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30000,
    reconnectBackoffMultiplier: 1.5,
};
/**
 * WebSocketクライアント基底クラス
 */
class BaseWebSocketClient {
    ws = null;
    url = "";
    reconnectAttempts = 0;
    reconnectTimer = null;
    handlers = [];
    connectionStateHandlers = [];
    isManualClose = false;
    config;
    sessionId = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * WebSocket接続を開始
     */
    connect(url) {
        if (this.url === url && this.ws?.readyState === WebSocket.OPEN) {
            return;
        }
        this.cleanup();
        this.url = url;
        this.isManualClose = false;
        this.reconnectAttempts = 0;
        this.createConnection();
    }
    /**
     * URL変更時の再接続
     */
    reconnectWithNewUrl(url) {
        this.cleanup();
        this.connect(url);
    }
    createConnection() {
        if (!this.url) {
            console.error("[WebSocket] No URL specified");
            return;
        }
        try {
            this.ws = new WebSocket(this.url);
            this.ws.onopen = () => {
                this.reconnectAttempts = 0;
                this.notifyConnectionState(true);
            };
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                }
                catch (error) {
                    console.error("[WebSocket] Failed to parse message:", error);
                }
            };
            this.ws.onerror = () => {
                console.warn("[WebSocket] Connection error (will retry)");
            };
            this.ws.onclose = (event) => {
                this.sessionId = null;
                this.notifyConnectionState(false);
                if (!this.isManualClose) {
                    this.attemptReconnect();
                }
            };
        }
        catch (error) {
            console.error("[WebSocket] Failed to create connection:", error);
            this.attemptReconnect();
        }
    }
    sendPong() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "pong" }));
        }
    }
    attemptReconnect() {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            return;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectAttempts++;
        const delay = Math.min(this.config.initialReconnectDelay *
            Math.pow(this.config.reconnectBackoffMultiplier, this.reconnectAttempts - 1), this.config.maxReconnectDelay);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.createConnection();
        }, delay);
    }
    cleanup() {
        this.isManualClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close(1000, "Client cleanup");
            }
            this.ws = null;
        }
        this.sessionId = null;
    }
    /**
     * 手動切断
     */
    disconnect() {
        this.cleanup();
        this.notifyConnectionState(false);
    }
    /**
     * イベントハンドラを登録
     */
    subscribe(handler) {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter((h) => h !== handler);
        };
    }
    /**
     * 接続状態変更ハンドラを登録
     */
    onConnectionStateChange(handler) {
        this.connectionStateHandlers.push(handler);
        handler(this.isConnected());
        return () => {
            this.connectionStateHandlers = this.connectionStateHandlers.filter((h) => h !== handler);
        };
    }
    notifyConnectionState(connected) {
        this.connectionStateHandlers.forEach((handler) => handler(connected));
    }
    /**
     * 接続状態を取得
     */
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
    /**
     * 現在のセッションIDを取得
     */
    getSessionId() {
        return this.sessionId;
    }
    /**
     * 再接続を強制実行
     */
    forceReconnect() {
        this.cleanup();
        this.isManualClose = false;
        this.reconnectAttempts = 0;
        this.createConnection();
    }
}
/**
 * ダッシュボードWebSocketクライアント
 */
export class DashboardWebSocket extends BaseWebSocketClient {
    /**
     * プロジェクトに接続
     */
    connectToProject(baseUrl, projectPath) {
        const url = buildWebSocketUrl(baseUrl, ENDPOINTS.websocket.dashboard, projectPath);
        this.connect(url);
    }
    handleMessage(data) {
        const event = data;
        // pingに対してpongを返す
        if (event.type === "ping") {
            this.sendPong();
            return;
        }
        // connectedイベントからセッションIDを保存
        if (event.type === "connected" && "sessionId" in event) {
            this.sessionId = event.sessionId;
        }
        // ハンドラに通知
        this.handlers.forEach((handler) => handler(event));
    }
}
/**
 * 通知WebSocketクライアント
 */
export class NotificationWebSocket extends BaseWebSocketClient {
    /**
     * プロジェクトに接続
     */
    connectToProject(baseUrl, projectPath) {
        const url = buildWebSocketUrl(baseUrl, ENDPOINTS.websocket.notifications, projectPath);
        this.connect(url);
    }
    handleMessage(data) {
        const event = data;
        // pingに対してpongを返す
        if (event.type === "ping") {
            this.sendPong();
            return;
        }
        // connectedイベントからセッションIDを保存
        if (event.type === "connected" && "sessionId" in event) {
            this.sessionId = event.sessionId;
        }
        // ハンドラに通知
        this.handlers.forEach((handler) => handler(event));
    }
    /**
     * エージェントをサブスクライブ
     */
    subscribeAgents(agents) {
        this.send({ type: "subscribe", agents });
    }
    /**
     * 応答監視を開始
     */
    subscribeResponses(agent) {
        this.send({ type: "subscribe_responses", agent });
    }
    /**
     * 応答監視を停止
     */
    unsubscribeResponses() {
        this.send({ type: "unsubscribe_responses" });
    }
    /**
     * メッセージを送信
     */
    send(message) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}
