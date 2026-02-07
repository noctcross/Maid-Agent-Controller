/**
 * MCPセッションのキープアライブ管理
 * サーバーからクライアントへ定期的にpingを送信し、無応答セッションを切断する
 */

import { EmptyResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { SessionInfo } from "./session-manager.js";
import { sessions } from "./session-manager.js";
import type { KeepAliveConfig } from "../utils/config-loader.js";

export class KeepAliveManager {
  private config: KeepAliveConfig;

  constructor(config: KeepAliveConfig) {
    this.config = config;
  }

  /**
   * セッションのpingタイマーを開始
   */
  startPing(sessionId: string, session: SessionInfo): void {
    if (!this.config.ping_enabled) {
      return;
    }

    // 既存タイマーがあれば停止
    this.stopPing(sessionId, session);

    session.pingTimer = setInterval(async () => {
      try {
        // 低レベルServer経由でpingを送信（カスタムタイムアウト付き）
        await session.server.server.request(
          { method: "ping" },
          EmptyResultSchema,
          { timeout: this.config.ping_timeout }
        );

        // 成功: カウンタリセット
        session.missedPings = 0;
        session.lastActivity = new Date();
      } catch {
        // 失敗: カウンタ増加
        session.missedPings++;
        console.log(
          `[KeepAlive] Ping failed for session ${sessionId} ` +
          `(missed: ${session.missedPings}/${this.config.max_missed_pings})`
        );

        // 上限超過: Pingを停止するがセッションは保全（GCのidle timeoutに委ねる）
        if (session.missedPings >= this.config.max_missed_pings) {
          console.warn(
            `[KeepAlive] Session ${sessionId} has ${session.missedPings} missed pings ` +
            `(SSE likely disconnected). Stopping ping, session preserved for GC.`
          );
          this.stopPing(sessionId, session);
        }
      }
    }, this.config.ping_interval);
  }

  /**
   * セッションのpingタイマーを停止
   */
  stopPing(_sessionId: string, session: SessionInfo): void {
    if (session.pingTimer) {
      clearInterval(session.pingTimer);
      session.pingTimer = undefined;
    }
  }

  /**
   * 全セッションのpingタイマーを停止（シャットダウン時）
   */
  stopAll(): void {
    for (const [id, session] of sessions) {
      this.stopPing(id, session);
    }
  }
}
