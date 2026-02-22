/**
 * サービス層のエクスポート
 *
 * ビジネスロジックを一元管理
 */

export { executeGetMyTask, type GetMyTaskParams, type GetMyTaskResult } from "./get-my-task.js";
export { executeUpdateStatus, type UpdateStatusParams } from "./update-status.js";
export { executeAssignTask, type AssignTaskParams } from "./assign-task.js";
export { executeGetTeamStatus, type GetTeamStatusParams } from "./get-team-status.js";

// タスク管理サービス（Phase 1 + Phase 3 + V2.1）
export {
  executeCreateTask,
  executeGetTask,
  executeListTasks,
  executeUpdateTask,
  // V2.1: 依存解消・自動クローズ
  resolveBlockedTasks,
  checkGoalAutoClose,
  inferTaskType,
  convertToV2Status,
  // V2.1: ダッシュボードデータ生成
  generateV2DashboardData,
  type CreateTaskParams,
  type CreateTaskResult,
  type GetTaskParams,
  type GetTaskResult,
  type ListTasksParams,
  type ListTasksResult,
  type UpdateTaskParams,
  type UpdateTaskResult,
  type Task,
  type TaskSummary,
  type TaskStatus,
  type Assignee,
  type TasksData,
  // V2.1 マイグレーション
  migrateToV2,
  checkMigrationStatus,
  // V2.1 型
  type TaskType,
  type TaskMainStatus,
  type TaskSubstatus,
  type GoalSize,
  type ReviewStatus,
  type RetentionLevel,
  type TaskArtifact,
  type DependencyResolutionResult,
  type MigrationResult,
  // V2.1 ダッシュボードデータ型
  type V2DashboardData,
  type V2GoalData,
  type V2PhaseData,
  type V2ActionData,
  type V2ReviewTaskData,
  type V2ArtifactData,
  type V2StatsData,
} from "./task-manager.js";

// レポート取得
export {
  executeGetReport,
  type GetReportParams,
  type GetReportResult,
  type ReportEntry,
} from "./get-report.js";

// 副作用（rearchive API用）
export {
  archiveReport,
  extractTaskIdFromReport,
} from "./task-side-effects.js";
