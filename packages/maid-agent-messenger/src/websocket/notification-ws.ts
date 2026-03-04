/**
 * Notification WebSocket Server
 *
 * history.logを監視し、新規エントリをリアルタイム配信
 *
 * @path /ws/notifications?project={projectPath}
 */

import { WebSocketServer, WebSocket, RawData } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { URL } from "url";
import * as fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";

interface NotificationClient {
  sessionId: string;
  projectPath: string;
  subscribedAgents: string[] | null; // null = all
  lastPong: number;
}

interface NotificationPayload {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  message: string;
  status: "sent";
}

type WSServerMessage =
  | { type: "connected"; sessionId: string }
  | { type: "notification"; payload: NotificationPayload }
  | { type: "status"; payload: { agent: string; online: boolean } }
  | { type: "ping" };

const NOTIFICATION_PATTERN =
  /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (\w+) → (\w+): (.*)$/;

// ping間隔（ms）
const PING_INTERVAL_MS = 30000;

export class NotificationWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, { ws: WebSocket; client: NotificationClient }> =
    new Map();
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private fileSizes: Map<string, number> = new Map();

  constructor(server: Server | null) {
    // noServer: true で作成し、upgrade イベントは外部で処理
    this.wss = server
      ? new WebSocketServer({ server, path: "/ws/notifications" })
      : new WebSocketServer({ noServer: true });
    this.setupConnectionHandler();
    logger.info("NotificationWebSocketServer initialized");
  }

  /**
   * HTTP upgrade リクエストを処理
   */
  public handleUpgrade(
    request: IncomingMessage,
    socket: import("stream").Duplex,
    head: Buffer
  ): void {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  /**
   * パスが一致するかチェック
   */
  public shouldHandle(pathname: string): boolean {
    return pathname === "/ws/notifications" || pathname.startsWith("/ws/notifications?");
  }

  private setupConnectionHandler(): void {
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const projectPath = url.searchParams.get("project") || "";

      if (!projectPath) {
        ws.close(4001, "Missing project parameter");
        return;
      }

      const sessionId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const client: NotificationClient = {
        sessionId,
        projectPath,
        subscribedAgents: null,
        lastPong: Date.now(),
      };

      this.clients.set(sessionId, { ws, client });
      this.send(ws, { type: "connected", sessionId });

      logger.info(`Notification client connected: ${sessionId}`);

      // history.log 監視を開始
      this.startWatching(projectPath);

      // ping タイマー
      const pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          this.send(ws, { type: "ping" });
        }
      }, PING_INTERVAL_MS);

      ws.on("message", (data: RawData) => {
        this.handleMessage(sessionId, data);
      });

      ws.on("close", () => {
        clearInterval(pingTimer);
        this.clients.delete(sessionId);
        this.cleanupWatcher(projectPath);
        logger.info(`Notification client disconnected: ${sessionId}`);
      });

      ws.on("error", (error) => {
        logger.error(`WebSocket error for ${sessionId}:`, error);
      });
    });
  }

  private send(ws: WebSocket, event: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  private handleMessage(sessionId: string, data: RawData): void {
    try {
      const message = JSON.parse(data.toString());
      const entry = this.clients.get(sessionId);
      if (!entry) return;

      if (message.type === "pong") {
        entry.client.lastPong = Date.now();
      } else if (message.type === "subscribe") {
        entry.client.subscribedAgents = message.agents || null;
        logger.info(
          `Client ${sessionId} subscribed to agents: ${message.agents?.join(", ") || "all"}`
        );
      }
    } catch (error) {
      logger.error(
        `Invalid message from ${sessionId}:`,
        error instanceof Error ? error : { error }
      );
    }
  }

  private startWatching(projectPath: string): void {
    if (this.fileWatchers.has(projectPath)) return;

    const historyPath = path.join(
      projectPath,
      ".maid-agent/system/data/notifications/history.log"
    );

    try {
      // 初期ファイルサイズを取得
      const stats = fs.statSync(historyPath);
      this.fileSizes.set(projectPath, stats.size);

      const watcher = fs.watch(historyPath, (eventType) => {
        if (eventType === "change") {
          this.handleFileChange(projectPath, historyPath);
        }
      });

      this.fileWatchers.set(projectPath, watcher);
      logger.info(`Started watching: ${historyPath}`);
    } catch {
      // ファイルが存在しない場合は無視
      logger.warn(`History file not found: ${historyPath}`);
    }
  }

  private handleFileChange(projectPath: string, historyPath: string): void {
    try {
      const stats = fs.statSync(historyPath);
      const prevSize = this.fileSizes.get(projectPath) || 0;

      if (stats.size <= prevSize) {
        this.fileSizes.set(projectPath, stats.size);
        return;
      }

      // 追加された部分だけ読み込む
      const fd = fs.openSync(historyPath, "r");
      const buffer = Buffer.alloc(stats.size - prevSize);
      fs.readSync(fd, buffer, 0, buffer.length, prevSize);
      fs.closeSync(fd);

      this.fileSizes.set(projectPath, stats.size);

      // 新規行をパース
      const newContent = buffer.toString("utf-8");
      const notifications = this.parseNewEntries(newContent);

      // 各クライアントに配信
      for (const notification of notifications) {
        this.broadcast(projectPath, notification);
      }
    } catch (error) {
      logger.error(
        "File change handling error:",
        error instanceof Error ? error : { error }
      );
    }
  }

  private parseNewEntries(
    content: string
  ): Array<{ from: string; to: string; message: string; timestamp: string }> {
    const lines = content.split("\n");
    const entries: Array<{
      from: string;
      to: string;
      message: string;
      timestamp: string;
    }> = [];
    let current: {
      timestamp: string;
      from: string;
      to: string;
      message: string;
    } | null = null;

    for (const line of lines) {
      const match = line.match(NOTIFICATION_PATTERN);
      if (match) {
        if (current) entries.push(current);
        current = {
          timestamp: match[1],
          from: match[2],
          to: match[3],
          message: match[4],
        };
      } else if (current && line.trim()) {
        current.message += "\n" + line;
      }
    }
    if (current) entries.push(current);

    return entries;
  }

  private broadcast(
    projectPath: string,
    notification: { from: string; to: string; message: string; timestamp: string }
  ): void {
    this.clients.forEach(({ ws, client }) => {
      if (client.projectPath !== projectPath) return;
      if (ws.readyState !== WebSocket.OPEN) return;

      // フィルタチェック
      if (client.subscribedAgents) {
        if (
          !client.subscribedAgents.includes(notification.from) &&
          !client.subscribedAgents.includes(notification.to)
        ) {
          return;
        }
      }

      const id = `${notification.timestamp.replace(/[-: ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
      this.send(ws, {
        type: "notification",
        payload: {
          id,
          timestamp: notification.timestamp.replace(" ", "T") + "+09:00",
          from: notification.from,
          to: notification.to,
          message: notification.message.trim(),
          status: "sent",
        },
      });
    });

    logger.info(
      `Broadcasted notification: ${notification.from} → ${notification.to}`
    );
  }

  private cleanupWatcher(projectPath: string): void {
    // このプロジェクトを監視しているクライアントがいるか確認
    let hasClient = false;
    this.clients.forEach(({ client }) => {
      if (client.projectPath === projectPath) hasClient = true;
    });

    if (!hasClient) {
      const watcher = this.fileWatchers.get(projectPath);
      if (watcher) {
        watcher.close();
        this.fileWatchers.delete(projectPath);
        this.fileSizes.delete(projectPath);
        logger.info(`Stopped watching: ${projectPath}`);
      }
    }
  }

  public close(): void {
    this.fileWatchers.forEach((watcher) => watcher.close());
    this.clients.forEach(({ ws }) => ws.close(1001, "Server shutting down"));
    this.wss.close();
    logger.info("NotificationWebSocketServer closed");
  }
}
