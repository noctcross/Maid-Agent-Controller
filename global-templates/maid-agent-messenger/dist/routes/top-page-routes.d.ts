/**
 * トップページ（プロジェクト一覧）エンドポイント
 * GET /, GET /api/projects, PATCH /api/projects/:encodedPath/pin, PATCH /api/projects/:encodedPath/hide
 */
import { Router } from "express";
import { recordProjectAccess, type ProjectEntry } from "../services/project-registry.js";
export interface ProjectWithStats extends ProjectEntry {
    stats: {
        pendingCount: number;
        workingCount: number;
        completedTodayCount: number;
    } | null;
    status: "available" | "unavailable";
}
export interface TopPageRoutesDeps {
    generateTopPageHtml: (projects: ProjectWithStats[]) => string;
}
export declare function createTopPageRoutes(deps: TopPageRoutesDeps): Router;
export { recordProjectAccess };
