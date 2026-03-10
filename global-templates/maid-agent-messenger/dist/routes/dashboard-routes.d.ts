/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/goals, /report
 * PATCH /dashboard/tasks/:id/archive, /dashboard/tasks/:id/close
 */
import { Router } from "express";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";
export interface DashboardRoutesDeps {
    wsServer?: DashboardWebSocketServer;
}
export declare function createDashboardRoutes(deps: DashboardRoutesDeps): Router;
