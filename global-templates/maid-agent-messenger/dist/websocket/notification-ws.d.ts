/**
 * Notification WebSocket Server
 *
 * history.logを監視し、新規エントリをリアルタイム配信
 * jsonlファイルを監視し、Claude Code応答をリアルタイム配信
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
    private responseWatchers;
    private responseFileSizes;
    private responseDebounceTimers;
    private static readonly RESPONSE_DEBOUNCE_MS;
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
    /**
     * agentのsession_idを取得
     */
    private getSessionId;
    /**
     * プロジェクトパスをClaude形式に変換
     */
    private getClaudeProjectId;
    /**
     * jsonlファイルパスを取得
     */
    private getJsonlPath;
    /**
     * Claude Code応答の監視を再起動（session_id更新対応）
     */
    private restartWatchingResponses;
    /**
     * Claude Code応答の監視を開始
     */
    private startWatchingResponses;
    /**
     * jsonlファイル変更を処理
     */
    private handleJsonlChange;
    /**
     * 新しいjsonl行からassistantのtext応答を抽出
     */
    private parseNewResponses;
    /**
     * 応答をクライアントに配信
     */
    private broadcastResponse;
    /**
     * 応答監視をクリーンアップ
     */
    private cleanupResponseWatcher;
    close(): void;
}
