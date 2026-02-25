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
  archiveReport,
  // V2.1 マイグレーション
  migrateToV2,
  checkMigrationStatus,
  type TaskStatus,
} from "../services/index.js";
import { getTimestamp } from "../utils/yaml-helper.js";
import { getProjectPathFromRequest } from "../middleware/project-path.js";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";

export interface TaskApiRoutesDeps {
  wsServer?: DashboardWebSocketServer;
}

export function createTaskApiRoutes(deps: TaskApiRoutesDeps = {}): Router {
  const { wsServer } = deps;
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
      summaryOnly?: boolean;
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
    if (req.query.summary === "true") {
      filter.summaryOnly = true;
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
    const summaryOnly = req.query.summary === "true";

    const result = await executeGetTask(projectPath, {
      taskId: req.params.id,
      includeSubtasks,
      summaryOnly,
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

// PATCH /api/tasks/:id - タスク更新 (V2.1拡張)
router.patch("/api/tasks/:id", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const txId = req.get("X-Transaction-Id");
    const {
      // 既存フィールド
      status, substatus, summary, reportPath,
      title, description, priority,
      // V2.1 拡張フィールド
      mainStatus, v2Substatus, type, size, tentative,
      blockedBy, artifacts, artifactAdd, reviewStatus,
      // V2.1 追加フィールド
      archived, actionRequired, starred,
    } = req.body;

    const result = await executeUpdateTask(projectPath, {
      taskId: req.params.id,
      status,
      substatus,
      summary,
      title,
      description,
      priority,
      reportPath,
      // V2.1 拡張
      mainStatus,
      v2Substatus,
      type,
      size,
      tentative,
      blockedBy,
      artifacts,
      artifactAdd,
      reviewStatus,
      // V2.1 追加
      archived,
      actionRequired,
      starred,
    });

    if (!result.success) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    // WebSocket通知: タスク更新をリアルタイム配信
    if (wsServer) {
      wsServer.broadcast(projectPath, {
        type: "taskUpdated",
        taskId: req.params.id,
        task: result.task,
        txId,
      });
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
    const txId = req.get("X-Transaction-Id");
    const { reviewed } = req.body;

    const result = await executeUpdateTask(projectPath, {
      taskId: req.params.id,
      reviewed: reviewed !== undefined ? reviewed : true,
    });

    if (!result.success) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    // WebSocket通知: タスク更新をリアルタイム配信
    if (wsServer) {
      wsServer.broadcast(projectPath, {
        type: "taskUpdated",
        taskId: req.params.id,
        field: "reviewed",
        value: result.task?.reviewed,
        txId,
      });
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
    const txId = req.get("X-Transaction-Id");
    const { starred } = req.body;

    const result = await executeUpdateTask(projectPath, {
      taskId: req.params.id,
      starred: starred !== undefined ? starred : true,
    });

    if (!result.success) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    // WebSocket通知: タスク更新をリアルタイム配信
    if (wsServer) {
      wsServer.broadcast(projectPath, {
        type: "taskUpdated",
        taskId: req.params.id,
        field: "starred",
        value: result.task?.starred,
        txId,
      });
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

// POST /api/tasks/:id/rearchive - 報告書を再アーカイブ
router.post("/api/tasks/:id/rearchive", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { agentId } = req.body;

    // タスク情報を取得（summaryOnly: false で完全なTask型を取得）
    const taskResult = await executeGetTask(projectPath, { taskId: req.params.id, summaryOnly: false });
    if (!taskResult.task) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    const task = taskResult.task as import("../services/index.js").Task;
    const results: Array<{
      agentId: string;
      archived: boolean;
      archivePath?: string;
      reason?: string;
    }> = [];

    // 対象エージェントを特定
    const targetAgentIds = agentId
      ? [agentId]
      : task.assignees.map((a) => a.agentId);

    for (const agent of targetAgentIds) {
      const result = await archiveReport(
        projectPath,
        task,
        agent,
        true  // skipTimestampCheck: タイムスタンプ無視で再アーカイブ
      );
      results.push({
        agentId: agent,
        archived: result.archived,
        archivePath: result.archivePath,
        reason: result.reason,
      });
    }

    res.json({
      success: true,
      taskId: req.params.id,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Rearchive failed", details: message });
  }
});

// =============================================================================
// V2.1 マイグレーション API
// =============================================================================

// GET /api/v2/migration/status - マイグレーション状況確認
router.get("/api/v2/migration/status", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const status = await checkMigrationStatus(projectPath);
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Migration status check failed", details: message });
  }
});

// POST /api/v2/migration/run - マイグレーション実行
router.post("/api/v2/migration/run", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { dryRun } = req.body;

    const result = await migrateToV2(projectPath, { dryRun: dryRun === true });

    res.json({
      success: true,
      dryRun: dryRun === true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Migration failed", details: message });
  }
});

  return router;
}

// 後方互換性のためデフォルトエクスポートを維持
export default createTaskApiRoutes();
