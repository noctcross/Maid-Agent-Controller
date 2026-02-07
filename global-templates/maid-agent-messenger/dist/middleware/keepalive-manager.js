/**
 * MCPセッションのキープアライブ管理
 * サーバーからクライアントへ定期的にpingを送信し、無応答セッションを切断する
 */
import { EmptyResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { sessions } from "./session-manager.js";
export class KeepAliveManager {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * セッションのpingタイマーを開始
     */
    startPing(sessionId, session) {
        if (!this.config.ping_enabled) {
            return;
        }
        // 既存タイマーがあれば停止
        this.stopPing(sessionId, session);
        session.pingTimer = setInterval(async () => {
            try {
                // 低レベルServer経由でpingを送信（カスタムタイムアウト付き）
                await session.server.server.request({ method: "ping" }, EmptyResultSchema, { timeout: this.config.ping_timeout });
                // 成功: カウンタリセット
                session.missedPings = 0;
                session.lastActivity = new Date();
            }
            catch {
                // 失敗: カウンタ増加
                session.missedPings++;
                console.log(`[KeepAlive] Ping failed for session ${sessionId} ` +
                    `(missed: ${session.missedPings}/${this.config.max_missed_pings})`);
                // 上限超過: セッション切断
                if (session.missedPings >= this.config.max_missed_pings) {
                    console.log(`[KeepAlive] Session ${sessionId} is stale, closing`);
                    this.stopPing(sessionId, session);
                    session.transport.close();
                    sessions.delete(sessionId);
                }
            }
        }, this.config.ping_interval);
    }
    /**
     * セッションのpingタイマーを停止
     */
    stopPing(_sessionId, session) {
        if (session.pingTimer) {
            clearInterval(session.pingTimer);
            session.pingTimer = undefined;
        }
    }
    /**
     * 全セッションのpingタイマーを停止（シャットダウン時）
     */
    stopAll() {
        for (const [id, session] of sessions) {
            this.stopPing(id, session);
        }
    }
}
