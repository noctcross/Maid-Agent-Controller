/**
 * CLI API Routes テスト
 * 対象:
 * - POST /api/tasks - タスク作成
 * - POST /api/tasks/:id/assign - タスク割り当て
 * - GET /api/agents/:id/task - 自分のタスク取得
 * - PATCH /api/agents/:id/status - ステータス更新
 * - GET /api/team/status - チーム状況
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { TEST_PROJECT_PATH, createMockTask } from "../helpers/e2e-setup.js";
// --- モック定義 ---
const mockExecuteCreateTask = jest.fn();
const mockExecuteAssignTask = jest.fn();
const mockExecuteGetMyTask = jest.fn();
const mockExecuteUpdateStatus = jest.fn();
const mockExecuteGetTeamStatus = jest.fn();
jest.unstable_mockModule("../../services/index.js", () => ({
    executeCreateTask: mockExecuteCreateTask,
    executeAssignTask: mockExecuteAssignTask,
    executeGetMyTask: mockExecuteGetMyTask,
    executeUpdateStatus: mockExecuteUpdateStatus,
    executeGetTeamStatus: mockExecuteGetTeamStatus,
}));
jest.unstable_mockModule("../../middleware/project-path.js", () => ({
    getProjectPathFromRequest: () => TEST_PROJECT_PATH,
}));
// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const cliApiRoutes = (await import("../../routes/cli-api-routes.js")).default;
// --- テスト用app構築 ---
const app = express();
app.use(express.json());
app.use(cliApiRoutes);
beforeEach(() => {
    jest.clearAllMocks();
});
// ===========================================
// POST /api/tasks - タスク作成
// ===========================================
describe("POST /api/tasks", () => {
    it("タスクを作成する", async () => {
        const newTask = createMockTask({ id: "100", title: "New task" });
        mockExecuteCreateTask.mockResolvedValue({ taskId: "100", task: newTask });
        const res = await supertest(app)
            .post("/api/tasks")
            .send({ title: "New task" })
            .expect(201)
            .expect("Content-Type", /json/);
        expect(res.body.success).toBe(true);
        expect(res.body.taskId).toBe("100");
        expect(res.body.task.title).toBe("New task");
    });
    it("title未指定で400を返す", async () => {
        const res = await supertest(app)
            .post("/api/tasks")
            .send({})
            .expect(400);
        expect(res.body.error).toBe("title is required");
    });
    it("オプションパラメータを正しく渡す", async () => {
        mockExecuteCreateTask.mockResolvedValue({ taskId: "101", task: createMockTask() });
        await supertest(app)
            .post("/api/tasks")
            .send({
            title: "Test",
            description: "Desc",
            priority: "high",
            parentId: "050",
            category: "action_required",
        })
            .expect(201);
        expect(mockExecuteCreateTask).toHaveBeenCalledWith(TEST_PROJECT_PATH, expect.objectContaining({
            title: "Test",
            description: "Desc",
            priority: "high",
            parentId: "050",
            category: "action_required",
        }));
    });
    it("サービスエラー時に500を返す", async () => {
        mockExecuteCreateTask.mockRejectedValue(new Error("DB error"));
        const res = await supertest(app)
            .post("/api/tasks")
            .send({ title: "Test" })
            .expect(500);
        expect(res.body.error).toBe("Task creation failed");
    });
});
// ===========================================
// POST /api/tasks/:id/assign - タスク割り当て
// ===========================================
describe("POST /api/tasks/:id/assign", () => {
    it("タスクを割り当てる", async () => {
        mockExecuteAssignTask.mockResolvedValue({
            success: true,
            task_id: "100",
            assigned_to: "emma",
        });
        const res = await supertest(app)
            .post("/api/tasks/100/assign")
            .send({ targetAgent: "emma", title: "Work on task" })
            .expect(200);
        expect(res.body.success).toBe(true);
        expect(res.body.assignedTask.assigned_to).toBe("emma");
    });
    it("targetAgent未指定で400を返す", async () => {
        const res = await supertest(app)
            .post("/api/tasks/100/assign")
            .send({})
            .expect(400);
        expect(res.body.error).toBe("targetAgent is required");
    });
    it("無効なtargetAgentで400を返す", async () => {
        const res = await supertest(app)
            .post("/api/tasks/100/assign")
            .send({ targetAgent: "invalid_agent" })
            .expect(400);
        expect(res.body.error).toBe("Invalid targetAgent");
        expect(res.body.validAgents).toBeDefined();
    });
    it("割り当て失敗時に400を返す", async () => {
        mockExecuteAssignTask.mockResolvedValue({
            success: false,
            error: "emma は現在作業中です",
        });
        const res = await supertest(app)
            .post("/api/tasks/100/assign")
            .send({ targetAgent: "emma" })
            .expect(400);
        expect(res.body.error).toContain("作業中");
    });
});
// ===========================================
// GET /api/agents/:id/task - 自分のタスク取得
// ===========================================
describe("GET /api/agents/:id/task", () => {
    it("自分のタスクを返す", async () => {
        mockExecuteGetMyTask.mockResolvedValue({
            task_id: "task-100",
            description: "Do something",
            status: "working",
            assigned_at: "2026-02-09T00:00:00+09:00",
        });
        const res = await supertest(app)
            .get("/api/agents/emma/task")
            .expect(200);
        expect(res.body.task_id).toBe("task-100");
        expect(res.body.status).toBe("working");
    });
    it("無効なagentIdで400を返す", async () => {
        const res = await supertest(app)
            .get("/api/agents/invalid/task")
            .expect(400);
        expect(res.body.error).toBe("Invalid agentId");
    });
    it("summaryパラメータを正しく渡す", async () => {
        mockExecuteGetMyTask.mockResolvedValue({
            task_id: "task-100",
            status: "idle",
        });
        await supertest(app)
            .get("/api/agents/emma/task?summary=true")
            .expect(200);
        expect(mockExecuteGetMyTask).toHaveBeenCalledWith(expect.objectContaining({ summaryOnly: true }));
    });
});
// ===========================================
// PATCH /api/agents/:id/status - ステータス更新
// ===========================================
describe("PATCH /api/agents/:id/status", () => {
    it("ステータスを更新する", async () => {
        mockExecuteUpdateStatus.mockResolvedValue({
            success: true,
            updated_fields: ["status"],
            timestamp: "2026-02-09T00:00:00+09:00",
        });
        const res = await supertest(app)
            .patch("/api/agents/emma/status")
            .send({ status: "working" })
            .expect(200);
        expect(res.body.success).toBe(true);
        expect(res.body.updated_fields).toContain("status");
    });
    it("completedステータスでsummaryを渡す", async () => {
        mockExecuteUpdateStatus.mockResolvedValue({
            success: true,
            updated_fields: ["status", "completed_at", "completion_summary"],
            timestamp: "2026-02-09T00:00:00+09:00",
        });
        await supertest(app)
            .patch("/api/agents/emma/status")
            .send({ status: "completed", summary: "Task done" })
            .expect(200);
        expect(mockExecuteUpdateStatus).toHaveBeenCalledWith(expect.objectContaining({
            status: "completed",
            summary: "Task done",
        }));
    });
    it("無効なagentIdで400を返す", async () => {
        const res = await supertest(app)
            .patch("/api/agents/invalid/status")
            .send({ status: "working" })
            .expect(400);
        expect(res.body.error).toBe("Invalid agentId");
    });
    it("無効なstatusで400を返す", async () => {
        const res = await supertest(app)
            .patch("/api/agents/emma/status")
            .send({ status: "invalid_status" })
            .expect(400);
        expect(res.body.error).toBe("Invalid status");
        // V2.1: checkpoint, waiting を追加
        expect(res.body.validStatuses).toEqual(["working", "completed", "blocked", "checkpoint", "waiting"]);
    });
    it("status未指定で400を返す", async () => {
        const res = await supertest(app)
            .patch("/api/agents/emma/status")
            .send({})
            .expect(400);
        expect(res.body.error).toBe("Invalid status");
    });
});
// ===========================================
// GET /api/team/status - チーム状況
// ===========================================
describe("GET /api/team/status", () => {
    it("チーム状況を返す", async () => {
        mockExecuteGetTeamStatus.mockResolvedValue({
            timestamp: "2026-02-09T00:00:00+09:00",
            summary: { idle: 5, working: 3 },
            agents: [
                { id: "emma", status: "working", task_id: "task-100" },
                { id: "sophia", status: "idle", task_id: null },
            ],
        });
        const res = await supertest(app)
            .get("/api/team/status")
            .expect(200);
        expect(res.body.agents).toHaveLength(2);
        expect(res.body.summary.working).toBe(3);
    });
    it("statusフィルタを正しく渡す", async () => {
        mockExecuteGetTeamStatus.mockResolvedValue({
            timestamp: "2026-02-09T00:00:00+09:00",
            summary: {},
            agents: [],
        });
        await supertest(app)
            .get("/api/team/status?status=working,blocked")
            .expect(200);
        expect(mockExecuteGetTeamStatus).toHaveBeenCalledWith(expect.objectContaining({
            filter: expect.objectContaining({ status: ["working", "blocked"] }),
        }));
    });
    it("agentIdフィルタを正しく渡す", async () => {
        mockExecuteGetTeamStatus.mockResolvedValue({
            timestamp: "2026-02-09T00:00:00+09:00",
            summary: {},
            agents: [],
        });
        await supertest(app)
            .get("/api/team/status?agentId=emma")
            .expect(200);
        expect(mockExecuteGetTeamStatus).toHaveBeenCalledWith(expect.objectContaining({
            filter: expect.objectContaining({ agentId: "emma" }),
        }));
    });
    it("summaryパラメータを正しく渡す", async () => {
        mockExecuteGetTeamStatus.mockResolvedValue({
            timestamp: "2026-02-09T00:00:00+09:00",
            summary: {},
            agents: [],
        });
        await supertest(app)
            .get("/api/team/status?summary=true")
            .expect(200);
        expect(mockExecuteGetTeamStatus).toHaveBeenCalledWith(expect.objectContaining({
            filter: expect.objectContaining({ summaryOnly: true }),
        }));
    });
    it("includeCompletedを数値としてパースする", async () => {
        mockExecuteGetTeamStatus.mockResolvedValue({
            timestamp: "2026-02-09T00:00:00+09:00",
            summary: {},
            agents: [],
            recentCompleted: [],
        });
        await supertest(app)
            .get("/api/team/status?includeCompleted=5")
            .expect(200);
        expect(mockExecuteGetTeamStatus).toHaveBeenCalledWith(expect.objectContaining({
            filter: expect.objectContaining({ includeCompleted: 5 }),
        }));
    });
    it("サービスエラー時に500を返す", async () => {
        mockExecuteGetTeamStatus.mockRejectedValue(new Error("Service error"));
        const res = await supertest(app)
            .get("/api/team/status")
            .expect(500);
        expect(res.body.error).toBe("Team status retrieval failed");
    });
});
