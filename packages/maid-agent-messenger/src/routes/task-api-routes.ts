/**
 * Task API エンドポイント
 * GET/PATCH /api/tasks/*, GET /api/dashboard
 */

import { Router, Request, Response } from "express";
import {
  executeListTasks,
  executeGetTask,
  executeUpdateTask,
  executeGetReport,
  type TaskStatus,
} from "../services/index.js";
import { getTimestamp } from "../utils/yaml-helper.js";

// プロジェクトパスを取得するヘルパー
function getProjectPathFromRequest(req: Request): string {
  const projectPath = req.headers["x-maid-project-path"] as string;
  if (!projectPath) {
    throw new Error("X-Maid-Project-Path header is required");
  }
  return projectPath;
}

const router = Router();

// GET /api/tasks - タスク一覧
router.get("/api/tasks", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);

    // クエリパラメータからフィルタ条件を構築
    const filter: {
      status?: TaskStatus[];
      assignee?: string;
      parentId?: string | null;
      limit?: number;
      offset?: number;
      sortField?: "createdAt" | "priority" | "status" | "id";
      sortOrder?: "asc" | "desc";
    } = {};

    if (req.query.status) {
      filter.status = (req.query.status as string).split(",") as TaskStatus[];
    }
    if (req.query.assignee) {
      filter.assignee = req.query.assignee as string;
    }
    if (req.query.parentId !== undefined) {
      filter.parentId = req.query.parentId === "null" ? null : (req.query.parentId as string);
    }
    if (req.query.limit) {
      filter.limit = parseInt(req.query.limit as string, 10);
    }
    if (req.query.offset) {
      filter.offset = parseInt(req.query.offset as string, 10);
    }
    if (req.query.sortField) {
      filter.sortField = req.query.sortField as "createdAt" | "priority" | "status" | "id";
    }
    if (req.query.sortOrder) {
      filter.sortOrder = req.query.sortOrder as "asc" | "desc";
    }

    const result = await executeListTasks(projectPath, filter);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task list retrieval failed", details: message });
  }
});

// GET /api/tasks/:id - タスク詳細
router.get("/api/tasks/:id", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const includeSubtasks = req.query.includeSubtasks === "true";

    const result = await executeGetTask(projectPath, {
      taskId: req.params.id,
      includeSubtasks,
    });

    if (!result.task) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task retrieval failed", details: message });
  }
});

// PATCH /api/tasks/:id - タスク更新
router.patch("/api/tasks/:id", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { status, substatus, summary, reportPath } = req.body;

    const result = await executeUpdateTask(projectPath, {
      taskId: req.params.id,
      status,
      substatus,
      summary,
      reportPath,
    });

    if (!result.success) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task update failed", details: message });
  }
});

// GET /api/tasks/:id/report - レポート内容取得
router.get("/api/tasks/:id/report", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const result = await executeGetReport(projectPath, {
      taskId: req.params.id,
      limit,
    });

    if (!result.success) {
      res.status(404).json({ error: result.message, taskId: req.params.id });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Report retrieval failed", details: message });
  }
});

// PATCH /api/tasks/:id/review - レビュー済みトグル
router.patch("/api/tasks/:id/review", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { reviewed } = req.body;

    const result = await executeUpdateTask(projectPath, {
      taskId: req.params.id,
      reviewed: reviewed !== undefined ? reviewed : true,
    });

    if (!result.success) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    res.json({ success: true, reviewed: result.task?.reviewed, reviewedAt: result.task?.reviewedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Review toggle failed", details: message });
  }
});

// PATCH /api/tasks/:id/star - スタートグル
router.patch("/api/tasks/:id/star", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { starred } = req.body;

    const result = await executeUpdateTask(projectPath, {
      taskId: req.params.id,
      starred: starred !== undefined ? starred : true,
    });

    if (!result.success) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    res.json({ success: true, starred: result.task?.starred, starredAt: result.task?.starredAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Star toggle failed", details: message });
  }
});

// GET /api/dashboard - ダッシュボードJSON
router.get("/api/dashboard", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);

    // 並列でタスクを取得
    const [pending, working, completed] = await Promise.all([
      executeListTasks(projectPath, { status: ["pending"] }),
      executeListTasks(projectPath, { status: ["working", "assigned"] }),
      executeListTasks(projectPath, { status: ["completed"], limit: 10, sortField: "id", sortOrder: "desc" }),
    ]);

    res.json({
      timestamp: getTimestamp(),
      summary: {
        pendingCount: pending.total,
        workingCount: working.total,
        completedCount: completed.total,
      },
      pending: pending.tasks,
      working: working.tasks,
      recentCompleted: completed.tasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Dashboard retrieval failed", details: message });
  }
});

export default router;
