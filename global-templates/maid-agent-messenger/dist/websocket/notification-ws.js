/**
 * Notification WebSocket Server
 *
 * history.logを監視し、新規エントリをリアルタイム配信
 *
 * @path /ws/notifications?project={projectPath}
 */
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import * as fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
const NOTIFICATION_PATTERN = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (\w+) → (\w+): (.*)$/;
// ping間隔（ms）
const PING_INTERVAL_MS = 30000;
export class NotificationWebSocketServer {
    wss;
    clients = new Map();
    fileWatchers = new Map();
    fileSizes = new Map();
    constructor(server) {
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
    handleUpgrade(request, socket, head) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit("connection", ws, request);
        });
    }
    /**
     * パスが一致するかチェック
     */
    shouldHandle(pathname) {
        return pathname === "/ws/notifications" || pathname.startsWith("/ws/notifications?");
    }
    setupConnectionHandler() {
        this.wss.on("connection", (ws, req) => {
            const url = new URL(req.url || "", `http://${req.headers.host}`);
            const projectPath = url.searchParams.get("project") || "";
            if (!projectPath) {
                ws.close(4001, "Missing project parameter");
                return;
            }
            const sessionId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const client = {
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
            ws.on("message", (data) => {
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
    send(ws, event) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
        }
    }
    handleMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const entry = this.clients.get(sessionId);
            if (!entry)
                return;
            if (message.type === "pong") {
                entry.client.lastPong = Date.now();
            }
            else if (message.type === "subscribe") {
                entry.client.subscribedAgents = message.agents || null;
                logger.info(`Client ${sessionId} subscribed to agents: ${message.agents?.join(", ") || "all"}`);
            }
        }
        catch (error) {
            logger.error(`Invalid message from ${sessionId}:`, error instanceof Error ? error : { error });
        }
    }
    startWatching(projectPath) {
        if (this.fileWatchers.has(projectPath))
            return;
        const historyPath = path.join(projectPath, ".maid-agent/system/data/notifications/history.log");
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
        }
        catch {
            // ファイルが存在しない場合は無視
            logger.warn(`History file not found: ${historyPath}`);
        }
    }
    handleFileChange(projectPath, historyPath) {
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
        }
        catch (error) {
            logger.error("File change handling error:", error instanceof Error ? error : { error });
        }
    }
    parseNewEntries(content) {
        const lines = content.split("\n");
        const entries = [];
        let current = null;
        for (const line of lines) {
            const match = line.match(NOTIFICATION_PATTERN);
            if (match) {
                if (current)
                    entries.push(current);
                current = {
                    timestamp: match[1],
                    from: match[2],
                    to: match[3],
                    message: match[4],
                };
            }
            else if (current && line.trim()) {
                current.message += "\n" + line;
            }
        }
        if (current)
            entries.push(current);
        return entries;
    }
    broadcast(projectPath, notification) {
        this.clients.forEach(({ ws, client }) => {
            if (client.projectPath !== projectPath)
                return;
            if (ws.readyState !== WebSocket.OPEN)
                return;
            // フィルタチェック
            if (client.subscribedAgents) {
                if (!client.subscribedAgents.includes(notification.from) &&
                    !client.subscribedAgents.includes(notification.to)) {
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
        logger.info(`Broadcasted notification: ${notification.from} → ${notification.to}`);
    }
    cleanupWatcher(projectPath) {
        // このプロジェクトを監視しているクライアントがいるか確認
        let hasClient = false;
        this.clients.forEach(({ client }) => {
            if (client.projectPath === projectPath)
                hasClient = true;
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
    close() {
        this.fileWatchers.forEach((watcher) => watcher.close());
        this.clients.forEach(({ ws }) => ws.close(1001, "Server shutting down"));
        this.wss.close();
        logger.info("NotificationWebSocketServer closed");
    }
}
