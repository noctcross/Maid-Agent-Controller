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
import { Router } from "express";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";
export interface CliApiRoutesDeps {
    wsServer?: DashboardWebSocketServer;
}
export declare function createCliApiRoutes(deps?: CliApiRoutesDeps): Router;
declare const _default: Router;
export default _default;
//# sourceMappingURL=cli-api-routes.d.ts.map