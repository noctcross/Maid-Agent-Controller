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
import type { DashboardEvent } from "./types.js";
/**
 * デバウンス付きブロードキャスト
 *
 * @param wsServer WebSocketサーバーインスタンス
 * @param projectPath プロジェクトパス
 * @param event ブロードキャストするイベント
 */
export declare function debouncedBroadcast(wsServer: DashboardWebSocketServer, projectPath: string, event: DashboardEvent): void;
/**
 * 保留中のブロードキャストをすべてクリア（テスト用）
 */
export declare function clearPendingBroadcasts(): void;
