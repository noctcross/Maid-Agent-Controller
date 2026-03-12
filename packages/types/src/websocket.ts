/**
 * WebSocket関連の型定義
 *
 * @maid-agent/types - WebSocket types
 */

import type { Notification, AgentResponse } from "./api.js";

// =====================================================
// Dashboard WebSocket
// =====================================================

// ダッシュボード統計（WebSocket用）
export interface DashboardStats {
  pendingCount: number;
  workingCount: number;
  masterWaitingCount: number;
  completedTodayCount: number;
  timestamp: string;
}

// タスクHTML（WebSocket用、レガシー）
export interface TasksHtml {
  pending: string;
  working: string;
  completed: string;
  masterWaiting: string;
  skillCandidates: string;
  improvements: string;
}

// トランザクションID（クライアントが発行、自己/他者判定に使用）
export interface TransactionIdentifier {
  txId?: string;
}

// デバウンス対象のイベント（バッチ化可能）
export type DebouncedEvent =
  | ({
      type: "taskUpdated";
      taskId: string;
      field?: string;
      value?: unknown;
      task?: unknown;
    } & TransactionIdentifier)
  | ({ type: "taskCreated"; taskId: string; task?: unknown } & TransactionIdentifier)
  | ({
      type: "taskAssigned";
      taskId: string;
      assignee: string;
    } & TransactionIdentifier)
  | ({
      type: "statusUpdated";
      agentId: string;
      status: string;
    } & TransactionIdentifier);

// エスカレーション通知データ
export interface EscalationNotification {
  taskId: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  agentId: string;
  message: string;
  timestamp: string;
}

// ダッシュボードWebSocketイベント
export type DashboardEvent =
  | { type: "connected"; sessionId: string }
  | { type: "stats"; data: DashboardStats }
  | { type: "tasks"; data: TasksHtml }
  | DebouncedEvent
  | { type: "tasksBatchUpdated"; events: DebouncedEvent[]; count: number }
  | { type: "escalation"; data: EscalationNotification }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "error"; message: string };

// ダッシュボードクライアント（サーバーサイド）
export interface DashboardClient {
  sessionId: string;
  projectPath: string;
  lastPing: number;
  lastPong: number;
}

// WebSocket設定
export interface WebSocketConfig {
  pingInterval: number;
  pongTimeout: number;
  maxClients: number;
}

// =====================================================
// Notification WebSocket
// =====================================================

// 通知WebSocketイベント
export type NotificationWSEvent =
  | { type: "connected"; sessionId: string }
  | { type: "notification"; payload: Notification }
  | { type: "response"; payload: AgentResponse }
  | { type: "status"; payload: { agent: string; online: boolean } }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "error"; message: string };

// クライアント→サーバーメッセージ
export type NotificationWSClientMessage =
  | { type: "pong" }
  | { type: "subscribe"; agents: string[] }
  | { type: "subscribe_responses"; agent: string }
  | { type: "unsubscribe_responses" };

// =====================================================
// Generic WebSocket types
// =====================================================

// WebSocketイベントタイプ（汎用）
export type WebSocketEventType =
  | "connected"
  | "stats"
  | "tasks"
  | "taskUpdated"
  | "taskCreated"
  | "taskAssigned"
  | "statusUpdated"
  | "tasksBatchUpdated"
  | "escalation"
  | "notification"
  | "response"
  | "ping"
  | "pong"
  | "error";

// 汎用WebSocketメッセージ
export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType;
  payload?: T;
  sessionId?: string;
}
