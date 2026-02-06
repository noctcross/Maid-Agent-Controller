/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/completed, /dashboard/data, /dashboard/events
 */
import { Router } from "express";
import type { DashboardData } from "../views/dashboard-html.js";
export type { DashboardData };
export interface DashboardRoutesDeps {
    generateDashboardHtml: (data: DashboardData, editorScheme?: string) => string;
    generateTaskHtml: (tasks: any[], type: string, projectPath: string, scheme?: string) => string;
}
export declare function createDashboardRoutes(deps: DashboardRoutesDeps): Router;
