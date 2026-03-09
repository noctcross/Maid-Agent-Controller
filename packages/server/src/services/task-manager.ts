/**
 * タスク管理サービス - エントリポイント
 *
 * MCPタスク管理システムのコアロジック
 * tasks.yaml を単一ファイルで管理
 *
 * 責務分割:
 * - task-core.ts: 共通ユーティリティ（withTasksLock, loadTasksReadOnly）
 * - task-crud.ts: CRUD操作（create, get, list, update）
 * - task-migration.ts: V2.1ステータス関連・マイグレーション
 * - task-stats.ts: ダッシュボードデータ生成・統計処理
 * - task-auto-close.ts: 自動クローズ・依存解消処理
 * - task-manager.ts（本ファイル）: エントリポイント（全モジュールをre-export）
 */

// === 型定義（共通ファイルから再エクスポート）===
// 循環参照解消のため、型定義を ../types/task-manager-types.ts に分離
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
  Assignee,
  TaskCategory,
  Task,
  TaskSummary,
  TasksData,
  UpdateTaskParams,
  SideEffectResults,
  UpdateTaskResult,
} from "../types/task-manager-types.js";

// === コアユーティリティ ===
export {
  withTasksLock,
  loadTasksReadOnly,
} from "./task-core.js";

// === 分割モジュールの再エクスポート ===

// CRUD操作
export {
  executeCreateTask,
  executeGetTask,
  executeListTasks,
  executeGetTaskChildren,
  executeUpdateTask,
  compareTaskIds,
} from "./task-crud.js";
export type {
  CreateTaskParams,
  CreateTaskResult,
  GetTaskParams,
  GetTaskResult,
  ListTasksParams,
  ListTasksResult,
} from "./task-crud.js";

// V2.1 ステータス関連・マイグレーション
export {
  inferTaskType,
  validateStatusTransition,
  getAgentRole,
  convertStatus,
  mapLegacyStatus,
  migrateTask,
  migrate,
  checkMigrationStatus,
} from "./task-migration.js";
export type {
  MigrationResult,
} from "./task-migration.js";

// 統計・ダッシュボード
export {
  computeGoalDisplayStatus,
  generateDashboardData,
} from "./task-stats.js";
export type {
  DashboardData,
  StepData,
  WorkData,
  TaskData,
  GoalData,
  PhaseData,
  ActionData,
  ReviewTaskData,
  ArtifactData,
  StatsData,
  DashboardOptions,
} from "./task-stats.js";

// 自動クローズ・依存解消
export {
  resolveBlockedTasks,
  checkGoalAutoClose,
  checkAndAutoCloseParent,
} from "./task-auto-close.js";
export type {
  DependencyResolutionResult,
} from "./task-auto-close.js";
