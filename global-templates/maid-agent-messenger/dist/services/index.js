/**
 * サービス層のエクスポート
 *
 * ビジネスロジックを一元管理
 */
export { executeGetMyTask } from "./get-my-task.js";
export { executeUpdateStatus } from "./update-status.js";
export { executeAssignTask } from "./assign-task.js";
export { executeGetTeamStatus } from "./get-team-status.js";
// タスク管理サービス（Phase 1 + Phase 3 + V2.1）
export { executeCreateTask, executeGetTask, executeListTasks, executeUpdateTask, 
// V2.1: 依存解消・自動クローズ
resolveBlockedTasks, checkGoalAutoClose, inferTaskType, convertToV2Status, 
// V2.1: ダッシュボードデータ生成
generateV2DashboardData, 
// V2.1 マイグレーション
migrateToV2, checkMigrationStatus, } from "./task-manager.js";
// レポート取得
export { executeGetReport, } from "./get-report.js";
// 副作用（rearchive API用）
export { archiveReport, extractTaskIdFromReport, } from "./task-side-effects.js";
