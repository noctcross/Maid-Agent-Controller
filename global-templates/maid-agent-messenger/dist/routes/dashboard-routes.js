/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/completed, /dashboard/data, /dashboard/events
 */
import { Router } from "express";
import { createHash } from "crypto";
import { loadConfig, getServerUrl } from "../utils/config-loader.js";
import { getJstTimestamp } from "../utils/yaml-helper.js";
import { executeListTasks, executeGetTeamStatus, executeUpdateTask, executeGetReport, generateDashboardData, } from "../services/index.js";
import { convertMarkdownToHtml, escapeHtml, linkifyProjectPaths } from "../markdown-utils.js";
import { extractAgentIdFromPath, generateAgentBackgroundSnippet } from "../utils/agent-image.js";
import { getQueueMaidPath } from "../utils/path-helpers.js";
import { getProjectPathFromRequest } from "../middleware/project-path.js";
import { recordProjectAccess } from "../services/project-registry.js";
import { logger } from "../utils/logger.js";
export function createDashboardRoutes(deps) {
    const { generateDashboardHtml, generateTaskHtml, composeMasterWaitingHtml, generateTaskTreeHtml, generateReviewQueueHtml, generateArtifactsHtml, generateStatsHtml, generateTeamStatusHtml, wsServer, } = deps;
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
            // ダッシュボードバージョン（v2固定）
            const dashboardVersion = "v2";
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
                generateDashboardData(projectPath, { statusFilter: "all", showArchived: true, limit: 500 }), // V2.1 ダッシュボードデータ（クライアントサイドでフィルタリング）
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
                // ダッシュボードバージョン
                dashboardVersion,
            }, editorScheme);
            // アクセス記録（非同期、レスポンスをブロックしない）
            recordProjectAccess(projectPath).catch((err) => logger.error("Failed to record project access", err instanceof Error ? err : { error: err }));
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
            const [pending, working, completed, completedAll, masterWaiting, masterReview, skillCandidates, improvements, v2Data, teamStatus] = await Promise.all([
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
                generateDashboardData(projectPath, { statusFilter: "all", showArchived: true, limit: 500 }), // V2.1 ダッシュボードデータ（クライアントサイドでフィルタリング）
                executeGetTeamStatus({ queueMaidPath: getQueueMaidPath(projectPath) }), // チーム状態
            ]);
            const completedTodayCount = completedAll.tasks.filter((task) => {
                if (!task.completedAt)
                    return false;
                const completedDate = new Date(task.completedAt);
                return completedDate >= today;
            }).length;
            // 待機中から特殊カテゴリとactionRequiredを除外
            const specialCategories = ["skill_candidate", "improvement"];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Task | TaskSummary のユニオン型対応
            const filteredPendingTasks = pending.tasks.filter((t) => {
                return (!t.category || !specialCategories.includes(t.category)) && !t.actionRequired;
            });
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
                    goals: generateTaskTreeHtml ? generateTaskTreeHtml(v2Data.v2Goals, projectPath) : undefined,
                    reviewQueue: generateReviewQueueHtml ? generateReviewQueueHtml(v2Data.v2ReviewQueue, projectPath) : undefined,
                    artifacts: generateArtifactsHtml ? generateArtifactsHtml(v2Data.v2Artifacts, projectPath) : undefined,
                    stats: generateStatsHtml ? generateStatsHtml(v2Data.v2Stats) : undefined,
                },
                // チーム状態HTML
                teamStatusHtml: generateTeamStatusHtml ? generateTeamStatusHtml(teamStatus.agents) : undefined,
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
                        generateDashboardData(projectPath, { statusFilter: "all", showArchived: true, limit: 500 }), // V2.1 ダッシュボードデータ（クライアントサイドでフィルタリング）
                    ]);
                    const completedTodayCount = completedAll.tasks.filter((task) => {
                        if (!task.completedAt)
                            return false;
                        const completedDate = new Date(task.completedAt);
                        return completedDate >= today;
                    }).length;
                    // 待機中から特殊カテゴリとactionRequiredを除外
                    const sseSpecialCategories = ["skill_candidate", "improvement"];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Task | TaskSummary のユニオン型対応
                    const sseFilteredPending = pending.tasks.filter((t) => {
                        return (!t.category || !sseSpecialCategories.includes(t.category)) && !t.actionRequired;
                    });
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
                        goals: generateTaskTreeHtml ? generateTaskTreeHtml(v2Data.v2Goals, projectPath) : undefined,
                        reviewQueue: generateReviewQueueHtml ? generateReviewQueueHtml(v2Data.v2ReviewQueue, projectPath) : undefined,
                        artifacts: generateArtifactsHtml ? generateArtifactsHtml(v2Data.v2Artifacts, projectPath) : undefined,
                        stats: generateStatsHtml ? generateStatsHtml(v2Data.v2Stats) : undefined,
                    };
                    res.write(`data: ${JSON.stringify({ type: "tasks", tasks: tasksHtml, v2: v2Data, v2Html })}\n\n`);
                }
                catch (e) {
                    logger.error("SSE update error", e instanceof Error ? e : { error: e });
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
    // GET /dashboard/goals - Goals ページネーション用エンドポイント
    router.get("/dashboard/goals", async (req, res) => {
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
            // 検索・絞り込みパラメータ
            const search = req.query.search;
            const priorityParam = req.query.priority;
            const priority = priorityParam === "high" || priorityParam === "medium" || priorityParam === "low"
                ? priorityParam
                : undefined;
            const assignee = req.query.assignee;
            // V2.1 ダッシュボードデータを取得（ページネーション・ソート・フィルタ適用）
            const v2Data = await generateDashboardData(projectPath, {
                offset,
                limit,
                statusFilter,
                showArchived,
                sortField,
                sortOrder,
                search,
                priority,
                assignee,
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
    // PATCH /dashboard/tasks/:id/archive - アーカイブトグル（LAN公開）
    router.patch("/dashboard/tasks/:id/archive", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            const txId = req.get("X-Transaction-Id");
            const { archived } = req.body;
            const result = await executeUpdateTask(projectPath, {
                taskId: req.params.id,
                archived: archived !== undefined ? archived : true,
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
                    field: "archived",
                    value: result.task?.archived,
                    txId,
                });
            }
            res.json({ success: true, archived: result.task?.archived, archivedAt: result.task?.archivedAt });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Archive toggle failed", details: message });
        }
    });
    // PATCH /dashboard/tasks/:id/close - Goal完了（LAN公開）
    router.patch("/dashboard/tasks/:id/close", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            const txId = req.get("X-Transaction-Id");
            const result = await executeUpdateTask(projectPath, {
                taskId: req.params.id,
                mainStatus: "closed",
                v2Substatus: "completed",
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
                    field: "status",
                    value: "completed",
                    txId,
                });
            }
            res.json({ success: true, mainStatus: result.task?.mainStatus, v2Substatus: result.task?.v2Substatus });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Close goal failed", details: message });
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
            // エージェント背景イラスト（最初のレポートからエージェントIDを抽出）
            let agentBgCss = "";
            let agentBgHtml = "";
            const firstReport = result.reports.find(r => r.path && !r.error);
            if (firstReport) {
                const agentId = extractAgentIdFromPath(firstReport.path);
                if (agentId) {
                    const imageUrl = `/agent-image?agent=${encodeURIComponent(agentId)}&project=${encodeURIComponent(projectPath)}`;
                    const snippet = generateAgentBackgroundSnippet(imageUrl);
                    agentBgCss = snippet.css;
                    agentBgHtml = snippet.bodyHtml;
                }
            }
            // /file エンドポイントと同じスタイルを使用
            const pageHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>報告書 - ${escapeHtml(taskId)}</title>
  <style>
    :root {
      --bg-start: #1a1a2e;
      --bg-end: #16213e;
      --text-color: #eee;
      --h1-color: #e94560;
      --h2-color: #ffc107;
      --h3-color: #81c784;
      --link-color: #4ec9b0;
      --code-bg: #0a0a0a;
      --border-color: #444;
      --accent-color: #e94560;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Hiragino Sans", -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, var(--bg-start) 0%, var(--bg-end) 100%);
      color: var(--text-color);
      line-height: 1.6;
      padding: 16px 40px;
      max-width: 900px;
      margin: 0 auto;
      min-height: 100vh;
      font-size: 13px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      margin-bottom: 16px;
      border-bottom: 2px solid var(--accent-color);
    }
    .page-title { font-size: 1.2rem; color: var(--accent-color); }
    .back-link { color: var(--link-color); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .report-content { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .report-path { font-size: 0.9em; color: #808080; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); }
    .report-body { line-height: 1.6; }
    h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em; }
    h1 { font-size: 1.4em; color: var(--h1-color); border-bottom: 2px solid var(--h1-color); padding-bottom: 6px; }
    h2 { font-size: 1.15em; color: var(--h2-color); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
    h3 { font-size: 1.05em; color: var(--h3-color); }
    h4, h5, h6 { color: var(--h3-color); }
    a { color: var(--link-color); }
    code {
      background: rgba(255,255,255,0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: "Consolas", "Monaco", monospace;
      font-size: 0.9em;
    }
    pre {
      background: var(--code-bg);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid var(--border-color); padding: 6px 10px; text-align: left; }
    th { background: rgba(255,255,255,0.1); color: var(--h2-color); }
    ul { padding-left: 25px; }
    li { margin: 4px 0; }
    .checkbox { padding: 4px 0; }
    .checkbox.checked { color: var(--h3-color); }
    hr { border: none; border-top: 1px solid var(--border-color); margin: 16px 0; }
    p { margin: 8px 0; }
    strong { color: var(--h2-color); }
    em { font-style: italic; color: #aaa; }
    .path-link { color: var(--link-color); text-decoration: none; border-bottom: 1px dotted var(--link-color); cursor: pointer; }
    .path-link:hover { text-decoration: underline; background: rgba(86, 156, 214, 0.1); }
    .report-error { background: rgba(255,0,0,0.1); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .error { color: #ff6b6b; }
    ${agentBgCss}
  </style>
</head>
<body>
  <div class="page-header">
    <div class="page-title">📄 報告書 - ${escapeHtml(taskId)}</div>
    <a href="/dashboard?project=${encodeURIComponent(projectPath)}" class="back-link">← ダッシュボードに戻る</a>
  </div>
  ${reportsHtml}
  ${agentBgHtml}
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
