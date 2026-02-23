/**
 * ダッシュボード用 WebSocket サーバー
 */

import { WebSocketServer, WebSocket, RawData } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { URL } from "url";
import {
  DashboardClient,
  DashboardEvent,
  DashboardStats,
  TasksHtml,
  WebSocketConfig,
  DEFAULT_WS_CONFIG,
  EscalationNotification,
} from "./types.js";

export class DashboardWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, { ws: WebSocket; client: DashboardClient }> =
    new Map();
  private config: WebSocketConfig;
  private pingTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(server: Server, config: Partial<WebSocketConfig> = {}) {
    this.config = { ...DEFAULT_WS_CONFIG, ...config };
    this.wss = new WebSocketServer({
      server,
      path: "/dashboard/ws",
    });
    this.setupConnectionHandler();
  }

  private setupConnectionHandler(): void {
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      // クエリパラメータから projectPath を取得
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const projectPath = url.searchParams.get("project") || "";

      if (!projectPath) {
        ws.close(4001, "Missing project parameter");
        return;
      }

      // クライアント登録
      const sessionId = this.generateSessionId();
      const client: DashboardClient = {
        sessionId,
        projectPath,
        lastPing: Date.now(),
        lastPong: Date.now(),
      };

      this.clients.set(sessionId, { ws, client });
      console.log(
        `[WS] Client connected: ${sessionId} (project: ${projectPath})`
      );

      // 接続確認メッセージ送信
      this.send(ws, { type: "connected", sessionId });

      // Pingタイマー開始
      this.startPingTimer(sessionId, ws);

      // メッセージハンドラ
      ws.on("message", (data: RawData) => {
        this.handleMessage(sessionId, data);
      });

      // 切断ハンドラ
      ws.on("close", () => {
        this.handleDisconnect(sessionId);
      });

      // エラーハンドラ
      ws.on("error", (error) => {
        console.error(`[WS] Error on ${sessionId}:`, error);
        this.handleDisconnect(sessionId);
      });
    });
  }

  private generateSessionId(): string {
    return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private send(ws: WebSocket, event: DashboardEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  private handleMessage(sessionId: string, data: RawData): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "pong") {
        const entry = this.clients.get(sessionId);
        if (entry) {
          entry.client.lastPong = Date.now();
        }
      }
    } catch (error) {
      console.error(`[WS] Invalid message from ${sessionId}:`, error);
    }
  }

  private handleDisconnect(sessionId: string): void {
    this.stopPingTimer(sessionId);
    this.clients.delete(sessionId);
    console.log(`[WS] Client disconnected: ${sessionId}`);
  }

  private startPingTimer(sessionId: string, ws: WebSocket): void {
    const timer = setInterval(() => {
      const entry = this.clients.get(sessionId);
      if (!entry) {
        this.stopPingTimer(sessionId);
        return;
      }

      // Pong タイムアウトチェック
      const timeSinceLastPong = Date.now() - entry.client.lastPong;
      if (
        timeSinceLastPong >
        this.config.pingInterval + this.config.pongTimeout
      ) {
        console.log(`[WS] Client ${sessionId} timed out`);
        ws.close(4002, "Pong timeout");
        this.handleDisconnect(sessionId);
        return;
      }

      // Ping 送信
      entry.client.lastPing = Date.now();
      this.send(ws, { type: "ping" });
    }, this.config.pingInterval);

    this.pingTimers.set(sessionId, timer);
  }

  private stopPingTimer(sessionId: string): void {
    const timer = this.pingTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.pingTimers.delete(sessionId);
    }
  }

  /**
   * 特定プロジェクトの全クライアントにイベントを配信
   */
  public broadcast(projectPath: string, event: DashboardEvent): void {
    this.clients.forEach(({ ws, client }) => {
      if (client.projectPath === projectPath && ws.readyState === WebSocket.OPEN) {
        this.send(ws, event);
      }
    });
  }

  /**
   * 全クライアントにイベントを配信
   */
  public broadcastAll(event: DashboardEvent): void {
    this.clients.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, event);
      }
    });
  }

  /**
   * 特定プロジェクトにエスカレーション通知を配信
   */
  public broadcastEscalation(projectPath: string, notification: EscalationNotification): void {
    console.log(`[WS] Broadcasting escalation to ${projectPath}: ${notification.title}`);
    this.broadcast(projectPath, { type: "escalation", data: notification });
  }

  /**
   * 全クライアントにエスカレーション通知を配信
   */
  public broadcastAllEscalation(notification: EscalationNotification): void {
    console.log(`[WS] Broadcasting escalation to all: ${notification.title}`);
    this.broadcastAll({ type: "escalation", data: notification });
  }

  /**
   * 接続中のクライアント数を取得
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 特定プロジェクトのクライアント数を取得
   */
  public getClientCountByProject(projectPath: string): number {
    let count = 0;
    this.clients.forEach(({ client }) => {
      if (client.projectPath === projectPath) count++;
    });
    return count;
  }

  /**
   * 定期的なデータ更新を開始（フォールバック用）
   * イベント駆動が完全に機能するまでの暫定措置
   */
  public startPeriodicUpdate(
    projectPath: string,
    fetchData: () => Promise<{ stats: DashboardStats; tasks: TasksHtml }>,
    intervalMs: number = 10000
  ): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        const { stats, tasks } = await fetchData();
        this.broadcast(projectPath, { type: "stats", data: stats });
        this.broadcast(projectPath, { type: "tasks", data: tasks });
      } catch (error) {
        console.error("[WS] Periodic update error:", error);
      }
    }, intervalMs);
  }

  /**
   * シャットダウン
   */
  public close(): void {
    this.pingTimers.forEach((_, sessionId) => this.stopPingTimer(sessionId));
    this.clients.forEach(({ ws }) => ws.close(1001, "Server shutting down"));
    this.clients.clear();
    this.wss.close();
  }
}
