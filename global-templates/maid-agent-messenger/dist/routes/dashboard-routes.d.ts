/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/completed, /dashboard/data, /dashboard/events
 */
import { Router } from "express";
import type { DashboardData } from "../views/dashboard-html.js";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";
export type { DashboardData };
export interface DashboardRoutesDeps {
    generateDashboardHtml: (data: DashboardData, editorScheme?: string) => string;
    generateTaskHtml: (tasks: any[], type: string, projectPath: string, scheme?: string) => string;
    composeMasterWaitingHtml: (masterWaitingTasks: any[], masterReviewTasks: any[], projectPath: string, scheme?: string) => string;
    generateGoalTreeHtml?: (goals: any[], projectPath: string) => string;
    generateReviewQueueHtml?: (reviewTasks: any[], projectPath: string) => string;
    generateArtifactsHtml?: (artifacts: any[], projectPath: string) => string;
    generateV2StatsHtml?: (stats: any) => string;
    wsServer?: DashboardWebSocketServer;
}
export declare function createDashboardRoutes(deps: DashboardRoutesDeps): Router;
