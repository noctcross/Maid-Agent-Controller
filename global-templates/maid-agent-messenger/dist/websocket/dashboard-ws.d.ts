/**
 * ダッシュボード用 WebSocket サーバー
 */
import type { Server } from "http";
import { DashboardEvent, DashboardStats, TasksHtml, WebSocketConfig } from "./types.js";
export declare class DashboardWebSocketServer {
    private wss;
    private clients;
    private config;
    private pingTimers;
    constructor(server: Server, config?: Partial<WebSocketConfig>);
    private setupConnectionHandler;
    private generateSessionId;
    private send;
    private handleMessage;
    private handleDisconnect;
    private startPingTimer;
    private stopPingTimer;
    /**
     * 特定プロジェクトの全クライアントにイベントを配信
     */
    broadcast(projectPath: string, event: DashboardEvent): void;
    /**
     * 全クライアントにイベントを配信
     */
    broadcastAll(event: DashboardEvent): void;
    /**
     * 接続中のクライアント数を取得
     */
    getClientCount(): number;
    /**
     * 特定プロジェクトのクライアント数を取得
     */
    getClientCountByProject(projectPath: string): number;
    /**
     * 定期的なデータ更新を開始（フォールバック用）
     * イベント駆動が完全に機能するまでの暫定措置
     */
    startPeriodicUpdate(projectPath: string, fetchData: () => Promise<{
        stats: DashboardStats;
        tasks: TasksHtml;
    }>, intervalMs?: number): NodeJS.Timeout;
    /**
     * シャットダウン
     */
    close(): void;
}
