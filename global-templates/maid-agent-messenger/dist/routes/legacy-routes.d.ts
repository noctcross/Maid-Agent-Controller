/**
 * レガシー REST API エンドポイント（後方互換性）
 * POST /tools/get_my_task, /tools/update_status, /tools/assign_task, /tools/get_team_status
 */
declare const router: import("express-serve-static-core").Router;
export default router;
