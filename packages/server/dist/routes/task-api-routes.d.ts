/**
 * Task API エンドポイント
 * GET/PATCH /api/tasks/*, GET /api/dashboard
 */
import { Router } from "express";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";
export interface TaskApiRoutesDeps {
    wsServer?: DashboardWebSocketServer;
}
export declare function createTaskApiRoutes(deps?: TaskApiRoutesDeps): Router;
declare const _default: Router;
export default _default;
//# sourceMappingURL=task-api-routes.d.ts.map