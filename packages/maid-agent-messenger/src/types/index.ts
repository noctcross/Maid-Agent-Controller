/**
 * Maid Agent System - 型定義
 * V2.1: Goal/Phase/Action/Investigation 階層構造対応
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

// =============================================================================
// V2.1: タスク種別
// =============================================================================
export const TASK_TYPES = [
  "goal",          // 目標タスク（ご主人様の指示単位）
  "phase",         // フェーズ（成果物単位の作業グループ）
  "action",        // アクション（メイド1人で完結する作業）
  "investigation", // 調査タスク（docs/昇格対象）
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

// =============================================================================
// V2.1: タスクステータス（2層構造）
// =============================================================================

// メインステータス: open/closed
export const TASK_MAIN_STATUSES = ["open", "closed"] as const;
export type TaskMainStatus = (typeof TASK_MAIN_STATUSES)[number];

// サブステータス
export const TASK_SUBSTATUSES = [
  // open 時のサブステータス
  "active",      // 作業中・進行中
  "paused",      // 一時停止
  "checkpoint",  // 人間の判断・確認待ち
  "waiting",     // 他タスクの完了待ち

  // closed 時のサブステータス
  "completed",   // 完了
  "archived",    // アーカイブ済み
] as const;

export type TaskSubstatus = (typeof TASK_SUBSTATUSES)[number];

// open 時の有効なサブステータス
export const OPEN_SUBSTATUSES = ["active", "paused", "checkpoint", "waiting"] as const;
export type OpenSubstatus = (typeof OPEN_SUBSTATUSES)[number];

// closed 時の有効なサブステータス
export const CLOSED_SUBSTATUSES = ["completed", "archived"] as const;
export type ClosedSubstatus = (typeof CLOSED_SUBSTATUSES)[number];

// =============================================================================
// V2.1: Goal サイズ
// =============================================================================
export const GOAL_SIZES = [
  "simple",    // 0-1 phases, typo修正、設定変更、調査のみ
  "standard",  // 2-4 phases, 機能追加、バグ修正
  "complex",   // 5+ phases, 大規模リファクタリング
] as const;

export type GoalSize = (typeof GOAL_SIZES)[number];

// =============================================================================
// V2.1: レビューステータス
// =============================================================================
export const REVIEW_STATUSES = [
  "pending",     // レビュー待ち
  "in_review",   // レビュー中
  "approved",    // 承認済み
  "rejected",    // 却下
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// =============================================================================
// V2.1: 成果物 Retention レベル
// =============================================================================
export const RETENTION_LEVELS = [
  "L1",  // Phase完了後 7日で削除
  "L2",  // Goal完了後 30日で削除
  "L3",  // 永続（docs/配下）
] as const;

export type RetentionLevel = (typeof RETENTION_LEVELS)[number];

// =============================================================================
// V2.1: 成果物インターフェース
// =============================================================================
export interface TaskArtifact {
  type: string;                    // summary, design, report, etc.
  path: string;                    // 相対パス
  base?: "temporary" | "permanent"; // ベースディレクトリ (default: temporary)
  retention: RetentionLevel;
}

// =============================================================================
// 後方互換: 旧タスクステータス (マイグレーション用)
// =============================================================================
export const LEGACY_TASK_STATUSES = [
  "idle",
  "assigned",
  "working",
  "completed",
  "blocked",
] as const;

export type LegacyTaskStatus = (typeof LEGACY_TASK_STATUSES)[number];

// 更新可能なステータス (後方互換)
export const UPDATABLE_STATUSES = [
  "working",
  "completed",
  "blocked",
] as const;

export type UpdatableStatus = (typeof UPDATABLE_STATUSES)[number];

// V2.1: メイドが更新可能なサブステータス
export const MAID_UPDATABLE_SUBSTATUSES = [
  "active",
  "paused",
  "checkpoint",
  "completed",
] as const;

export type MaidUpdatableSubstatus = (typeof MAID_UPDATABLE_SUBSTATUSES)[number];

// タスクカテゴリ
export const TASK_CATEGORIES = [
  "task",              // 通常タスク（デフォルト）
  "action_required",   // 🚨 要対応
  "skill_candidate",   // 📚 スキル化候補
  "improvement",       // 💡 改善提案
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

// 後方互換エイリアス
export type TaskStatus = LegacyTaskStatus;

// =============================================================================
// V2.1: tasks.yaml タスク構造
// =============================================================================

/**
 * V2.1 タスクインターフェース
 * Goal/Phase/Action/Investigation の階層構造に対応
 */
export interface TaskV2 {
  // === 基本情報 ===
  id: string;
  parentId: string | null;          // 親タスクID（Phase→Goal, Action→Phase）
  title: string;                    // タスクタイトル
  description: string | null;       // タスク説明

  // === V2.1: タスク種別・状態 ===
  type: TaskType;                   // goal/phase/action/investigation
  status: TaskMainStatus;           // open/closed
  substatus: TaskSubstatus;         // active/paused/checkpoint/waiting/completed/archived

  // === V2.1: Goal専用フィールド ===
  size?: GoalSize;                  // simple/standard/complex（Goal only）
  tentative?: boolean;              // 暫定Goal（Goal only）

  // === V2.1: 依存関係 ===
  blockedBy?: string[];             // 依存先タスクID（waiting時）

  // === V2.1: 成果物 ===
  artifacts?: TaskArtifact[];       // 成果物リスト

  // === V2.1: レビュー ===
  reviewStatus?: ReviewStatus;      // pending/in_review/approved/rejected

  // === 割り当て・時刻 ===
  priority: "high" | "medium" | "low";
  category: TaskCategory;
  assignees: TaskAssignee[];
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;

  // === サマリー・レポート ===
  summary: string | null;
  reportPaths: string[];
  reviewed: boolean;
  reviewedAt: string | null;

  // === V2.1: アーカイブフラグ（独立フラグ） ===
  archived?: boolean;              // アーカイブ済み（デフォルト: false）
  archivedAt?: string | null;      // アーカイブ日時
}

/**
 * タスク割り当て情報
 */
export interface TaskAssignee {
  agentId: AgentId;
  assignedAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * V2.1: Investigation 昇格推奨情報
 */
export interface InvestigationPromotion {
  recommended: boolean;
  path?: string;                    // 昇格先パス（例: docs/research/xxx.md）
  reason?: string;                  // 昇格理由
}

/**
 * tasks.yaml ファイル構造
 */
export interface TasksYamlFile {
  lastTaskNumber: number;
  tasks: TaskV2[];
}

// =============================================================================
// 後方互換: 旧タスクYAML構造 (マイグレーション用)
// =============================================================================
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

// =============================================================================
// V2.1: ステータスマッピングユーティリティ
// =============================================================================

/**
 * 旧ステータスから V2.1 ステータスへの変換
 */
export function convertLegacyStatus(
  legacyStatus: LegacyTaskStatus
): { status: TaskMainStatus; substatus: TaskSubstatus } {
  switch (legacyStatus) {
    case "idle":
      return { status: "open", substatus: "paused" };
    case "assigned":
      return { status: "open", substatus: "active" };
    case "working":
      return { status: "open", substatus: "active" };
    case "completed":
      return { status: "closed", substatus: "completed" };
    case "blocked":
      return { status: "open", substatus: "checkpoint" };
    default:
      return { status: "open", substatus: "active" };
  }
}

/**
 * V2.1 ステータスから旧ステータスへの変換（後方互換用）
 */
export function convertToLegacyStatus(
  status: TaskMainStatus,
  substatus: TaskSubstatus
): LegacyTaskStatus {
  if (status === "closed") {
    return "completed";
  }
  switch (substatus) {
    case "active":
      return "working";
    case "paused":
      return "idle";
    case "checkpoint":
    case "waiting":
      return "blocked";
    case "completed":
      return "completed";
    case "archived":
      return "completed";
    default:
      return "idle";
  }
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
