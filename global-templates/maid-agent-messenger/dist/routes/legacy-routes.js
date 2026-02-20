/**
 * レガシー REST API エンドポイント（後方互換性）
 * POST /tools/get_my_task, /tools/update_status, /tools/assign_task, /tools/get_team_status
 */
import { Router } from "express";
import { z } from "zod";
import { MAID_IDS, UPDATABLE_STATUSES, } from "../types/index.js";
import { executeGetMyTask, executeUpdateStatus, executeAssignTask, executeGetTeamStatus, } from "../services/index.js";
import { getQueueMaidPath, getCurrentReportsPath, getArchiveReportsPath, } from "../utils/path-helpers.js";
import { getProjectPathFromRequest } from "../middleware/project-path.js";
// Zodスキーマ
const GetMyTaskSchema = z.object({
    agent_id: z.enum(MAID_IDS),
});
const UpdateStatusSchema = z.object({
    agent_id: z.enum(MAID_IDS),
    status: z.enum(UPDATABLE_STATUSES),
    summary: z.string().max(100).optional(),
});
const AssignTaskSchema = z.object({
    task_id: z.string(),
    target_agent: z.enum(MAID_IDS),
    title: z.string().max(100),
    description: z.string().max(2000).optional(),
    target_path: z.string().optional(),
});
const router = Router();
// get_my_task (REST)
router.post("/tools/get_my_task", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { agent_id } = GetMyTaskSchema.parse(req.body);
        const result = await executeGetMyTask({
            queueMaidPath: getQueueMaidPath(projectPath),
            agentId: agent_id,
        });
        res.json({ ...result, project_path: projectPath });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid input", details: error.errors });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task retrieval failed", details: message });
    }
});
// update_status (REST)
router.post("/tools/update_status", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { agent_id, status, summary } = UpdateStatusSchema.parse(req.body);
        const result = await executeUpdateStatus({
            queueMaidPath: getQueueMaidPath(projectPath),
            currentReportsPath: getCurrentReportsPath(projectPath),
            archiveReportsPath: getArchiveReportsPath(projectPath),
            agentId: agent_id,
            status,
            summary,
        });
        res.json(result);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid input", details: error.errors });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ success: false, error: "Status update failed", details: message });
    }
});
// assign_task (REST)
router.post("/tools/assign_task", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { task_id, target_agent, title, description, target_path } = AssignTaskSchema.parse(req.body);
        const result = await executeAssignTask({
            queueMaidPath: getQueueMaidPath(projectPath),
            currentReportsPath: getCurrentReportsPath(projectPath),
            templatePath: getCurrentReportsPath(projectPath),
            taskId: task_id,
            targetAgent: target_agent,
            title,
            description,
            targetPath: target_path,
        });
        if (!result.success) {
            res.status(409).json(result);
            return;
        }
        res.json(result);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid input", details: error.errors });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ success: false, error: "Task assignment failed", details: message });
    }
});
// get_team_status (REST) - Phase 3: フィルタ対応
router.post("/tools/get_team_status", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        // オプショナルなフィルタパラメータ
        const { status, agentId, includeCompleted } = req.body;
        const result = await executeGetTeamStatus({
            queueMaidPath: getQueueMaidPath(projectPath),
            filter: {
                status,
                agentId,
                includeCompleted,
            },
        });
        res.json({ ...result, project_path: projectPath });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Team status retrieval failed", details: message });
    }
});
export default router;
