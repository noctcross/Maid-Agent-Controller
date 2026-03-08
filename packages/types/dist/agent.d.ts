/**
 * エージェント関連の型定義
 *
 * @maid-agent/types - Agent types
 */
export type AgentRole = "butler" | "chief" | "maid";
export type AgentStatus = "offline" | "idle" | "working" | "done" | "blocked" | "completed" | "pending" | "assigned" | "unknown" | "error";
export interface Agent {
    id: string;
    name: string;
    role: AgentRole;
    status: AgentStatus;
}
export interface AgentInfo {
    id: string;
    name?: string;
    icon?: string;
    color?: string;
    online?: boolean;
}
export interface TeamStatusData {
    id: string;
    status: AgentStatus;
    task_id?: string | null;
    task_title?: string | null;
    started_at?: string | null;
    substatus?: string | null;
}
export interface Assignee {
    agentId: string;
    role: string | null;
    subTaskId: string | null;
}
//# sourceMappingURL=agent.d.ts.map