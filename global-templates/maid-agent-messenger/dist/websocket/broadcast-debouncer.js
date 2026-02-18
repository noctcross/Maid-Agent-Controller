/**
 * ブロードキャストデバウンサー
 *
 * 短時間に連続するタスク更新イベントをバッチ化し、
 * 一定時間後にまとめてブロードキャストする。
 *
 * 目的:
 * - 一括操作時の表示巻き戻り防止
 * - 楽観的UI更新との競合回避
 */
/** デバウンス遅延時間（ms）- サーバー側は短めに設定 */
const DEBOUNCE_DELAY = 100;
/** デバウンス対象のイベントタイプ */
const DEBOUNCE_EVENT_TYPES = new Set([
    "taskUpdated",
    "taskCreated",
    "taskAssigned",
    "statusUpdated",
]);
/** projectPath ごとの保留ブロードキャスト */
const pendingBroadcasts = new Map();
/**
 * イベントがデバウンス対象かを判定（型ガード）
 */
function isDebouncedEvent(event) {
    return DEBOUNCE_EVENT_TYPES.has(event.type);
}
/**
 * デバウンス付きブロードキャスト
 *
 * @param wsServer WebSocketサーバーインスタンス
 * @param projectPath プロジェクトパス
 * @param event ブロードキャストするイベント
 */
export function debouncedBroadcast(wsServer, projectPath, event) {
    // [DEBUG] デバウンス一時無効化 - 即座にbroadcast
    console.log(`[DEBUG] WS broadcast immediate:`, JSON.stringify(event));
    wsServer.broadcast(projectPath, event);
}
/**
 * 保留中のブロードキャストをすべてクリア（テスト用）
 */
export function clearPendingBroadcasts() {
    for (const pending of pendingBroadcasts.values()) {
        clearTimeout(pending.timer);
    }
    pendingBroadcasts.clear();
}
