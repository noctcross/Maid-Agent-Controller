/**
 * Notification WebSocket Server
 *
 * history.logを監視し、新規エントリをリアルタイム配信
 *
 * @path /ws/notifications?project={projectPath}
 */
import type { Server } from "http";
import type { IncomingMessage } from "http";
export declare class NotificationWebSocketServer {
    private wss;
    private clients;
    private fileWatchers;
    private fileSizes;
    constructor(server: Server | null);
    /**
     * HTTP upgrade リクエストを処理
     */
    handleUpgrade(request: IncomingMessage, socket: import("stream").Duplex, head: Buffer): void;
    /**
     * パスが一致するかチェック
     */
    shouldHandle(pathname: string): boolean;
    private setupConnectionHandler;
    private send;
    private handleMessage;
    private startWatching;
    private handleFileChange;
    private parseNewEntries;
    private broadcast;
    private cleanupWatcher;
    close(): void;
}
