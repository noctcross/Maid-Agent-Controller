/**
 * サービス層のエクスポート
 *
 * ビジネスロジックを一元管理
 */

export { executeGetMyTask, type GetMyTaskParams, type GetMyTaskResult } from "./get-my-task.js";
export { executeUpdateStatus, type UpdateStatusParams } from "./update-status.js";
export { executeAssignTask, type AssignTaskParams } from "./assign-task.js";
export {
  executeResumeParkedTask,
  type ResumeParkedTaskParams,
  type ResumeParkedTaskOutput,
} from "./resume-parked-task.js";
export { executeGetTeamStatus, type GetTeamStatusParams } from "./get-team-status.js";

// タスク管理サービス（V2.1）
export {
  executeCreateTask,
  executeGetTask,
  executeListTasks,
  executeUpdateTask,
  // V2.1: 依存解消・自動クローズ
  resolveBlockedTasks,
  checkGoalAutoClose,
  inferTaskType,
  convertStatus,
  // V2.1: ダッシュボードデータ生成
  generateDashboardData,
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
  migrate,
  checkMigrationStatus,
  // V2.1 型
  type TaskType,
  type TaskMainStatus,
  type TaskSubstatus,
  type TaskSize,
  type ReviewStatus,
  type RetentionLevel,
  type TaskArtifact,
  type DependencyResolutionResult,
  type MigrationResult,
  // V2.1 ダッシュボードデータ型
  type DashboardData,
  type TaskData,
  type WorkData,
  type StepData,
  // 後方互換エイリアス
  type GoalData,
  type PhaseData,
  type ActionData,
  type ReviewTaskData,
  type ArtifactData,
  type StatsData,
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
