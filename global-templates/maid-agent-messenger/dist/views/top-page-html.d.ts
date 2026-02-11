/**
 * トップページ（プロジェクト一覧）HTML生成
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
export declare function generateTopPageHtml(projects: ProjectWithStats[]): string;
