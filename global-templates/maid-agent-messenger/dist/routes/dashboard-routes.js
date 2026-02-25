/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/completed, /dashboard/data, /dashboard/events
 */
import { Router } from "express";
import { createHash } from "crypto";
import { loadConfig, getServerUrl } from "../utils/config-loader.js";
import { getJstTimestamp } from "../utils/yaml-helper.js";
import { executeListTasks, executeGetTeamStatus, executeUpdateTask, executeGetReport, generateV2DashboardData, } from "../services/index.js";
import { convertMarkdownToHtml, escapeHtml, linkifyProjectPaths } from "../markdown-utils.js";
import { getQueueMaidPath } from "../utils/path-helpers.js";
import { getProjectPathFromRequest } from "../middleware/project-path.js";
import { recordProjectAccess } from "../services/project-registry.js";
export function createDashboardRoutes(deps) {
    const { generateDashboardHtml, generateTaskHtml, composeMasterWaitingHtml, generateGoalTreeHtml, generateReviewQueueHtml, generateArtifactsHtml, generateV2StatsHtml, wsServer, } = deps;
    const router = Router();
    // GET /dashboard - HTMLダッシュボード（ブラウザ用）
    router.get("/dashboard", async (req, res) => {
        try {
            // project未指定時 → トップページにリダイレクト
            if (!req.query.project && !req.headers["x-maid-project-path"]) {
                res.redirect("/");
                return;
            }
            // クエリパラメータからプロジェクトパスを取得（?project=/path/to/project）
            const projectPath = req.query.project
                ? req.query.project
                : getProjectPathFromRequest(req);
            // エディタスキームを取得（?editor=vscode|windsurf|cursor、設定ファイルのデフォルト値を使用）
            const config = await loadConfig();
            const editorScheme = req.query.editor || config.dashboard.editor;
            // バージョンパラメータ（デフォルト: v2）
            const versionParam = req.query.version;
            const dashboardVersion = versionParam === "v1" ? "v1" : "v2";
            // 並列でデータを取得（Phase 1: 特殊カテゴリ・blocked追加, Phase 2: 本日完了追加）
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            // 完了セクションのソート設定を取得
            const completedSortField = req.query.completedSortField === "updatedAt" ? "updatedAt" : "id";
            const [pending, working, completed, completedAll, masterWaiting, masterReview, skillCandidates, improvements, teamStatus, v2Data] = await Promise.all([
                executeListTasks(projectPath, { status: ["pending"] }),
                executeListTasks(projectPath, { status: ["working", "assigned", "blocked"] }),
                executeListTasks(projectPath, { status: ["completed"], limit: 10, sortField: completedSortField, sortOrder: "desc" }),
                executeListTasks(projectPath, { status: ["completed"], sortField: "completedAt", sortOrder: "desc", limit: 500 }), // 本日完了カウント用
                executeListTasks(projectPath, { actionRequired: true, status: ["pending", "assigned", "working", "blocked"] }),
                executeListTasks(projectPath, { actionRequired: true, status: ["completed"], reviewed: false }),
                executeListTasks(projectPath, { category: ["skill_candidate"], status: ["pending", "assigned", "working", "blocked"] }),
                executeListTasks(projectPath, { category: ["improvement"], status: ["pending", "assigned", "working", "blocked"] }),
                executeGetTeamStatus({ queueMaidPath: getQueueMaidPath(projectPath) }),
                generateV2DashboardData(projectPath, { statusFilter: "all", showArchived: true, limit: 500 }), // V2.1 ダッシュボードデータ（クライアントサイドでフィルタリング）
            ]);
            // 本日完了タスクをカウント
            const completedTodayCount = completedAll.tasks.filter((task) => {
                if (!task.completedAt)
                    return false;
                const completedDate = new Date(task.completedAt);
                return completedDate >= today;
            }).length;
            // HTML生成
            const SPECIAL_CATEGORIES = ["skill_candidate", "improvement"];
            const html = generateDashboardHtml({
                projectPath,
                timestamp: getJstTimestamp(),
                pending: pending.tasks,
                working: working.tasks,
                recentCompleted: completed.tasks,
                completedTotal: completed.total,
                masterWaiting: masterWaiting.tasks,
                masterReview: masterReview.tasks,
                skillCandidates: skillCandidates.tasks,
                improvements: improvements.tasks,
                teamStatus: teamStatus.agents,
                stats: {
                    pendingCount: pending.tasks.filter((t) => !t.category || !SPECIAL_CATEGORIES.includes(t.category)).length,
                    workingCount: working.total,
                    masterWaitingCount: masterWaiting.total + masterReview.total,
                    completedTodayCount,
                },
                serverUrl: getServerUrl(config),
                // V2.1 データ
                v2Goals: v2Data.v2Goals,
                v2ReviewQueue: v2Data.v2ReviewQueue,
                v2Artifacts: v2Data.v2Artifacts,
                v2Stats: v2Data.v2Stats,
                // V1/V2切り替え
                dashboardVersion,
            }, editorScheme);
            // アクセス記録（非同期、レスポンスをブロックしない）
            recordProjectAccess(projectPath).catch((err) => console.error("Failed to record project access:", err));
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(html);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).send(`<html><body><h1>Error</h1><p>${message}</p></body></html>`);
        }
    });
    // GET /dashboard/completed - 完了タスクページネーション用
    router.get("/dashboard/completed", async (req, res) => {
        try {
            const projectPath = req.query.project
                ? decodeURIComponent(req.query.project)
                : getProjectPathFromRequest(req);
            const config = await loadConfig();
            const editorScheme = req.query.editor || config.dashboard.editor;
            const offset = parseInt(req.query.offset) || 0;
            const limit = parseInt(req.query.limit) || 10;
            // reviewed/starredフィルタ: "yes" → true, "no" → false, 未指定 → undefined
            const reviewedParam = req.query.reviewed;
            const starredParam = req.query.starred;
            const reviewed = reviewedParam === "yes" ? true : reviewedParam === "no" ? false : undefined;
            const starred = starredParam === "yes" ? true : starredParam === "no" ? false : undefined;
            // 完了セクションのソート設定を取得
            const completedSortField = req.query.completedSortField === "updatedAt" ? "updatedAt" : "id";
            // テキスト検索パラメータ
            const search = req.query.search || undefined;
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    });
    // GET /dashboard/data - JSON APIエンドポイント（VSCode Webview用）
    router.get("/dashboard/data", async (req, res) => {
        try {
            const projectPath = req.query.project
                ? decodeURIComponent(req.query.project)
                : getProjectPathFromRequest(req);
            // エディタスキームを取得
            const config = await loadConfig();
            const editorScheme = req.query.editor || config.dashboard.editor;
            // クライアントの完了セクション表示設定を取得
            const completedLimit = parseInt(req.query.completedLimit) || 10;
            const completedOffset = parseInt(req.query.completedOffset) || 0;
            const completedReviewedParam = req.query.completedReviewed;
            const completedStarredParam = req.query.completedStarred;
            const completedReviewed = completedReviewedParam === "yes" ? true : completedReviewedParam === "no" ? false : undefined;
            const completedStarred = completedStarredParam === "yes" ? true : completedStarredParam === "no" ? false : undefined;
            const clientCompletedHash = req.query.completedHash;
            // 完了セクションのソート設定を取得
            const completedSortField = req.query.completedSortField === "updatedAt" ? "updatedAt" : "id";
            // テキスト検索パラメータ
            const completedSearch = req.query.completedSearch || undefined;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const ACTIVE_STATUSES = ["pending", "assigned", "working", "blocked"];
            const [pending, working, completed, completedAll, masterWaiting, masterReview, skillCandidates, improvements, v2Data] = await Promise.all([
                executeListTasks(projectPath, { status: ["pending"] }),
                executeListTasks(projectPath, { status: ["working", "assigned", "blocked"] }),
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
                executeListTasks(projectPath, { actionRequired: true, status: ACTIVE_STATUSES }),
                executeListTasks(projectPath, { actionRequired: true, status: ["completed"], reviewed: false }),
                executeListTasks(projectPath, { category: ["skill_candidate"], status: ACTIVE_STATUSES }),
                executeListTasks(projectPath, { category: ["improvement"], status: ACTIVE_STATUSES }),
                generateV2DashboardData(projectPath, { statusFilter: "all", showArchived: true, limit: 500 }), // V2.1 ダッシュボードデータ（クライアントサイドでフィルタリング）
            ]);
            const completedTodayCount = completedAll.tasks.filter((task) => {
                if (!task.completedAt)
                    return false;
                const completedDate = new Date(task.completedAt);
                return completedDate >= today;
            }).length;
            // 待機中から特殊カテゴリとactionRequiredを除外
            const specialCategories = ["skill_candidate", "improvement"];
            const filteredPendingTasks = pending.tasks.filter((t) => (!t.category || !specialCategories.includes(t.category)) && !t.actionRequired);
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
                // V2.1 データ
                v2: v2Data,
                // V2.1 HTML（関数が提供されている場合）
                v2Html: {
                    goals: generateGoalTreeHtml ? generateGoalTreeHtml(v2Data.v2Goals, projectPath) : undefined,
                    reviewQueue: generateReviewQueueHtml ? generateReviewQueueHtml(v2Data.v2ReviewQueue, projectPath) : undefined,
                    artifacts: generateArtifactsHtml ? generateArtifactsHtml(v2Data.v2Artifacts, projectPath) : undefined,
                    stats: generateV2StatsHtml ? generateV2StatsHtml(v2Data.v2Stats) : undefined,
                },
            };
            res.setHeader("Content-Type", "application/json");
            res.json(data);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    });
    // GET /dashboard/events - SSEエンドポイント
    router.get("/dashboard/events", async (req, res) => {
        try {
            const projectPath = req.query.project
                ? decodeURIComponent(req.query.project)
                : getProjectPathFromRequest(req);
            // エディタスキームを取得
            const config = await loadConfig();
            const editorScheme = req.query.editor || config.dashboard.editor;
            // SSEヘッダー設定
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("X-Accel-Buffering", "no");
            // 接続確認
            res.write("data: {\"type\":\"connected\"}\n\n");
            // 完了セクションのソート設定を取得（SSE接続時のクエリパラメータ）
            const completedSortField = req.query.completedSortField === "updatedAt" ? "updatedAt" : "id";
            // 定期的にタスク情報を送信（10秒ごと）
            const intervalId = setInterval(async () => {
                try {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const sseActiveStatuses = ["pending", "assigned", "working", "blocked"];
                    const [pending, working, completed, completedAll, masterWaiting, masterReview, skillCandidates, improvements, v2Data] = await Promise.all([
                        executeListTasks(projectPath, { status: ["pending"] }),
                        executeListTasks(projectPath, { status: ["working", "assigned", "blocked"] }),
                        executeListTasks(projectPath, { status: ["completed"], limit: 10, sortField: completedSortField, sortOrder: "desc" }),
                        executeListTasks(projectPath, { status: ["completed"], sortField: "completedAt", sortOrder: "desc", limit: 500 }),
                        executeListTasks(projectPath, { actionRequired: true, status: sseActiveStatuses }),
                        executeListTasks(projectPath, { actionRequired: true, status: ["completed"], reviewed: false }),
                        executeListTasks(projectPath, { category: ["skill_candidate"], status: sseActiveStatuses }),
                        executeListTasks(projectPath, { category: ["improvement"], status: sseActiveStatuses }),
                        generateV2DashboardData(projectPath, { statusFilter: "all", showArchived: true, limit: 500 }), // V2.1 ダッシュボードデータ（クライアントサイドでフィルタリング）
                    ]);
                    const completedTodayCount = completedAll.tasks.filter((task) => {
                        if (!task.completedAt)
                            return false;
                        const completedDate = new Date(task.completedAt);
                        return completedDate >= today;
                    }).length;
                    // 待機中から特殊カテゴリとactionRequiredを除外
                    const sseSpecialCategories = ["skill_candidate", "improvement"];
                    const sseFilteredPending = pending.tasks.filter((t) => (!t.category || !sseSpecialCategories.includes(t.category)) && !t.actionRequired);
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
                    // V2.1 HTMLを生成（関数が提供されている場合）
                    const v2Html = {
                        goals: generateGoalTreeHtml ? generateGoalTreeHtml(v2Data.v2Goals, projectPath) : undefined,
                        reviewQueue: generateReviewQueueHtml ? generateReviewQueueHtml(v2Data.v2ReviewQueue, projectPath) : undefined,
                        artifacts: generateArtifactsHtml ? generateArtifactsHtml(v2Data.v2Artifacts, projectPath) : undefined,
                        stats: generateV2StatsHtml ? generateV2StatsHtml(v2Data.v2Stats) : undefined,
                    };
                    res.write(`data: ${JSON.stringify({ type: "tasks", tasks: tasksHtml, v2: v2Data, v2Html })}\n\n`);
                }
                catch (e) {
                    console.error("SSE update error:", e);
                }
            }, 10000);
            // クライアント切断時のクリーンアップ
            req.on("close", () => {
                clearInterval(intervalId);
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "SSE connection failed", details: message });
        }
    });
    // PATCH /dashboard/tasks/:id/review - レビュー済みトグル（LAN公開）
    router.patch("/dashboard/tasks/:id/review", async (req, res) => {
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
            // WebSocket通知: タスク更新をリアルタイム配信（即座にbroadcast）
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Review toggle failed", details: message });
        }
    });
    // GET /dashboard/v2/goals - V2.1 Goals ページネーション用エンドポイント
    router.get("/dashboard/v2/goals", async (req, res) => {
        try {
            const projectPath = req.query.project
                ? decodeURIComponent(req.query.project)
                : getProjectPathFromRequest(req);
            // ページネーションパラメータ
            const offset = parseInt(req.query.offset) || 0;
            const limit = parseInt(req.query.limit) || 10;
            // フィルタパラメータ
            const statusParam = req.query.status;
            const statusFilter = statusParam === "closed" ? "closed" :
                statusParam === "all" ? "all" : "open";
            const showArchived = req.query.archived === "true";
            // ソートパラメータ
            const sortFieldParam = req.query.sort;
            const sortField = sortFieldParam === "updatedAt" ? "updatedAt" : "id";
            const sortOrderParam = req.query.order;
            const sortOrder = sortOrderParam === "asc" ? "asc" : "desc";
            // V2.1 ダッシュボードデータを取得（ページネーション・ソート適用）
            const v2Data = await generateV2DashboardData(projectPath, {
                offset,
                limit,
                statusFilter,
                showArchived,
                sortField,
                sortOrder,
            });
            res.json({
                goals: v2Data.v2Goals,
                total: v2Data.totalGoals,
                offset,
                limit,
                hasMore: offset + v2Data.v2Goals.length < v2Data.totalGoals,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: message });
        }
    });
    // PATCH /dashboard/tasks/:id/star - スタートグル（LAN公開）
    router.patch("/dashboard/tasks/:id/star", async (req, res) => {
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
            // WebSocket通知: タスク更新をリアルタイム配信（即座にbroadcast）
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Star toggle failed", details: message });
        }
    });
    // GET /report - 報告書表示（LAN公開）
    router.get("/report", async (req, res) => {
        try {
            const taskId = req.query.task;
            if (!taskId) {
                res.status(400).send("<html><body><h1>Error</h1><p>task parameter is required</p></body></html>");
                return;
            }
            const projectPath = req.query.project
                ? decodeURIComponent(req.query.project)
                : getProjectPathFromRequest(req);
            const result = await executeGetReport(projectPath, { taskId });
            if (!result.success) {
                res.status(404).send(`<html><body><h1>Not Found</h1><p>${escapeHtml(result.message || "Report not found")}</p></body></html>`);
                return;
            }
            if (result.reports.length === 0) {
                res.status(404).send(`<html><body><h1>Not Found</h1><p>このタスクには報告書が登録されていません</p></body></html>`);
                return;
            }
            // 報告書の内容をHTMLに変換
            const reportsHtml = result.reports.map((report) => {
                if (report.error) {
                    return `<div class="report-error"><h3>${escapeHtml(report.path)}</h3><p class="error">${escapeHtml(report.error)}</p></div>`;
                }
                if (!report.content) {
                    return `<div class="report-error"><h3>${escapeHtml(report.path)}</h3><p class="error">内容を取得できませんでした</p></div>`;
                }
                // Markdown → HTML変換、パスリンク化
                let html = convertMarkdownToHtml(report.content);
                html = linkifyProjectPaths(html, projectPath);
                return `<div class="report-content">
          <h3 class="report-path">${escapeHtml(report.path)}</h3>
          <div class="report-body">${html}</div>
        </div>`;
            }).join("\n");
            const pageHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>報告書 - ${escapeHtml(taskId)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #f5a623; margin-bottom: 20px; }
    .report-content { background: #16213e; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .report-path { color: #7fdbff; font-size: 0.9em; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #333; }
    .report-body { line-height: 1.6; }
    .report-body h1, .report-body h2, .report-body h3 { color: #f5a623; }
    .report-body a { color: #7fdbff; }
    .report-body code { background: #0d1b2a; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .report-body pre { background: #0d1b2a; padding: 15px; border-radius: 8px; overflow-x: auto; }
    .report-body pre code { padding: 0; }
    .report-body ul, .report-body ol { padding-left: 20px; }
    .report-body table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    .report-body th, .report-body td { border: 1px solid #444; padding: 8px; text-align: left; }
    .report-body th { background: #0d1b2a; }
    .report-error { background: #3e1616; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .error { color: #ff6b6b; }
    .back-link { display: inline-block; margin-bottom: 20px; color: #7fdbff; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <a href="/dashboard?project=${encodeURIComponent(projectPath)}" class="back-link">← ダッシュボードに戻る</a>
    <h1>📄 報告書 - ${escapeHtml(taskId)}</h1>
    ${reportsHtml}
  </div>
</body>
</html>`;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(pageHtml);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).send(`<html><body><h1>Error</h1><p>${escapeHtml(message)}</p></body></html>`);
        }
    });
    return router;
}
