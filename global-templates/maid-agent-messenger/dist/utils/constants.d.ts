/**
 * バリデーション関連の定数
 */
export declare const VALIDATION: {
    /** description フィールドの最大文字数 (task-891-3 W-4) */
    readonly MAX_DESCRIPTION_LENGTH: 10000;
};
/**
 * タイムアウト関連の定数
 * 散在していたマジックナンバーを集約
 */
export declare const TIMEOUTS: {
    /** リフレッシュスロットル (2秒) - 連続リクエスト防止 */
    readonly REFRESH_THROTTLE: 2000;
    /** ping タイムアウト (5秒) - WebSocket ping 応答待ち */
    readonly PING_TIMEOUT: 5000;
    /** ping 間隔 (30秒) - WebSocket keepalive */
    readonly PING_INTERVAL: 30000;
    /** 再接続間隔 (30秒) - WebSocket 再接続待ち */
    readonly RECONNECT_INTERVAL: 30000;
    /** 最大再接続間隔 (2分) - 再接続の最大待ち時間 */
    readonly MAX_RECONNECT_INTERVAL: 120000;
};
