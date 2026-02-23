/**
 * Maid Agent System - 型定義
 * V2.1: Goal/Phase/Action/Investigation 階層構造対応
 */
export declare const MAID_IDS: readonly ["emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];
export type MaidId = (typeof MAID_IDS)[number];
export declare const ALL_AGENT_IDS: readonly ["butler", "chief", "emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];
export type AgentId = (typeof ALL_AGENT_IDS)[number];
export declare const TASK_TYPES: readonly ["goal", "phase", "action", "investigation"];
export type TaskType = (typeof TASK_TYPES)[number];
export declare const TASK_MAIN_STATUSES: readonly ["open", "closed", "cancelled"];
export type TaskMainStatus = (typeof TASK_MAIN_STATUSES)[number];
export declare const TASK_SUBSTATUSES: readonly ["pending", "assigned", "working", "waiting", "checkpoint", "completed"];
export type TaskSubstatus = (typeof TASK_SUBSTATUSES)[number];
export declare const OPEN_SUBSTATUSES: readonly ["pending", "assigned", "working", "waiting", "checkpoint"];
export type OpenSubstatus = (typeof OPEN_SUBSTATUSES)[number];
export declare const CLOSED_SUBSTATUSES: readonly ["completed"];
export type ClosedSubstatus = (typeof CLOSED_SUBSTATUSES)[number];
export declare const GOAL_SIZES: readonly ["simple", "standard", "complex"];
export type GoalSize = (typeof GOAL_SIZES)[number];
export declare const REVIEW_STATUSES: readonly ["pending", "in_review", "approved", "rejected"];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export declare const RETENTION_LEVELS: readonly ["L1", "L2", "L3"];
export type RetentionLevel = (typeof RETENTION_LEVELS)[number];
export interface TaskArtifact {
    type: string;
    path: string;
    base?: "temporary" | "permanent";
    retention: RetentionLevel;
}
export declare const LEGACY_TASK_STATUSES: readonly ["idle", "assigned", "working", "completed", "blocked"];
export type LegacyTaskStatus = (typeof LEGACY_TASK_STATUSES)[number];
export declare const UPDATABLE_STATUSES: readonly ["working", "completed", "blocked"];
export type UpdatableStatus = (typeof UPDATABLE_STATUSES)[number];
export declare const MAID_UPDATABLE_SUBSTATUSES: readonly ["working", "checkpoint", "completed"];
export type MaidUpdatableSubstatus = (typeof MAID_UPDATABLE_SUBSTATUSES)[number];
export declare const TASK_CATEGORIES: readonly ["task", "action_required", "skill_candidate", "improvement"];
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type TaskStatus = LegacyTaskStatus;
/**
 * V2.1 タスクインターフェース
 * Goal/Phase/Action/Investigation の階層構造に対応
 */
export interface TaskV2 {
    id: string;
    parentId: string | null;
    title: string;
    description: string | null;
    type: TaskType;
    status: TaskMainStatus;
    substatus: TaskSubstatus;
    size?: GoalSize;
    tentative?: boolean;
    blockedBy?: string[];
    artifacts?: TaskArtifact[];
    reviewStatus?: ReviewStatus;
    priority: "high" | "medium" | "low";
    category: TaskCategory;
    assignees: TaskAssignee[];
    createdAt: string;
    updatedAt: string;
    assignedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    summary: string | null;
    reportPaths: string[];
    reviewed: boolean;
    reviewedAt: string | null;
    archived?: boolean;
    archivedAt?: string | null;
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
    path?: string;
    reason?: string;
}
/**
 * tasks.yaml ファイル構造
 */
export interface TasksYamlFile {
    lastTaskNumber: number;
    tasks: TaskV2[];
}
export interface TaskYaml {
    task_id: string | null;
    title: string | null;
    description: string | null;
    target_path: string | null;
    status: TaskStatus;
    substatus: string | null;
    assigned_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    completion_summary: string | null;
}
/**
 * 旧ステータスから V2.1 ステータスへの変換
 */
export declare function convertLegacyStatus(legacyStatus: LegacyTaskStatus): {
    status: TaskMainStatus;
    substatus: TaskSubstatus;
};
/**
 * V2.1 ステータスから旧ステータスへの変換（後方互換用）
 */
export declare function convertToLegacyStatus(status: TaskMainStatus, substatus: TaskSubstatus): LegacyTaskStatus;
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
    started_at?: string | null;
    task_description?: string | null;
    substatus?: string | null;
}
export interface GetTeamStatusOutput {
    timestamp: string;
    summary: Record<string, number>;
    agents: AgentStatus[];
}
