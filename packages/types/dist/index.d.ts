/**
 * @maid-agent/types
 *
 * Type definitions for Maid Agent System
 */
export type { TaskStatus, TaskType, TaskMainStatus, TaskSubstatus, TaskSize, ReviewStatus, OperatorRole, StatusTransitionValidation, RetentionLevel, TaskArtifact, EscalationInfo, TaskCategory, Assignee, Task, TaskSummary, TasksData, UpdateTaskParams, SideEffectResults, UpdateTaskResult, } from "./task.js";
export type { AgentRole, AgentStatus, Agent, AgentInfo, TeamStatusData, } from "./agent.js";
export type { DashboardStats, StepData, WorkData, GoalData, ReviewTaskData, ArtifactData, ProposalData, DashboardResponse, TaskListResponse, CreateTaskRequest, CreateTaskResponse, ReportItem, ReportResponse, FileItem, FilesListResponse, FileContentResponse, NotificationStatus, Notification, NotificationResponse, SendNotificationRequest, SendNotificationResponse, AgentResponse, AgentResponsesResponse, AgentSessionsResponse, APIError, ErrorCode, } from "./api.js";
export { ErrorCodes } from "./api.js";
export type { DashboardStats as WSDashboardStats, TasksHtml, TransactionIdentifier, DebouncedEvent, EscalationNotification, DashboardEvent, DashboardClient, WebSocketConfig, NotificationWSEvent, NotificationWSClientMessage, WebSocketEventType, WebSocketMessage, } from "./websocket.js";
//# sourceMappingURL=index.d.ts.map