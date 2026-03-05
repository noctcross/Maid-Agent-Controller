/**
 * タスク管理サービス - エントリポイント
 *
 * MCPタスク管理システムのコアロジック
 * tasks.yaml を単一ファイルで管理
 *
 * 責務分割:
 * - task-core.ts: 共通ユーティリティ（withTasksLock, loadTasksReadOnly）
 * - task-crud.ts: CRUD操作（create, get, list, update）
 * - task-v2-migration.ts: V2.1ステータス関連・マイグレーション
 * - task-stats.ts: ダッシュボードデータ生成・統計処理
 * - task-auto-close.ts: 自動クローズ・依存解消処理
 * - task-manager.ts（本ファイル）: エントリポイント（全モジュールをre-export）
 */
// === コアユーティリティ ===
export { withTasksLock, loadTasksReadOnly, } from "./task-core.js";
// === 分割モジュールの再エクスポート ===
// CRUD操作
export { executeCreateTask, executeGetTask, executeListTasks, executeGetTaskChildren, executeUpdateTask, compareTaskIds, } from "./task-crud.js";
// V2.1 ステータス関連・マイグレーション
export { inferTaskType, validateStatusTransition, getAgentRole, convertToV2Status, mapLegacyToV2Status, migrateTaskToV2, migrateToV2, checkMigrationStatus, } from "./task-v2-migration.js";
// 統計・ダッシュボード
export { computeGoalDisplayStatus, generateV2DashboardData, } from "./task-stats.js";
// 自動クローズ・依存解消
export { resolveBlockedTasks, checkGoalAutoClose, checkAndAutoCloseParent, } from "./task-auto-close.js";
