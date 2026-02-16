/**
 * WebSocket イベント型定義
 */
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
export type DashboardEvent = {
    type: "connected";
    sessionId: string;
} | {
    type: "stats";
    data: DashboardStats;
} | {
    type: "tasks";
    data: TasksHtml;
} | {
    type: "taskUpdated";
    taskId: string;
    field?: string;
    value?: unknown;
    task?: unknown;
} | {
    type: "taskCreated";
    taskId: string;
    task?: unknown;
} | {
    type: "taskAssigned";
    taskId: string;
    assignee: string;
} | {
    type: "statusUpdated";
    agentId: string;
    status: string;
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
export declare const DEFAULT_WS_CONFIG: WebSocketConfig;
