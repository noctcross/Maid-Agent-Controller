/**
 * トップページ（プロジェクト一覧）エンドポイント
 * GET /, GET /api/projects, PATCH /api/projects/:encodedPath/pin, PATCH /api/projects/:encodedPath/hide
 */

import { Router, Request, Response } from "express";
import { existsSync } from "fs";
import path from "path";
import {
  listProjects,
  togglePin,
  toggleHide,
  recordProjectAccess,
  type ProjectEntry,
} from "../services/project-registry.js";
import { executeListTasks } from "../services/index.js";

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

export function createTopPageRoutes(deps: TopPageRoutesDeps): Router {
  const { generateTopPageHtml } = deps;
  const router = Router();

  // GET / — トップページHTML
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const projects = await listProjects();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 各プロジェクトのステータスを並列取得
      const projectsWithStats: ProjectWithStats[] = await Promise.all(
        projects.map(async (project) => {
          // パス検証
          const maidAgentPath = path.join(project.path, ".maid-agent");
          if (!existsSync(maidAgentPath)) {
            return { ...project, stats: null, status: "unavailable" as const };
          }

          try {
            const [pending, working, completedAll] = await Promise.all([
              executeListTasks(project.path, { status: ["pending"] }),
              executeListTasks(project.path, { status: ["working", "assigned"] }),
              executeListTasks(project.path, { status: ["completed"], limit: 500 }),
            ]);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Task | TaskSummary のユニオン型対応
            const completedTodayCount = completedAll.tasks.filter((task: any) => {
              if (!task.completedAt) return false;
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
              status: "available" as const,
            };
          } catch {
            return { ...project, stats: null, status: "unavailable" as const };
          }
        })
      );

      const html = generateTopPageHtml(projectsWithStats);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).send(`<html><body><h1>Error</h1><p>${message}</p></body></html>`);
    }
  });

  // GET /api/projects — JSON API
  router.get("/api/projects", async (_req: Request, res: Response) => {
    try {
      const projects = await listProjects();
      // 簡略化のため stats は省略（必要に応じて取得）
      res.json({ projects });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /api/projects/:encodedPath/pin — ピン留めトグル
  router.patch("/api/projects/:encodedPath/pin", async (req: Request, res: Response) => {
    try {
      const projectPath = decodeURIComponent(req.params.encodedPath);
      const result = await togglePin(projectPath);
      if (!result) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /api/projects/:encodedPath/hide — 非表示トグル
  router.patch("/api/projects/:encodedPath/hide", async (req: Request, res: Response) => {
    try {
      const projectPath = decodeURIComponent(req.params.encodedPath);
      const result = await toggleHide(projectPath);
      if (!result) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

// recordProjectAccess を再エクスポート（dashboard-routes.ts から使用）
export { recordProjectAccess };
