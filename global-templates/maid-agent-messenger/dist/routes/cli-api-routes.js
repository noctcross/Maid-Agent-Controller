/**
 * CLI API エンドポイント
 * maidctl CLIツールから呼び出されるREST API
 *
 * エンドポイント:
 * - POST /api/tasks - タスク作成
 * - POST /api/tasks/:id/assign - タスク割り当て
 * - GET /api/agents/:id/task - 自分のタスク取得
 * - PATCH /api/agents/:id/status - ステータス更新
 * - GET /api/team/status - チーム状況
 */
import path from "path";
import { Router } from "express";
import { executeCreateTask, executeAssignTask, executeGetMyTask, executeUpdateStatus, executeGetTeamStatus, } from "../services/index.js";
import { getProjectPathFromRequest } from "../middleware/session-manager.js";
import { MAID_IDS } from "../types/index.js";
const router = Router();
// =============================================================================
// 内部パス定数
// =============================================================================
const PATHS = {
    MAID_STATUS: ".maid-agent/system/data/maid",
    CURRENT_REPORTS: ".maid-agent/system/data/reports",
    ARCHIVE_REPORTS: ".maid-agent/master/reports",
};
/**
 * projectPath から内部パスを構築
 */
function buildInternalPaths(projectPath) {
    return {
        queueMaidPath: path.join(projectPath, PATHS.MAID_STATUS),
        currentReportsPath: path.join(projectPath, PATHS.CURRENT_REPORTS),
        archiveReportsPath: path.join(projectPath, PATHS.ARCHIVE_REPORTS),
    };
}
// =============================================================================
// POST /api/tasks - タスク作成
// =============================================================================
router.post("/api/tasks", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { title, description, priority, parentId, category } = req.body;
        // バリデーション
        if (!title || typeof title !== "string") {
            res.status(400).json({ error: "title is required" });
            return;
        }
        const result = await executeCreateTask(projectPath, {
            title,
            description,
            priority: priority || "medium",
            parentId: parentId || undefined,
            category: category || "task",
        });
        res.status(201).json({
            success: true,
            task: result.task,
            taskId: result.taskId,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task creation failed", details: message });
    }
});
// =============================================================================
// POST /api/tasks/:id/assign - タスク割り当て
// =============================================================================
router.post("/api/tasks/:id/assign", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const taskId = req.params.id;
        const { targetAgent, title, description, targetPath } = req.body;
        // バリデーション
        if (!targetAgent || typeof targetAgent !== "string") {
            res.status(400).json({ error: "targetAgent is required" });
            return;
        }
        if (!MAID_IDS.includes(targetAgent)) {
            res.status(400).json({
                error: "Invalid targetAgent",
                validAgents: MAID_IDS,
            });
            return;
        }
        const paths = buildInternalPaths(projectPath);
        const result = await executeAssignTask({
            queueMaidPath: paths.queueMaidPath,
            currentReportsPath: paths.currentReportsPath,
            templatePath: paths.currentReportsPath,
            taskId,
            targetAgent,
            title: title || "",
            description: description || undefined,
            targetPath: targetPath || undefined,
        });
        if (!result.success) {
            res.status(400).json({
                error: result.error || "Assignment failed",
                taskId,
                targetAgent,
            });
            return;
        }
        res.json({
            success: true,
            assignedTask: {
                task_id: result.task_id,
                assigned_to: result.assigned_to,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task assignment failed", details: message });
    }
});
// =============================================================================
// GET /api/agents/:id/task - 自分のタスク取得
// =============================================================================
router.get("/api/agents/:id/task", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const agentId = req.params.id;
        // バリデーション
        if (!MAID_IDS.includes(agentId)) {
            res.status(400).json({
                error: "Invalid agentId",
                validAgents: MAID_IDS,
            });
            return;
        }
        const paths = buildInternalPaths(projectPath);
        const result = await executeGetMyTask({
            queueMaidPath: paths.queueMaidPath,
            agentId,
        });
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task retrieval failed", details: message });
    }
});
// =============================================================================
// PATCH /api/agents/:id/status - ステータス更新
// =============================================================================
router.patch("/api/agents/:id/status", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const agentId = req.params.id;
        const { status, summary, escalation } = req.body;
        // バリデーション: agentId
        if (!MAID_IDS.includes(agentId)) {
            res.status(400).json({
                error: "Invalid agentId",
                validAgents: MAID_IDS,
            });
            return;
        }
        // バリデーション: status
        const validStatuses = ["working", "completed", "blocked"];
        if (!status || !validStatuses.includes(status)) {
            res.status(400).json({
                error: "Invalid status",
                validStatuses,
            });
            return;
        }
        const paths = buildInternalPaths(projectPath);
        const result = await executeUpdateStatus({
            queueMaidPath: paths.queueMaidPath,
            currentReportsPath: paths.currentReportsPath,
            archiveReportsPath: paths.archiveReportsPath,
            agentId,
            status: status,
            summary: summary || undefined,
            escalation: escalation || false,
        });
        res.json({
            success: result.success,
            updated_fields: result.updated_fields,
            timestamp: result.timestamp,
            ...(result.archive_path && { archive_path: result.archive_path }),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Status update failed", details: message });
    }
});
// =============================================================================
// GET /api/team/status - チーム状況
// =============================================================================
router.get("/api/team/status", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const paths = buildInternalPaths(projectPath);
        // クエリパラメータからフィルタを構築
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status.split(",");
        }
        if (req.query.agentId) {
            filter.agentId = req.query.agentId;
        }
        if (req.query.includeCompleted) {
            filter.includeCompleted = parseInt(req.query.includeCompleted, 10);
        }
        const result = await executeGetTeamStatus({
            queueMaidPath: paths.queueMaidPath,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
        });
        res.json({
            timestamp: result.timestamp,
            summary: result.summary,
            agents: result.agents,
            ...(result.recentCompleted && { recentCompleted: result.recentCompleted }),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Team status retrieval failed", details: message });
    }
});
export default router;
