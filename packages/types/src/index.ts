/**
 * @maid-agent/types
 *
 * Type definitions for Maid Agent System
 */

// Task types
export type {
  TaskStatus,
  TaskType,
  TaskMainStatus,
  TaskSubstatus,
  TaskSize,
  ReviewStatus,
  OperatorRole,
  StatusTransitionValidation,
  RetentionLevel,
  TaskArtifact,
  EscalationInfo,
  TaskCategory,
  Assignee,
  Task,
  TaskSummary,
  TasksData,
  UpdateTaskParams,
  SideEffectResults,
  UpdateTaskResult,
} from "./task.js";

// Agent types
export type {
  AgentRole,
  AgentStatus,
  Agent,
  AgentInfo,
  TeamStatusData,
} from "./agent.js";

// Note: Assignee is already exported from task.ts
// Re-export from agent.ts is skipped to avoid duplicate

// API types
export type {
  // Dashboard
  DashboardStats,
  StepData,
  WorkData,
  GoalData,
  ReviewTaskData,
  ArtifactData,
  ProposalData,
  DashboardResponse,
  // Task
  TaskListResponse,
  CreateTaskRequest,
  CreateTaskResponse,
  // Report
  ReportItem,
  ReportResponse,
  // File
  FileItem,
  FilesListResponse,
  FileContentResponse,
  // Notification
  NotificationStatus,
  Notification,
  NotificationResponse,
  SendNotificationRequest,
  SendNotificationResponse,
  // Agent Response
  AgentResponse,
  AgentResponsesResponse,
  AgentSessionsResponse,
  // Error
  APIError,
  ErrorCode,
} from "./api.js";

export { ErrorCodes } from "./api.js";

// WebSocket types
export type {
  // Dashboard WebSocket
  DashboardStats as WSDashboardStats,
  TasksHtml,
  TransactionIdentifier,
  DebouncedEvent,
  EscalationNotification,
  DashboardEvent,
  DashboardClient,
  WebSocketConfig,
  // Notification WebSocket
  NotificationWSEvent,
  NotificationWSClientMessage,
  // Generic
  WebSocketEventType,
  WebSocketMessage,
} from "./websocket.js";
