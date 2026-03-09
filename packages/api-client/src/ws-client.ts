/**
 * WebSocket Client
 *
 * @maid-agent/api-client - WebSocket client for real-time updates
 */

import type {
  DashboardEvent,
  NotificationWSEvent,
  NotificationWSClientMessage,
  WebSocketMessage,
} from "@maid-agent/types";
import { ENDPOINTS, buildWebSocketUrl } from "./endpoints.js";

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
 * デフォルト設定
 */
const DEFAULT_CONFIG: WebSocketClientConfig = {
  maxReconnectAttempts: Infinity,
  initialReconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectBackoffMultiplier: 1.5,
};

/**
 * イベントハンドラ型
 */
export type WSEventHandler<T> = (event: T) => void;
export type ConnectionStateHandler = (connected: boolean) => void;

/**
 * WebSocketクライアント基底クラス
 */
abstract class BaseWebSocketClient<TEvent> {
  protected ws: WebSocket | null = null;
  protected url = "";
  protected reconnectAttempts = 0;
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  protected handlers: WSEventHandler<TEvent>[] = [];
  protected connectionStateHandlers: ConnectionStateHandler[] = [];
  protected isManualClose = false;
  protected config: WebSocketClientConfig;
  protected sessionId: string | null = null;

  constructor(config: Partial<WebSocketClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * WebSocket接続を開始
   */
  connect(url: string): void {
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
  reconnectWithNewUrl(url: string): void {
    this.cleanup();
    this.connect(url);
  }

  protected createConnection(): void {
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
        } catch (error) {
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
    } catch (error) {
      console.error("[WebSocket] Failed to create connection:", error);
      this.attemptReconnect();
    }
  }

  protected abstract handleMessage(data: unknown): void;

  protected sendPong(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "pong" }));
    }
  }

  protected attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.initialReconnectDelay *
        Math.pow(this.config.reconnectBackoffMultiplier, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createConnection();
    }, delay);
  }

  protected cleanup(): void {
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
  disconnect(): void {
    this.cleanup();
    this.notifyConnectionState(false);
  }

  /**
   * イベントハンドラを登録
   */
  subscribe(handler: WSEventHandler<TEvent>): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * 接続状態変更ハンドラを登録
   */
  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.push(handler);
    handler(this.isConnected());
    return () => {
      this.connectionStateHandlers = this.connectionStateHandlers.filter((h) => h !== handler);
    };
  }

  protected notifyConnectionState(connected: boolean): void {
    this.connectionStateHandlers.forEach((handler) => handler(connected));
  }

  /**
   * 接続状態を取得
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 現在のセッションIDを取得
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 再接続を強制実行
   */
  forceReconnect(): void {
    this.cleanup();
    this.isManualClose = false;
    this.reconnectAttempts = 0;
    this.createConnection();
  }
}

/**
 * ダッシュボードWebSocketクライアント
 */
export class DashboardWebSocket extends BaseWebSocketClient<DashboardEvent> {
  /**
   * プロジェクトに接続
   */
  connectToProject(baseUrl: string, projectPath: string): void {
    const url = buildWebSocketUrl(baseUrl, ENDPOINTS.websocket.dashboard, projectPath);
    this.connect(url);
  }

  protected handleMessage(data: unknown): void {
    const event = data as DashboardEvent;

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
export class NotificationWebSocket extends BaseWebSocketClient<NotificationWSEvent> {
  /**
   * プロジェクトに接続
   */
  connectToProject(baseUrl: string, projectPath: string): void {
    const url = buildWebSocketUrl(baseUrl, ENDPOINTS.websocket.notifications, projectPath);
    this.connect(url);
  }

  protected handleMessage(data: unknown): void {
    const event = data as NotificationWSEvent;

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
  subscribeAgents(agents: string[]): void {
    this.send({ type: "subscribe", agents });
  }

  /**
   * 応答監視を開始
   */
  subscribeResponses(agent: string): void {
    this.send({ type: "subscribe_responses", agent });
  }

  /**
   * 応答監視を停止
   */
  unsubscribeResponses(): void {
    this.send({ type: "unsubscribe_responses" });
  }

  /**
   * メッセージを送信
   */
  private send(message: NotificationWSClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
