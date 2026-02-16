/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/completed, /dashboard/data, /dashboard/events
 */

import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { loadConfig, getServerUrl } from "../utils/config-loader.js";
import { getJstTimestamp } from "../utils/yaml-helper.js";
import {
  executeListTasks,
  executeGetTeamStatus,
  executeUpdateTask,
  type Task,
} from "../services/index.js";
import { getQueueMaidPath } from "../utils/path-helpers.js";
import type { DashboardData } from "../views/dashboard-html.js";
import { getProjectPathFromRequest } from "../middleware/session-manager.js";
import { recordProjectAccess } from "../services/project-registry.js";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";

// DashboardData型を再エクスポート
export type { DashboardData };

export interface DashboardRoutesDeps {
  generateDashboardHtml: (data: DashboardData, editorScheme?: string) => string;
  generateTaskHtml: (tasks: any[], type: string, projectPath: string, scheme?: string) => string;
  composeMasterWaitingHtml: (masterWaitingTasks: any[], masterReviewTasks: any[], projectPath: string, scheme?: string) => string;
  wsServer?: DashboardWebSocketServer; // WebSocket サーバー（オプション）
}

export function createDashboardRoutes(deps: DashboardRoutesDeps): Router {
  const { generateDashboardHtml, generateTaskHtml, composeMasterWaitingHtml, wsServer } = deps;
  const router = Router();

  // GET /dashboard - HTMLダッシュボード（ブラウザ用）
  router.get("/dashboard", async (req: Request, res: Response) => {
    try {
      // project未指定時 → トップページにリダイレクト
      if (!req.query.project && !req.headers["x-maid-project-path"]) {
        res.redirect("/");
        return;
      }

      // クエリパラメータからプロジェクトパスを取得（?project=/path/to/project）
      const projectPath = req.query.project
        ? (req.query.project as string)
        : getProjectPathFromRequest(req);

      // エディタスキームを取得（?editor=vscode|windsurf|cursor、設定ファイルのデフォルト値を使用）
      const config = await loadConfig();
      const editorScheme = (req.query.editor as string) || config.dashboard.editor;

      // 並列でデータを取得（Phase 1: 特殊カテゴリ・blocked追加, Phase 2: 本日完了追加）
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 完了セクションのソート設定を取得
      const completedSortField = (req.query.completedSortField as string) === "updatedAt" ? "updatedAt" : "id";

      const [pending, working, completed, completedAll, masterWaiting, masterReview, skillCandidates, improvements, teamStatus] = await Promise.all([
        executeListTasks(projectPath, { status: ["pending"] }),
        executeListTasks(projectPath, { status: ["working", "assigned"] }),
        executeListTasks(projectPath, { status: ["completed"], limit: 10, sortField: completedSortField, sortOrder: "desc" }),
        executeListTasks(projectPath, { status: ["completed"], sortField: "completedAt", sortOrder: "desc", limit: 500 }),  // 本日完了カウント用
        executeListTasks(projectPath, { category: ["action_required"], status: ["pending", "assigned", "working", "blocked"] }),
        executeListTasks(projectPath, { category: ["action_required"], status: ["completed"], reviewed: false }),
        executeListTasks(projectPath, { category: ["skill_candidate"], status: ["pending", "assigned", "working", "blocked"] }),
        executeListTasks(projectPath, { category: ["improvement"], status: ["pending", "assigned", "working", "blocked"] }),
        executeGetTeamStatus({ queueMaidPath: getQueueMaidPath(projectPath) }),
      ]);

      // 本日完了タスクをカウント
      const completedTodayCount = (completedAll.tasks as Task[]).filter((task) => {
        if (!task.completedAt) return false;
        const completedDate = new Date(task.completedAt);
        return completedDate >= today;
      }).length;

      // HTML生成
      const SPECIAL_CATEGORIES = ["action_required", "skill_candidate", "improvement"];
      const html = generateDashboardHtml({
        projectPath,
        timestamp: getJstTimestamp(),
        pending: pending.tasks as Task[],
        working: working.tasks as Task[],
        recentCompleted: completed.tasks as Task[],
        completedTotal: completed.total,
        masterWaiting: masterWaiting.tasks as Task[],
        masterReview: masterReview.tasks as Task[],
        skillCandidates: skillCandidates.tasks as Task[],
        improvements: improvements.tasks as Task[],
        teamStatus: teamStatus.agents,
        stats: {
          pendingCount: (pending.tasks as Task[]).filter((t) => !t.category || !SPECIAL_CATEGORIES.includes(t.category)).length,
          workingCount: working.total,
          masterWaitingCount: masterWaiting.total + masterReview.total,
          completedTodayCount,
        },
        serverUrl: getServerUrl(config),
      }, editorScheme);

      // アクセス記録（非同期、レスポンスをブロックしない）
      recordProjectAccess(projectPath).catch((err) =>
        console.error("Failed to record project access:", err)
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).send(`<html><body><h1>Error</h1><p>${message}</p></body></html>`);
    }
  });

  // GET /dashboard/completed - 完了タスクページネーション用
  router.get("/dashboard/completed", async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.project
        ? decodeURIComponent(req.query.project as string)
        : getProjectPathFromRequest(req);

      const config = await loadConfig();
      const editorScheme = (req.query.editor as string) || config.dashboard.editor;

      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 10;

      // reviewed/starredフィルタ: "yes" → true, "no" → false, 未指定 → undefined
      const reviewedParam = req.query.reviewed as string | undefined;
      const starredParam = req.query.starred as string | undefined;
      const reviewed = reviewedParam === "yes" ? true : reviewedParam === "no" ? false : undefined;
      const starred = starredParam === "yes" ? true : starredParam === "no" ? false : undefined;

      // 完了セクションのソート設定を取得
      const completedSortField = (req.query.completedSortField as string) === "updatedAt" ? "updatedAt" : "id";

      // テキスト検索パラメータ
      const search = (req.query.search as string) || undefined;

      const completed = await executeListTasks(projectPath, {
        status: ["completed"],
        limit,
        offset,
        reviewed,
        starred,
        search,
        sortField: completedSortField,
        sortOrder: "desc",
      });

      res.json({
        html: generateTaskHtml(completed.tasks, "completed", projectPath, editorScheme),
        total: completed.total,
        offset,
        limit,
        hasMore: completed.hasMore,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // GET /dashboard/data - JSON APIエンドポイント（VSCode Webview用）
  router.get("/dashboard/data", async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.project
        ? decodeURIComponent(req.query.project as string)
        : getProjectPathFromRequest(req);

      // エディタスキームを取得
      const config = await loadConfig();
      const editorScheme = (req.query.editor as string) || config.dashboard.editor;

      // クライアントの完了セクション表示設定を取得
      const completedLimit = parseInt(req.query.completedLimit as string) || 10;
      const completedOffset = parseInt(req.query.completedOffset as string) || 0;
      const completedReviewedParam = req.query.completedReviewed as string | undefined;
      const completedStarredParam = req.query.completedStarred as string | undefined;
      const completedReviewed = completedReviewedParam === "yes" ? true : completedReviewedParam === "no" ? false : undefined;
      const completedStarred = completedStarredParam === "yes" ? true : completedStarredParam === "no" ? false : undefined;
      const clientCompletedHash = req.query.completedHash as string | undefined;
      // 完了セクションのソート設定を取得
      const completedSortField = (req.query.completedSortField as string) === "updatedAt" ? "updatedAt" : "id";
      // テキスト検索パラメータ
      const completedSearch = (req.query.completedSearch as string) || undefined;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const ACTIVE_STATUSES: ("pending" | "assigned" | "working" | "blocked")[] = ["pending", "assigned", "working", "blocked"];

      const [pending, working, completed, completedAll, masterWaiting, masterReview, skillCandidates, improvements] = await Promise.all([
        executeListTasks(projectPath, { status: ["pending"] }),
        executeListTasks(projectPath, { status: ["working", "assigned"] }),
        executeListTasks(projectPath, {
          status: ["completed"],
          limit: completedLimit,
          offset: completedOffset,
          reviewed: completedReviewed,
          starred: completedStarred,
          search: completedSearch,
          sortField: completedSortField,
          sortOrder: "desc",
        }),
        executeListTasks(projectPath, { status: ["completed"], sortField: "completedAt", sortOrder: "desc", limit: 500 }),
        executeListTasks(projectPath, { category: ["action_required"], status: ACTIVE_STATUSES }),
        executeListTasks(projectPath, { category: ["action_required"], status: ["completed"], reviewed: false }),
        executeListTasks(projectPath, { category: ["skill_candidate"], status: ACTIVE_STATUSES }),
        executeListTasks(projectPath, { category: ["improvement"], status: ACTIVE_STATUSES }),
      ]);

      const completedTodayCount = (completedAll.tasks as Task[]).filter((task) => {
        if (!task.completedAt) return false;
        const completedDate = new Date(task.completedAt);
        return completedDate >= today;
      }).length;

      // 待機中から特殊カテゴリを除外
      const specialCategories = ["action_required", "skill_candidate", "improvement"];
      const filteredPendingTasks = pending.tasks.filter((t: any) => !t.category || !specialCategories.includes(t.category));

      // 完了セクションのHTML生成とハッシュ計算
      const completedHtml = generateTaskHtml(completed.tasks, "completed", projectPath, editorScheme);
      const completedHash = createHash("md5").update(completedHtml).digest("hex").substring(0, 16);
      const completedChanged = clientCompletedHash !== completedHash;

      // SSEと同じ形式でHTML文字列を返す
      const data = {
        stats: {
          pendingCount: filteredPendingTasks.length,
          workingCount: working.total,
          masterWaitingCount: masterWaiting.total + masterReview.total,
          completedTodayCount,
          timestamp: getJstTimestamp(),
        },
        tasks: {
          pending: generateTaskHtml(filteredPendingTasks, "pending", projectPath),
          working: generateTaskHtml(working.tasks, "working", projectPath),
          completed: completedChanged ? completedHtml : undefined,
          masterWaiting: composeMasterWaitingHtml(masterWaiting.tasks, masterReview.tasks, projectPath),
          masterReview: "",
          skillCandidates: generateTaskHtml(skillCandidates.tasks, "skill_candidate", projectPath),
          improvements: generateTaskHtml(improvements.tasks, "improvement", projectPath),
        },
        completedMeta: {
          changed: completedChanged,
          hash: completedHash,
          total: completed.total,
        },
        serverUrl: getServerUrl(config),
      };

      res.setHeader("Content-Type", "application/json");
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // GET /dashboard/events - SSEエンドポイント
  router.get("/dashboard/events", async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.project
        ? decodeURIComponent(req.query.project as string)
        : getProjectPathFromRequest(req);

      // エディタスキームを取得
      const config = await loadConfig();
      const editorScheme = (req.query.editor as string) || config.dashboard.editor;

      // SSEヘッダー設定
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // 接続確認
      res.write("data: {\"type\":\"connected\"}\n\n");

      // 完了セクションのソート設定を取得（SSE接続時のクエリパラメータ）
      const completedSortField = (req.query.completedSortField as string) === "updatedAt" ? "updatedAt" : "id";

      // 定期的にタスク情報を送信（10秒ごと）
      const intervalId = setInterval(async () => {
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const sseActiveStatuses: ("pending" | "assigned" | "working" | "blocked")[] = ["pending", "assigned", "working", "blocked"];

          const [pending, working, completed, completedAll, masterWaiting, masterReview, skillCandidates, improvements] = await Promise.all([
            executeListTasks(projectPath, { status: ["pending"] }),
            executeListTasks(projectPath, { status: ["working", "assigned"] }),
            executeListTasks(projectPath, { status: ["completed"], limit: 10, sortField: completedSortField, sortOrder: "desc" }),
            executeListTasks(projectPath, { status: ["completed"], sortField: "completedAt", sortOrder: "desc", limit: 500 }),
            executeListTasks(projectPath, { category: ["action_required"], status: sseActiveStatuses }),
            executeListTasks(projectPath, { category: ["action_required"], status: ["completed"], reviewed: false }),
            executeListTasks(projectPath, { category: ["skill_candidate"], status: sseActiveStatuses }),
            executeListTasks(projectPath, { category: ["improvement"], status: sseActiveStatuses }),
          ]);

          const completedTodayCount = (completedAll.tasks as Task[]).filter((task) => {
            if (!task.completedAt) return false;
            const completedDate = new Date(task.completedAt);
            return completedDate >= today;
          }).length;

          // 待機中から特殊カテゴリを除外
          const sseSpecialCategories = ["action_required", "skill_candidate", "improvement"];
          const sseFilteredPending = pending.tasks.filter((t: any) => !t.category || !sseSpecialCategories.includes(t.category));

          const stats = {
            pendingCount: sseFilteredPending.length,
            workingCount: working.total,
            masterWaitingCount: masterWaiting.total + masterReview.total,
            completedTodayCount,
            timestamp: getJstTimestamp(),
          };

          // 統計情報を送信
          res.write(`data: ${JSON.stringify({ type: "update", stats })}\n\n`);

          // タスクリストHTMLを送信
          const tasksHtml = {
            pending: generateTaskHtml(sseFilteredPending, "pending", projectPath),
            working: generateTaskHtml(working.tasks, "working", projectPath),
            completed: generateTaskHtml(completed.tasks, "completed", projectPath, editorScheme),
            masterWaiting: composeMasterWaitingHtml(masterWaiting.tasks, masterReview.tasks, projectPath),
            masterReview: "",
            skillCandidates: generateTaskHtml(skillCandidates.tasks, "skill_candidate", projectPath),
            improvements: generateTaskHtml(improvements.tasks, "improvement", projectPath),
          };

          res.write(`data: ${JSON.stringify({ type: "tasks", tasks: tasksHtml })}\n\n`);
        } catch (e) {
          console.error("SSE update error:", e);
        }
      }, 10000);

      // クライアント切断時のクリーンアップ
      req.on("close", () => {
        clearInterval(intervalId);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "SSE connection failed", details: message });
    }
  });

  // PATCH /dashboard/tasks/:id/review - レビュー済みトグル（LAN公開）
  router.patch("/dashboard/tasks/:id/review", async (req: Request, res: Response) => {
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

      // WebSocket通知: タスク更新をリアルタイム配信
      if (wsServer) {
        wsServer.broadcast(projectPath, {
          type: "taskUpdated",
          taskId: req.params.id,
          field: "reviewed",
          value: result.task?.reviewed,
        });
      }

      res.json({ success: true, reviewed: result.task?.reviewed, reviewedAt: result.task?.reviewedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Review toggle failed", details: message });
    }
  });

  // PATCH /dashboard/tasks/:id/star - スタートグル（LAN公開）
  router.patch("/dashboard/tasks/:id/star", async (req: Request, res: Response) => {
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

      // WebSocket通知: タスク更新をリアルタイム配信
      if (wsServer) {
        wsServer.broadcast(projectPath, {
          type: "taskUpdated",
          taskId: req.params.id,
          field: "starred",
          value: result.task?.starred,
        });
      }

      res.json({ success: true, starred: result.task?.starred, starredAt: result.task?.starredAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Star toggle failed", details: message });
    }
  });

  return router;
}
