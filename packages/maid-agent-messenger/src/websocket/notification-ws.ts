/**
 * Notification WebSocket Server
 *
 * history.logを監視し、新規エントリをリアルタイム配信
 * jsonlファイルを監視し、Claude Code応答をリアルタイム配信
 *
 * @path /ws/notifications?project={projectPath}
 */

import { WebSocketServer, WebSocket, RawData } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { URL } from "url";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as os from "os";
import * as yaml from "yaml";
import path from "path";
import { logger } from "../utils/logger.js";

interface NotificationClient {
  sessionId: string;
  projectPath: string;
  subscribedAgents: string[] | null; // null = all
  subscribedResponseAgent: string | null; // 応答監視中のagent
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

interface ResponsePayload {
  id: string;
  timestamp: string;
  agent: string;
  text: string;
  type: "response";
}

/** maid/{agent}.yaml の型 */
interface MaidConfig {
  session_id?: string;
  [key: string]: unknown;
}

type WSServerMessage =
  | { type: "connected"; sessionId: string }
  | { type: "notification"; payload: NotificationPayload }
  | { type: "response"; payload: ResponsePayload }
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
  // history.log 監視用
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private fileSizes: Map<string, number> = new Map();
  // jsonl（Claude Code応答）監視用
  private responseWatchers: Map<string, fs.FSWatcher> = new Map(); // key: projectPath:agent
  private responseFileSizes: Map<string, number> = new Map();
  private responseDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private static readonly RESPONSE_DEBOUNCE_MS = 200;

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
        subscribedResponseAgent: null,
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
        // 応答監視もクリーンアップ
        if (client.subscribedResponseAgent) {
          this.cleanupResponseWatcher(projectPath, client.subscribedResponseAgent);
        }
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
      logger.info(`[WS] Received from ${sessionId}: ${JSON.stringify(message)}`);
      const entry = this.clients.get(sessionId);
      if (!entry) return;

      if (message.type === "pong") {
        entry.client.lastPong = Date.now();
      } else if (message.type === "subscribe") {
        entry.client.subscribedAgents = message.agents || null;
        logger.info(
          `Client ${sessionId} subscribed to agents: ${message.agents?.join(", ") || "all"}`
        );
      } else if (message.type === "subscribe_responses") {
        // Claude Code応答監視を開始
        const agent = message.agent as string;
        if (!agent) {
          logger.warn(`Client ${sessionId} subscribe_responses missing agent`);
          return;
        }
        // 前のsubscriptionがあればクリーンアップ
        const prevAgent = entry.client.subscribedResponseAgent;
        // 先にnullにしてからcleanupを呼ぶ（自分自身がカウントされないように）
        entry.client.subscribedResponseAgent = null;
        if (prevAgent) {
          this.cleanupResponseWatcher(entry.client.projectPath, prevAgent);
        }
        entry.client.subscribedResponseAgent = agent;
        // 同じagentでも再subscribeの場合は監視を再起動（session_id更新対応）
        this.restartWatchingResponses(entry.client.projectPath, agent).catch((err) => {
          logger.error(`Failed to restart watching responses: ${err}`);
        });
        logger.info(`Client ${sessionId} subscribed to responses: ${agent}`);
      } else if (message.type === "unsubscribe_responses") {
        // Claude Code応答監視を停止
        if (entry.client.subscribedResponseAgent) {
          this.cleanupResponseWatcher(entry.client.projectPath, entry.client.subscribedResponseAgent);
          entry.client.subscribedResponseAgent = null;
          logger.info(`Client ${sessionId} unsubscribed from responses`);
        }
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

  // ========== Claude Code応答（jsonl）監視 ==========

  /**
   * agentのsession_idを取得
   */
  private async getSessionId(projectPath: string, agent: string): Promise<string | null> {
    try {
      const maidConfigPath = path.join(
        projectPath,
        ".maid-agent/system/data/maid",
        `${agent}.yaml`
      );
      const configContent = await fsPromises.readFile(maidConfigPath, "utf-8");
      const maidConfig = yaml.parse(configContent) as MaidConfig;
      return maidConfig.session_id || null;
    } catch {
      return null;
    }
  }

  /**
   * プロジェクトパスをClaude形式に変換
   */
  private getClaudeProjectId(projectPath: string): string {
    return projectPath.replace(/^\//, "").replace(/[/_]/g, "-");
  }

  /**
   * jsonlファイルパスを取得
   */
  private getJsonlPath(projectPath: string, sessionId: string): string {
    const claudeProjectId = this.getClaudeProjectId(projectPath);
    return path.join(
      os.homedir(),
      ".claude/projects",
      `-${claudeProjectId}`,
      `${sessionId}.jsonl`
    );
  }

  /**
   * Claude Code応答の監視を再起動（session_id更新対応）
   */
  private async restartWatchingResponses(projectPath: string, agent: string): Promise<void> {
    const watchKey = `${projectPath}:${agent}`;

    // 既存の監視があれば停止
    const existingWatcher = this.responseWatchers.get(watchKey);
    if (existingWatcher) {
      existingWatcher.close();
      this.responseWatchers.delete(watchKey);
      this.responseFileSizes.delete(watchKey);
      const timer = this.responseDebounceTimers.get(watchKey);
      if (timer) {
        clearTimeout(timer);
        this.responseDebounceTimers.delete(watchKey);
      }
      logger.info(`Stopped existing response watcher: ${watchKey}`);
    }

    // 新しい監視を開始
    await this.startWatchingResponses(projectPath, agent);
  }

  /**
   * Claude Code応答の監視を開始
   */
  private async startWatchingResponses(projectPath: string, agent: string): Promise<void> {
    const watchKey = `${projectPath}:${agent}`;
    if (this.responseWatchers.has(watchKey)) return;

    const sessionId = await this.getSessionId(projectPath, agent);
    if (!sessionId) {
      logger.warn(`No session_id for agent: ${agent}`);
      return;
    }

    const jsonlPath = this.getJsonlPath(projectPath, sessionId);

    try {
      // 初期ファイルサイズを取得
      const stats = fs.statSync(jsonlPath);
      this.responseFileSizes.set(watchKey, stats.size);

      const watcher = fs.watch(jsonlPath, (eventType) => {
        if (eventType === "change") {
          // debounce処理（fs.watchは複数回イベントを発火する）
          const existingTimer = this.responseDebounceTimers.get(watchKey);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }
          const timer = setTimeout(() => {
            this.handleJsonlChange(projectPath, agent, jsonlPath, watchKey);
            this.responseDebounceTimers.delete(watchKey);
          }, NotificationWebSocketServer.RESPONSE_DEBOUNCE_MS);
          this.responseDebounceTimers.set(watchKey, timer);
        }
      });

      this.responseWatchers.set(watchKey, watcher);
      logger.info(`Started watching responses: ${jsonlPath}`);
    } catch (error) {
      logger.warn(`Response file not found: ${jsonlPath}`, error instanceof Error ? error : { error });
    }
  }

  /**
   * jsonlファイル変更を処理
   */
  private handleJsonlChange(
    projectPath: string,
    agent: string,
    jsonlPath: string,
    watchKey: string
  ): void {
    try {
      const stats = fs.statSync(jsonlPath);
      const prevSize = this.responseFileSizes.get(watchKey) || 0;

      if (stats.size <= prevSize) {
        this.responseFileSizes.set(watchKey, stats.size);
        return;
      }

      // 追加された部分だけ読み込む
      const fd = fs.openSync(jsonlPath, "r");
      const buffer = Buffer.alloc(stats.size - prevSize);
      fs.readSync(fd, buffer, 0, buffer.length, prevSize);
      fs.closeSync(fd);

      this.responseFileSizes.set(watchKey, stats.size);

      // 新規行をパースしてassistantのtext応答を抽出
      const newContent = buffer.toString("utf-8");
      const responses = this.parseNewResponses(newContent, agent);

      // 各クライアントに配信
      for (const response of responses) {
        this.broadcastResponse(projectPath, agent, response);
      }
    } catch (error) {
      logger.error(
        "Jsonl change handling error:",
        error instanceof Error ? error : { error }
      );
    }
  }

  /**
   * 新しいjsonl行からassistantのtext応答を抽出
   */
  private parseNewResponses(
    content: string,
    agent: string
  ): ResponsePayload[] {
    const lines = content.split("\n").filter((line) => line.trim());
    const responses: ResponsePayload[] = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type === "assistant" && data.message?.content) {
          const textContents = data.message.content.filter(
            (c: { type: string; text?: string }) => c.type === "text" && c.text
          );

          for (const tc of textContents) {
            responses.push({
              id: data.uuid || `${data.timestamp}-${responses.length}`,
              timestamp: data.timestamp,
              agent,
              text: tc.text,
              type: "response",
            });
          }
        }
      } catch {
        // JSONパースエラーは無視
      }
    }

    return responses;
  }

  /**
   * 応答をクライアントに配信
   */
  private broadcastResponse(
    projectPath: string,
    agent: string,
    response: ResponsePayload
  ): void {
    this.clients.forEach(({ ws, client }) => {
      if (client.projectPath !== projectPath) return;
      if (client.subscribedResponseAgent !== agent) return;
      if (ws.readyState !== WebSocket.OPEN) return;

      this.send(ws, {
        type: "response",
        payload: response,
      });
    });

    logger.info(`Broadcasted response from ${agent}`);
  }

  /**
   * 応答監視をクリーンアップ
   */
  private cleanupResponseWatcher(projectPath: string, agent: string): void {
    const watchKey = `${projectPath}:${agent}`;

    // このagentを監視しているクライアントがいるか確認
    let hasClient = false;
    this.clients.forEach(({ client }) => {
      if (
        client.projectPath === projectPath &&
        client.subscribedResponseAgent === agent
      ) {
        hasClient = true;
      }
    });

    if (!hasClient) {
      // debounceタイマーをクリア
      const timer = this.responseDebounceTimers.get(watchKey);
      if (timer) {
        clearTimeout(timer);
        this.responseDebounceTimers.delete(watchKey);
      }

      const watcher = this.responseWatchers.get(watchKey);
      if (watcher) {
        watcher.close();
        this.responseWatchers.delete(watchKey);
        this.responseFileSizes.delete(watchKey);
        logger.info(`Stopped watching responses: ${watchKey}`);
      }
    }
  }

  public close(): void {
    this.fileWatchers.forEach((watcher) => watcher.close());
    this.responseWatchers.forEach((watcher) => watcher.close());
    this.responseDebounceTimers.forEach((timer) => clearTimeout(timer));
    this.clients.forEach(({ ws }) => ws.close(1001, "Server shutting down"));
    this.wss.close();
    logger.info("NotificationWebSocketServer closed");
  }
}
