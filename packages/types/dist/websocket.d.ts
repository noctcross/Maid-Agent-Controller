/**
 * WebSocket関連の型定義
 *
 * @maid-agent/types - WebSocket types
 */
import type { Notification, AgentResponse } from "./api.js";
export interface DashboardStats {
    pendingCount: number;
    workingCount: number;
    masterWaitingCount: number;
    completedTodayCount: number;
    timestamp: string;
}
export interface TasksHtml {
    pending: string;
    working: string;
    completed: string;
    masterWaiting: string;
    skillCandidates: string;
    improvements: string;
}
export interface TransactionIdentifier {
    txId?: string;
}
export type DebouncedEvent = ({
    type: "taskUpdated";
    taskId: string;
    field?: string;
    value?: unknown;
    task?: unknown;
} & TransactionIdentifier) | ({
    type: "taskCreated";
    taskId: string;
    task?: unknown;
} & TransactionIdentifier) | ({
    type: "taskAssigned";
    taskId: string;
    assignee: string;
} & TransactionIdentifier) | ({
    type: "statusUpdated";
    agentId: string;
    status: string;
} & TransactionIdentifier);
export interface EscalationNotification {
    taskId: string;
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    agentId: string;
    message: string;
    timestamp: string;
}
export type DashboardEvent = {
    type: "connected";
    sessionId: string;
} | {
    type: "stats";
    data: DashboardStats;
} | {
    type: "tasks";
    data: TasksHtml;
} | DebouncedEvent | {
    type: "tasksBatchUpdated";
    events: DebouncedEvent[];
    count: number;
} | {
    type: "escalation";
    data: EscalationNotification;
} | {
    type: "ping";
} | {
    type: "pong";
} | {
    type: "error";
    message: string;
};
export interface DashboardClient {
    sessionId: string;
    projectPath: string;
    lastPing: number;
    lastPong: number;
}
export interface WebSocketConfig {
    pingInterval: number;
    pongTimeout: number;
    maxClients: number;
}
export type NotificationWSEvent = {
    type: "connected";
    sessionId: string;
} | {
    type: "notification";
    payload: Notification;
} | {
    type: "response";
    payload: AgentResponse;
} | {
    type: "status";
    payload: {
        agent: string;
        online: boolean;
    };
} | {
    type: "ping";
} | {
    type: "pong";
} | {
    type: "error";
    message: string;
};
export type NotificationWSClientMessage = {
    type: "pong";
} | {
    type: "subscribe";
    agents: string[];
} | {
    type: "subscribe_responses";
    agent: string;
} | {
    type: "unsubscribe_responses";
};
export type WebSocketEventType = "connected" | "stats" | "tasks" | "taskUpdated" | "taskCreated" | "taskAssigned" | "statusUpdated" | "tasksBatchUpdated" | "escalation" | "notification" | "response" | "ping" | "pong" | "error";
export interface WebSocketMessage<T = unknown> {
    type: WebSocketEventType;
    payload?: T;
    sessionId?: string;
}
//# sourceMappingURL=websocket.d.ts.map