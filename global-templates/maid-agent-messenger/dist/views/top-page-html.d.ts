/**
 * トップページ（プロジェクト一覧）HTML生成
 * SPA対応: 静的HTMLシェル + クライアントJSでAPI呼び出し
 */
import type { ProjectEntry } from "../services/project-registry.js";
export interface ProjectWithStats extends ProjectEntry {
    stats: {
        pendingCount: number;
        workingCount: number;
        completedTodayCount: number;
    } | null;
    status: "available" | "unavailable";
}
export declare function generateTopPageHtml(_projects: ProjectWithStats[]): string;
//# sourceMappingURL=top-page-html.d.ts.map