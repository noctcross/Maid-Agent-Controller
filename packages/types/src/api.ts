/**
 * API関連の型定義
 *
 * @maid-agent/types - API types
 */

import type {
  Task,
  TaskCategory,
  TaskMainStatus,
  TaskSubstatus,
  TaskArtifact,
  ReviewStatus,
} from "./task.js";
import type { TeamStatusData, Assignee } from "./agent.js";

// =====================================================
// Dashboard API
// =====================================================

// ダッシュボード統計
export interface DashboardStats {
  taskCount: number;
  workCount: number;
  stepCount: number;
  completedCount: number;
  actionRequiredCount: number;
  reviewPendingCount: number;
  proposalCount: number;
}

// Step（Work直下のサブタスク）
export interface StepData {
  id: string;
  title: string;
  description?: string;
  type: "step";
  mainStatus: string;
  subStatus: string;
  assignees?: Array<{ agentId: string }>;
  updatedAt?: string;
  hasReport?: boolean;
}

// Work（Goal直下のサブタスク）
export interface WorkData {
  id: string;
  title: string;
  description?: string;
  type: "work";
  mainStatus: string;
  subStatus: string;
  reviewStatus?: string;
  assignees?: Array<{ agentId: string }>;
  steps: StepData[];
  updatedAt?: string;
  hasReport?: boolean;
}

// Goal（トップレベルタスク）
export interface GoalData {
  id: string;
  title: string;
  description?: string;
  type: "task";
  mainStatus: string;
  subStatus: string;
  size?: string;
  reviewStatus?: string;
  category?: string; // task, skill_candidate, improvement
  actionRequired?: boolean;
  assignees: Array<{ agentId: string }>;
  works: WorkData[];
  displayStatus?: string;
  displayIcon?: string;
  archived?: boolean;
  updatedAt?: string;
  latestUpdatedAt?: string;
  hasReport?: boolean;
}

// レビュー待ちタスク
export interface ReviewTaskData {
  id: string;
  title: string;
  type: string;
  reviewStatus: string;
  priority: string;
  completedAt: string;
  assignees: Array<{ agentId: string }>;
}

// 成果物
export interface ArtifactData {
  path: string;
  type: string;
  retention: string;
  taskId: string;
  createdAt: string;
}

// スキル化候補・改善提案
export interface ProposalData {
  id: string;
  title: string;
  description?: string;
}

// ダッシュボードレスポンス
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

// =====================================================
// Task API
// =====================================================

// タスク一覧レスポンス
export interface TaskListResponse {
  tasks: Task[];
  total: number;
}

// タスク作成リクエスト
export interface CreateTaskRequest {
  title: string;
  description: string;
  priority?: "high" | "medium" | "low";
  parentId?: string;
  type?: string;
  category?: TaskCategory;
}

// タスク作成レスポンス
export interface CreateTaskResponse {
  success: boolean;
  task?: Task;
  error?: string;
}

// =====================================================
// Report API
// =====================================================

// 報告書アイテム
export interface ReportItem {
  path: string;
  content: string;
  truncated?: boolean;
  totalLines?: number;
  error?: string;
}

// 報告書レスポンス
export interface ReportResponse {
  success: boolean;
  reports: ReportItem[];
  message?: string;
}

// =====================================================
// File API
// =====================================================

// ファイルアイテム
export interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
  extension?: string;
}

// ファイル一覧レスポンス
export interface FilesListResponse {
  path: string;
  items: FileItem[];
  parentPath: string | null;
}

// ファイル内容レスポンス
export interface FileContentResponse {
  path: string;
  name: string;
  content: string;
  size: number;
  modifiedAt: string;
  isMarkdown: boolean;
  isHtml?: boolean;
  htmlContent?: string;
}

// =====================================================
// Notification API
// =====================================================

// 通知ステータス
export type NotificationStatus = "sent" | "pending" | "error";

// 通知
export interface Notification {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  message: string;
  status: NotificationStatus;
}

// 通知一覧レスポンス
export interface NotificationResponse {
  notifications: Notification[];
  hasMore: boolean;
}

// 通知送信リクエスト
export interface SendNotificationRequest {
  to: string;
  message: string;
}

// 通知送信レスポンス
export interface SendNotificationResponse {
  success: boolean;
  notification?: Notification;
  error?: string;
}

// =====================================================
// Agent Response API
// =====================================================

// Claude Code 応答 / ご主人様の直接入力
export interface AgentResponse {
  id: string;
  timestamp: string;
  agent: string;
  text: string;
  type: "response" | "user_input";
}

// 応答一覧レスポンス
export interface AgentResponsesResponse {
  responses: AgentResponse[];
  hasMore: boolean;
  message?: string;
}

// セッション情報レスポンス
export interface AgentSessionsResponse {
  sessions: Record<string, string | null>;
}

// =====================================================
// Error types
// =====================================================

// APIエラー
export interface APIError {
  code: string;
  message: string;
  details?: unknown;
}

// エラーコード
export const ErrorCodes = {
  NETWORK_ERROR: "NETWORK_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  SERVER_ERROR: "SERVER_ERROR",
  TIMEOUT: "TIMEOUT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
