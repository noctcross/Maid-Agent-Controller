/**
 * API関連の型定義
 *
 * @maid-agent/types - API types
 */
import type { Task, TaskCategory } from "./task.js";
import type { TeamStatusData } from "./agent.js";
export interface DashboardStats {
    taskCount: number;
    workCount: number;
    stepCount: number;
    completedCount: number;
    actionRequiredCount: number;
    reviewPendingCount: number;
    proposalCount: number;
}
export interface StepData {
    id: string;
    title: string;
    description?: string;
    type: "step";
    mainStatus: string;
    subStatus: string;
    assignees?: Array<{
        agentId: string;
    }>;
    updatedAt?: string;
    hasReport?: boolean;
}
export interface WorkData {
    id: string;
    title: string;
    description?: string;
    type: "work";
    mainStatus: string;
    subStatus: string;
    reviewStatus?: string;
    assignees?: Array<{
        agentId: string;
    }>;
    steps: StepData[];
    updatedAt?: string;
    hasReport?: boolean;
}
export interface GoalData {
    id: string;
    title: string;
    description?: string;
    type: "task";
    mainStatus: string;
    subStatus: string;
    size?: string;
    reviewStatus?: string;
    category?: string;
    actionRequired?: boolean;
    assignees: Array<{
        agentId: string;
    }>;
    works: WorkData[];
    displayStatus?: string;
    displayIcon?: string;
    archived?: boolean;
    updatedAt?: string;
    latestUpdatedAt?: string;
    hasReport?: boolean;
}
export interface ReviewTaskData {
    id: string;
    title: string;
    type: string;
    reviewStatus: string;
    priority: string;
    completedAt: string;
    assignees: Array<{
        agentId: string;
    }>;
}
export interface ArtifactData {
    path: string;
    type: string;
    retention: string;
    taskId: string;
    createdAt: string;
}
export interface ProposalData {
    id: string;
    title: string;
    description?: string;
}
export interface DashboardResponse {
    goals: GoalData[];
    reviewQueue: ReviewTaskData[];
    artifacts: ArtifactData[];
    stats: DashboardStats;
    skillCandidates?: ProposalData[];
    improvements?: ProposalData[];
    totalGoals: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    teamStatus?: TeamStatusData[];
    timestamp: string;
}
export interface TaskListResponse {
    tasks: Task[];
    total: number;
}
export interface CreateTaskRequest {
    title: string;
    description: string;
    priority?: "high" | "medium" | "low";
    parentId?: string;
    type?: string;
    category?: TaskCategory;
}
export interface CreateTaskResponse {
    success: boolean;
    task?: Task;
    error?: string;
}
export interface ReportItem {
    path: string;
    content: string;
    truncated?: boolean;
    totalLines?: number;
    error?: string;
}
export interface ReportResponse {
    success: boolean;
    reports: ReportItem[];
    message?: string;
}
export interface FileItem {
    name: string;
    path: string;
    type: "file" | "directory";
    size?: number;
    modifiedAt?: string;
    extension?: string;
}
export interface FilesListResponse {
    path: string;
    items: FileItem[];
    parentPath: string | null;
}
export interface FileContentResponse {
    path: string;
    name: string;
    content: string;
    size: number;
    modifiedAt: string;
    isMarkdown: boolean;
    htmlContent?: string;
}
export type NotificationStatus = "sent" | "pending" | "error";
export interface Notification {
    id: string;
    timestamp: string;
    from: string;
    to: string;
    message: string;
    status: NotificationStatus;
}
export interface NotificationResponse {
    notifications: Notification[];
    hasMore: boolean;
}
export interface SendNotificationRequest {
    to: string;
    message: string;
}
export interface SendNotificationResponse {
    success: boolean;
    notification?: Notification;
    error?: string;
}
export interface AgentResponse {
    id: string;
    timestamp: string;
    agent: string;
    text: string;
    type: "response" | "user_input";
}
export interface AgentResponsesResponse {
    responses: AgentResponse[];
    hasMore: boolean;
    message?: string;
}
export interface AgentSessionsResponse {
    sessions: Record<string, string | null>;
}
export interface APIError {
    code: string;
    message: string;
    details?: unknown;
}
export declare const ErrorCodes: {
    readonly NETWORK_ERROR: "NETWORK_ERROR";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly SERVER_ERROR: "SERVER_ERROR";
    readonly TIMEOUT: "TIMEOUT";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
};
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
//# sourceMappingURL=api.d.ts.map