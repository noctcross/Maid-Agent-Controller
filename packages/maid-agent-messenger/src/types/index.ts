/**
 * Maid Agent System - 型定義
 */

// エージェントID
export const MAID_IDS = [
  "emma",
  "sophia",
  "lily",
  "rose",
  "alice",
  "may",
  "flora",
  "luna",
] as const;

export type MaidId = (typeof MAID_IDS)[number];

export const ALL_AGENT_IDS = ["butler", "chief", ...MAID_IDS] as const;
export type AgentId = (typeof ALL_AGENT_IDS)[number];

// タスクステータス
export const TASK_STATUSES = [
  "idle",
  "assigned",
  "working",
  "completed",
  "blocked",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

// 更新可能なステータス
export const UPDATABLE_STATUSES = [
  "working",
  "completed",
  "blocked",
] as const;

export type UpdatableStatus = (typeof UPDATABLE_STATUSES)[number];

// タスクカテゴリ
export const TASK_CATEGORIES = [
  "task",              // 通常タスク（デフォルト）
  "action_required",   // 🚨 要対応
  "skill_candidate",   // 📚 スキル化候補
  "improvement",       // 💡 改善提案
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

// タスクYAML構造
export interface TaskYaml {
  task_id: string | null;
  title: string | null;       // タスクタイトル（短い概要）
  description: string | null; // タスク説明（詳細）
  target_path: string | null;
  status: TaskStatus;
  substatus: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion_summary: string | null;
}

// API出力型
export interface GetMyTaskOutput {
  task_id: string | null;
  description: string | null;
  target_path: string | null;
  status: TaskStatus;
  assigned_at: string | null;
  started_at: string | null;
}

export interface UpdateStatusOutput {
  success: boolean;
  updated_fields: string[];
  timestamp: string;
  /** 完了レポートのアーカイブパス（completed時のみ） */
  archive_path?: string;
}

export interface AssignTaskOutput {
  success: boolean;
  assigned_to: string;
  task_id: string;
  error?: string;
}

export interface AgentStatus {
  id: string;
  status: string;
  task_id: string | null;
  // Phase 2: チーム状態詳細化用フィールド
  started_at?: string | null;
  task_description?: string | null;
  substatus?: string | null;
}

export interface GetTeamStatusOutput {
  timestamp: string;
  summary: Record<string, number>;
  agents: AgentStatus[];
}

// パス定数（レガシー - 動的パス解決に移行）
// プロジェクトパスは X-Maid-Project-Path ヘッダーで指定され、
// central-server.ts 内で動的に解決される
