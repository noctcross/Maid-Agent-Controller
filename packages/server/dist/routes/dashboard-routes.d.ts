/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/completed, /dashboard-spa
 */
import { Router } from "express";
import type { HtmlDashboardData } from "../views/dashboard-html.js";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";
export type { HtmlDashboardData };
export interface DashboardRoutesDeps {
    generateDashboardHtml: (data: HtmlDashboardData, editorScheme?: string) => string;
    generateTaskHtml: (tasks: any[], type: string, projectPath: string, scheme?: string) => string;
    composeMasterWaitingHtml: (masterWaitingTasks: any[], masterReviewTasks: any[], projectPath: string, scheme?: string) => string;
    generateTaskTreeHtml?: (tasks: any[], projectPath: string) => string;
    generateReviewQueueHtml?: (reviewTasks: any[], projectPath: string) => string;
    generateArtifactsHtml?: (artifacts: any[], projectPath: string) => string;
    generateStatsHtml?: (stats: any) => string;
    generateTeamStatusHtml?: (teamStatus: any[]) => string;
    wsServer?: DashboardWebSocketServer;
}
export declare function createDashboardRoutes(deps: DashboardRoutesDeps): Router;
//# sourceMappingURL=dashboard-routes.d.ts.map