/**
 * エージェント関連の型定義
 *
 * @maid-agent/types - Agent types
 */

// エージェントの役割
export type AgentRole = "butler" | "chief" | "maid";

// エージェントのステータス
export type AgentStatus =
  | "offline"
  | "idle"
  | "working"
  | "done"
  | "blocked"
  | "completed"
  | "pending"
  | "assigned"
  | "unknown"
  | "error";

// エージェント情報
export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
}

// エージェント詳細情報（チーム状態表示用）
export interface AgentInfo {
  id: string;
  name?: string;
  icon?: string;
  color?: string;
  online?: boolean;
}

// チーム状態（get-team-status.ts の AgentStatus に準拠）
export interface TeamStatusData {
  id: string;
  status: AgentStatus;
  task_id?: string | null;
  task_title?: string | null;
  started_at?: string | null;
  substatus?: string | null;
}

// 割り当て情報（Task に含まれる）
export interface Assignee {
  agentId: string;
  role: string | null;
  subTaskId: string | null;
}
