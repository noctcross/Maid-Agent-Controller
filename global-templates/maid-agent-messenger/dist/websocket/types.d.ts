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
/** トランザクションID（クライアントが発行、自己/他者判定に使用） */
interface TransactionIdentifier {
    txId?: string;
}
/** デバウンス対象のイベント（バッチ化可能） */
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
/** エスカレーション通知データ（Phase6: WebSocket通知） */
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
export declare const DEFAULT_WS_CONFIG: WebSocketConfig;
export {};
