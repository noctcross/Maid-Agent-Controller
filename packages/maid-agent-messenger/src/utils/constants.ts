/**
 * タイムアウト関連の定数
 * 散在していたマジックナンバーを集約
 */
export const TIMEOUTS = {
  /** リフレッシュスロットル (2秒) - 連続リクエスト防止 */
  REFRESH_THROTTLE: 2000,
  /** ping タイムアウト (5秒) - WebSocket ping 応答待ち */
  PING_TIMEOUT: 5000,
  /** ping 間隔 (30秒) - WebSocket keepalive */
  PING_INTERVAL: 30000,
  /** 再接続間隔 (30秒) - WebSocket 再接続待ち */
  RECONNECT_INTERVAL: 30000,
  /** 最大再接続間隔 (2分) - 再接続の最大待ち時間 */
  MAX_RECONNECT_INTERVAL: 120000,
} as const;
