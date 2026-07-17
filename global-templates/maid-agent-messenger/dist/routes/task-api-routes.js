/**
 * Task API エンドポイント
 * GET/PATCH /api/tasks/*, GET /api/dashboard
 */
import { Router } from "express";
import { executeListTasks, executeGetTask, executeUpdateTask, executeGetReport, archiveReport, executeGetTeamStatus, generateDashboardData, 
// V2.1 マイグレーション
migrate, checkMigrationStatus, } from "../services/index.js";
import { getQueueMaidPath } from "../utils/path-helpers.js";
import { getJstTimestamp } from "../utils/yaml-helper.js";
import { getProjectPathFromRequest } from "../middleware/project-path.js";
import { convertMarkdownToHtml, linkifyProjectPaths } from "../markdown-utils.js";
import { extractAgentIdFromPath } from "../utils/agent-image.js";
import { VALIDATION } from "../utils/constants.js";
export function createTaskApiRoutes(deps = {}) {
    const { wsServer } = deps;
    const router = Router();
    // GET /api/tasks - タスク一覧
    router.get("/api/tasks", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            // クエリパラメータからフィルタ条件を構築
            const filter = {};
            if (req.query.status) {
                filter.status = req.query.status.split(",");
            }
            if (req.query.assignee) {
                filter.assignee = req.query.assignee;
            }
            if (req.query.parentId !== undefined) {
                filter.parentId = req.query.parentId === "null" ? null : req.query.parentId;
            }
            if (req.query.limit) {
                const limit = parseInt(req.query.limit, 10);
                if (!Number.isNaN(limit)) {
                    filter.limit = limit;
                }
            }
            if (req.query.offset) {
                const offset = parseInt(req.query.offset, 10);
                filter.offset = Number.isNaN(offset) ? 0 : offset;
            }
            if (req.query.sortField) {
                filter.sortField = req.query.sortField;
            }
            if (req.query.sortOrder) {
                filter.sortOrder = req.query.sortOrder;
            }
            if (req.query.summary === "true") {
                filter.summaryOnly = true;
            }
            if (req.query.actionRequired !== undefined) {
                filter.actionRequired = req.query.actionRequired === "true";
            }
            const result = await executeListTasks(projectPath, filter);
            res.json(result);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Task list retrieval failed", details: message });
        }
    });
    // GET /api/tasks/:id - タスク詳細
    router.get("/api/tasks/:id", async (req, res) => {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Task retrieval failed", details: message });
        }
    });
    // PATCH /api/tasks/:id - タスク更新 (V2.1拡張)
    router.patch("/api/tasks/:id", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            const txId = req.get("X-Transaction-Id");
            const { 
            // 既存フィールド
            status, substatus, summary, reportPath, title, description, priority, 
            // V2.1 拡張フィールド
            mainStatus, subStatus, type, size, tentative, blockedBy, artifacts, artifactAdd, reviewStatus, 
            // V2.1 追加フィールド
            archived, actionRequired, 
            // C-1: Type B（通過型チェックポイント）記録
            checkpointPassAdd, } = req.body;
            if (description && typeof description === "string" && description.length > VALIDATION.MAX_DESCRIPTION_LENGTH) {
                res.status(400).json({
                    error: `description が上限文字数（${VALIDATION.MAX_DESCRIPTION_LENGTH}文字）を超えています`,
                    length: description.length,
                });
                return;
            }
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
                subStatus,
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
                // C-1: Type B（通過型チェックポイント）記録
                checkpointPassAdd,
            });
            if (!result.success) {
                const errorMessage = result.error || "Task not found";
                const statusCode = result.error ? 400 : 404;
                res.status(statusCode).json({ error: errorMessage, taskId: req.params.id });
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Task update failed", details: message });
        }
    });
    // GET /api/tasks/:id/report - レポート内容取得
    router.get("/api/tasks/:id/report", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            const parsedLimit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
            const limit = parsedLimit !== undefined && !Number.isNaN(parsedLimit) ? parsedLimit : undefined;
            const result = await executeGetReport(projectPath, {
                taskId: req.params.id,
                limit,
            });
            if (!result.success) {
                res.status(404).json({ error: result.message, taskId: req.params.id });
                return;
            }
            // レポートにhtmlContentとagentIdを追加
            const reportsWithHtml = result.reports.map((report) => {
                if (report.error || !report.content) {
                    return report;
                }
                // Markdown → HTML変換、パスリンク化
                const rawHtml = convertMarkdownToHtml(report.content);
                const htmlContent = linkifyProjectPaths(rawHtml, projectPath);
                // エージェントID抽出
                const agentId = report.path ? extractAgentIdFromPath(report.path) : null;
                return { ...report, htmlContent, agentId };
            });
            // 最初のレポートのagentIdを全体に含める
            const firstReport = reportsWithHtml.find(r => "agentId" in r && r.agentId);
            const agentId = (firstReport && "agentId" in firstReport) ? firstReport.agentId : null;
            res.json({ ...result, reports: reportsWithHtml, agentId });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Report retrieval failed", details: message });
        }
    });
    // 旧 GET /api/dashboard（pending/working/completed形式）は削除
    // モバイル向けの新形式は下部の Dashboard API セクションで定義
    // POST /api/tasks/:id/rearchive - 報告書を再アーカイブ
    router.post("/api/tasks/:id/rearchive", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            const { agentId, content } = req.body;
            // タスク情報を取得（summaryOnly: false で完全なTask型を取得）
            const taskResult = await executeGetTask(projectPath, { taskId: req.params.id, summaryOnly: false });
            if (!taskResult.task) {
                res.status(404).json({ error: "Task not found", taskId: req.params.id });
                return;
            }
            const task = taskResult.task;
            const results = [];
            // 対象エージェントを特定
            const targetAgentIds = agentId
                ? [agentId]
                : task.assignees.map((a) => a.agentId);
            for (const agent of targetAgentIds) {
                const result = await archiveReport(projectPath, task, agent, true, // skipTimestampCheck: タイムスタンプ無視で再アーカイブ
                content // 直接指定する内容（オプション）
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Rearchive failed", details: message });
        }
    });
    // =============================================================================
    // V2.1 マイグレーション API
    // =============================================================================
    // GET /api/v2/migration/status - マイグレーション状況確認
    router.get("/api/v2/migration/status", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            const status = await checkMigrationStatus(projectPath);
            res.json(status);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Migration status check failed", details: message });
        }
    });
    // POST /api/v2/migration/run - マイグレーション実行
    router.post("/api/v2/migration/run", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            const { dryRun } = req.body;
            const result = await migrate(projectPath, { dryRun: dryRun === true });
            res.json({
                success: true,
                dryRun: dryRun === true,
                ...result,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "Migration failed", details: message });
        }
    });
    // =============================================================================
    // Dashboard API（モバイル向け）
    // =============================================================================
    // GET /api/dashboard - ダッシュボードJSON（モバイル向け）
    router.get("/api/dashboard", async (req, res) => {
        try {
            const projectPath = getProjectPathFromRequest(req);
            // クエリパラメータを取得
            const statusParam = req.query.statusFilter;
            const statusFilter = statusParam === "closed" ? "closed" :
                statusParam === "open" ? "open" : "all";
            const showArchived = req.query.showArchived === "true";
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const sortFieldParam = req.query.sortField;
            const sortField = sortFieldParam === "updatedAt" ? "updatedAt" : "id";
            const sortOrderParam = req.query.sortOrder;
            const sortOrder = sortOrderParam === "asc" ? "asc" : "desc";
            const search = req.query.search;
            const priorityParam = req.query.priority;
            const priority = priorityParam === "high" || priorityParam === "medium" || priorityParam === "low"
                ? priorityParam
                : undefined;
            const assignee = req.query.assignee;
            const includeTeamStatus = req.query.includeTeamStatus === "true";
            // V2ダッシュボードデータを取得（並列実行）
            const [v2Data, skillCandidatesResult, improvementsResult] = await Promise.all([
                generateDashboardData(projectPath, {
                    statusFilter,
                    showArchived,
                    limit,
                    offset,
                    sortField,
                    sortOrder,
                    search,
                    priority,
                    assignee,
                }),
                // スキル化候補・改善提案を別途取得（Webダッシュボードと同様）
                executeListTasks(projectPath, { category: ["skill_candidate"], status: ["pending", "assigned", "working", "blocked"] }),
                executeListTasks(projectPath, { category: ["improvement"], status: ["pending", "assigned", "working", "blocked"] }),
            ]);
            // チーム状態を取得（オプション）
            let teamStatus;
            if (includeTeamStatus) {
                const teamResult = await executeGetTeamStatus({ queueMaidPath: getQueueMaidPath(projectPath) });
                teamStatus = teamResult.agents;
            }
            res.json({
                // V2構造化データ
                goals: v2Data.v2Goals,
                reviewQueue: v2Data.v2ReviewQueue,
                artifacts: v2Data.v2Artifacts,
                stats: v2Data.v2Stats,
                // スキル化候補・改善提案（別セクション用）
                // String() 変換: tasks.yaml の id が整数型で記載されても MobileSylvia が落ちないよう恒久対策 (#524-3)
                skillCandidates: skillCandidatesResult.tasks.map((t) => ({
                    id: String(t.id),
                    title: t.title,
                    description: "description" in t ? t.description : undefined,
                })),
                improvements: improvementsResult.tasks.map((t) => ({
                    id: String(t.id),
                    title: t.title,
                    description: "description" in t ? t.description : undefined,
                })),
                // ページネーション情報
                totalGoals: v2Data.totalGoals,
                offset,
                limit,
                hasMore: offset + v2Data.v2Goals.length < v2Data.totalGoals,
                // チーム状態（オプション）
                ...(teamStatus && { teamStatus }),
                // メタデータ
                timestamp: getJstTimestamp(),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "V2 Dashboard retrieval failed", details: message });
        }
    });
    return router;
}
// 後方互換性のためデフォルトエクスポートを維持
export default createTaskApiRoutes();
