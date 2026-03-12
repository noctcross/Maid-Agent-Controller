/**
 * トップページ（プロジェクト一覧）エンドポイント
 * GET /, GET /api/projects, PATCH /api/projects/:encodedPath/pin, PATCH /api/projects/:encodedPath/hide
 */
import { Router } from "express";
import { existsSync } from "fs";
import path from "path";
import { listProjects, togglePin, toggleHide, recordProjectAccess, } from "../services/project-registry.js";
import { executeListTasks } from "../services/index.js";
export function createTopPageRoutes(deps) {
    const { generateTopPageHtml } = deps;
    const router = Router();
    // GET / — トップページHTML（SPA: 静的HTMLシェル + クライアントJSでAPI呼び出し）
    router.get("/", async (_req, res) => {
        const html = generateTopPageHtml();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    });
    // GET /api/projects — JSON API（stats付き）
    router.get("/api/projects", async (_req, res) => {
        try {
            const projects = await listProjects();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            // 各プロジェクトのステータスを並列取得
            const projectsWithStats = await Promise.all(projects.map(async (project) => {
                // パス検証
                const maidAgentPath = path.join(project.path, ".maid-agent");
                if (!existsSync(maidAgentPath)) {
                    return { ...project, stats: null, status: "unavailable" };
                }
                try {
                    const [pending, working, completedAll] = await Promise.all([
                        executeListTasks(project.path, { status: ["pending"] }),
                        executeListTasks(project.path, { status: ["working", "assigned"] }),
                        executeListTasks(project.path, { status: ["completed"], limit: 500 }),
                    ]);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Task | TaskSummary のユニオン型対応
                    const completedTodayCount = completedAll.tasks.filter((task) => {
                        if (!task.completedAt)
                            return false;
                        const completedDate = new Date(task.completedAt);
                        return completedDate >= today;
                    }).length;
                    return {
                        ...project,
                        stats: {
                            pendingCount: pending.total,
                            workingCount: working.total,
                            completedTodayCount,
                        },
                        status: "available",
                    };
                }
                catch {
                    return { ...project, stats: null, status: "unavailable" };
                }
            }));
            res.json({ projects: projectsWithStats });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    });
    // PATCH /api/projects/:encodedPath/pin — ピン留めトグル
    router.patch("/api/projects/:encodedPath/pin", async (req, res) => {
        try {
            const projectPath = decodeURIComponent(req.params.encodedPath);
            const result = await togglePin(projectPath);
            if (!result) {
                res.status(404).json({ error: "Project not found" });
                return;
            }
            res.json({ success: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    });
    // PATCH /api/projects/:encodedPath/hide — 非表示トグル
    router.patch("/api/projects/:encodedPath/hide", async (req, res) => {
        try {
            const projectPath = decodeURIComponent(req.params.encodedPath);
            const result = await toggleHide(projectPath);
            if (!result) {
                res.status(404).json({ error: "Project not found" });
                return;
            }
            res.json({ success: true });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    });
    return router;
}
// recordProjectAccess を再エクスポート（dashboard-routes.ts から使用）
export { recordProjectAccess };
