/**
 * Maid Agent System - 型定義
 */
export declare const MAID_IDS: readonly ["emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];
export type MaidId = (typeof MAID_IDS)[number];
export declare const ALL_AGENT_IDS: readonly ["butler", "chief", "emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];
export type AgentId = (typeof ALL_AGENT_IDS)[number];
export declare const TASK_STATUSES: readonly ["idle", "assigned", "working", "completed", "blocked"];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export declare const UPDATABLE_STATUSES: readonly ["working", "completed", "blocked"];
export type UpdatableStatus = (typeof UPDATABLE_STATUSES)[number];
export interface TaskYaml {
    task_id: string | null;
    description: string | null;
    target_path: string | null;
    status: TaskStatus;
    substatus: string | null;
    assigned_at: string | null;
    started_at: string | null;
    completed_at: string | null;
}
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
}
export interface GetTeamStatusOutput {
    timestamp: string;
    summary: Record<string, number>;
    agents: AgentStatus[];
}
