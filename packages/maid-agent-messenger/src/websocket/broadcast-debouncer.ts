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

import type { DashboardWebSocketServer } from "./dashboard-ws.js";
import type { DashboardEvent, DebouncedEvent } from "./types.js";

/** デバウンス遅延時間（ms）- サーバー側は短めに設定 */
const DEBOUNCE_DELAY = 100;

/** デバウンス対象のイベントタイプ */
const DEBOUNCE_EVENT_TYPES = new Set<DebouncedEvent["type"]>([
  "taskUpdated",
  "taskCreated",
  "taskAssigned",
  "statusUpdated",
]);

/** 保留中のブロードキャスト */
interface PendingBroadcast {
  timer: NodeJS.Timeout;
  events: DebouncedEvent[];
}

/** projectPath ごとの保留ブロードキャスト */
const pendingBroadcasts = new Map<string, PendingBroadcast>();

/**
 * イベントがデバウンス対象かを判定（型ガード）
 */
function isDebouncedEvent(event: DashboardEvent): event is DebouncedEvent {
  return DEBOUNCE_EVENT_TYPES.has(event.type as DebouncedEvent["type"]);
}

/**
 * デバウンス付きブロードキャスト
 *
 * @param wsServer WebSocketサーバーインスタンス
 * @param projectPath プロジェクトパス
 * @param event ブロードキャストするイベント
 */
export function debouncedBroadcast(
  wsServer: DashboardWebSocketServer,
  projectPath: string,
  event: DashboardEvent
): void {
  // デバウンス対象外のイベントはそのままブロードキャスト
  if (!isDebouncedEvent(event)) {
    wsServer.broadcast(projectPath, event);
    return;
  }

  const key = projectPath;
  const pending = pendingBroadcasts.get(key);

  if (pending) {
    // 既存のタイマーをクリアし、イベントを追加
    clearTimeout(pending.timer);
    pending.events.push(event);
  } else {
    // 新規エントリ
    pendingBroadcasts.set(key, {
      timer: null as unknown as NodeJS.Timeout,
      events: [event],
    });
  }

  // タイマーを再設定
  const newPending = pendingBroadcasts.get(key)!;
  newPending.timer = setTimeout(() => {
    const events = newPending.events;
    pendingBroadcasts.delete(key);

    if (events.length === 1) {
      // 単一イベント: そのままブロードキャスト
      wsServer.broadcast(projectPath, events[0]);
    } else {
      // 複数イベント: バッチイベントとしてブロードキャスト
      wsServer.broadcast(projectPath, {
        type: "tasksBatchUpdated",
        events: events,
        count: events.length,
      });
    }
  }, DEBOUNCE_DELAY);
}

/**
 * 保留中のブロードキャストをすべてクリア（テスト用）
 */
export function clearPendingBroadcasts(): void {
  for (const pending of pendingBroadcasts.values()) {
    clearTimeout(pending.timer);
  }
  pendingBroadcasts.clear();
}
