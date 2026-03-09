/**
 * トップページ（プロジェクト一覧）エンドポイント
 * GET /, GET /api/projects, PATCH /api/projects/:encodedPath/pin, PATCH /api/projects/:encodedPath/hide
 */
import { Router } from "express";
import { recordProjectAccess } from "../services/project-registry.js";
import type { ProjectWithStats } from "../views/top-page-html.js";
export interface TopPageRoutesDeps {
    generateTopPageHtml: (projects: ProjectWithStats[]) => string;
}
export declare function createTopPageRoutes(deps: TopPageRoutesDeps): Router;
export { recordProjectAccess };
//# sourceMappingURL=top-page-routes.d.ts.map