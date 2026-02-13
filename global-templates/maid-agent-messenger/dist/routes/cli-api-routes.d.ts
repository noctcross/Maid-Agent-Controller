/**
 * CLI API エンドポイント
 * maidctl CLIツールから呼び出されるREST API
 *
 * エンドポイント:
 * - POST /api/tasks - タスク作成
 * - POST /api/tasks/:id/assign - タスク割り当て
 * - GET /api/agents/:id/task - 自分のタスク取得
 * - PATCH /api/agents/:id/status - ステータス更新
 * - GET /api/team/status - チーム状況
 */
declare const router: import("express-serve-static-core").Router;
export default router;
