/**
 * MCPセッションのキープアライブ管理
 * サーバーからクライアントへ定期的にpingを送信し、無応答セッションを切断する
 */
import type { SessionInfo } from "./session-manager.js";
import type { KeepAliveConfig } from "../utils/config-loader.js";
export declare class KeepAliveManager {
    private config;
    constructor(config: KeepAliveConfig);
    /**
     * セッションのpingタイマーを開始
     */
    startPing(sessionId: string, session: SessionInfo): void;
    /**
     * セッションのpingタイマーを停止
     */
    stopPing(_sessionId: string, session: SessionInfo): void;
    /**
     * 全セッションのpingタイマーを停止（シャットダウン時）
     */
    stopAll(): void;
}
