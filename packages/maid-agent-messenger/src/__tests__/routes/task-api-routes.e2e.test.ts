/**
 * Task API Routes E2E テスト
 * 対象: GET/PATCH /api/tasks/*, GET /api/dashboard
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { TEST_PROJECT_PATH, createMockTask, createMockListResponse } from "../helpers/e2e-setup.js";

// --- モック定義 ---
const mockExecuteListTasks = jest.fn<any>();
const mockExecuteGetTask = jest.fn<any>();
const mockExecuteUpdateTask = jest.fn<any>();
const mockExecuteGetReport = jest.fn<any>();
const mockArchiveReport = jest.fn<any>();
const mockMigrate = jest.fn<any>();
const mockCheckMigrationStatus = jest.fn<any>();
const mockExecuteGetTeamStatus = jest.fn<any>();
const mockGenerateDashboardData = jest.fn<any>();

jest.unstable_mockModule("../../services/index.js", () => ({
  executeListTasks: mockExecuteListTasks,
  executeGetTask: mockExecuteGetTask,
  executeUpdateTask: mockExecuteUpdateTask,
  executeGetReport: mockExecuteGetReport,
  archiveReport: mockArchiveReport,
  migrate: mockMigrate,
  checkMigrationStatus: mockCheckMigrationStatus,
  executeGetTeamStatus: mockExecuteGetTeamStatus,
  generateDashboardData: mockGenerateDashboardData,
}));

jest.unstable_mockModule("../../middleware/project-path.js", () => ({
  getProjectPathFromRequest: () => TEST_PROJECT_PATH,
}));

jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  getTimestamp: () => "2026-02-09T00:00:00+09:00",
  getJstTimestamp: () => "2026-02-09 00:00:00",
  stringifyYaml: (data: unknown) => JSON.stringify(data),
}));

// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const taskApiRoutes = (await import("../../routes/task-api-routes.js")).default;

// --- テスト用app構築 ---
const app = express();
app.use(express.json());
app.use(taskApiRoutes);

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================
// GET /api/tasks
// ===========================================
describe("GET /api/tasks", () => {
  it("タスク一覧を返す", async () => {
    const tasks = [createMockTask(), createMockTask({ id: "002", title: "Second task" })];
    mockExecuteListTasks.mockResolvedValue(createMockListResponse(tasks));

    const res = await supertest(app)
      .get("/api/tasks")
      .expect(200)
      .expect("Content-Type", /json/);

    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.hasMore).toBe(false);
  });

  it("空のタスク一覧を返す", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    const res = await supertest(app).get("/api/tasks").expect(200);

    expect(res.body.tasks).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("statusフィルタを正しくパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?status=pending,working").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ status: ["pending", "working"] }),
    );
  });

  it("assigneeフィルタを正しくパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?assignee=emma").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ assignee: "emma" }),
    );
  });

  it("parentIdフィルタを正しくパースする（値あり）", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?parentId=095").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ parentId: "095" }),
    );
  });

  it("parentId=nullをnullとしてパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?parentId=null").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ parentId: null }),
    );
  });

  it("limit・offsetを数値としてパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?limit=10&offset=5").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ limit: 10, offset: 5 }),
    );
  });

  it("sortField・sortOrderを正しくパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?sortField=id&sortOrder=desc").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ sortField: "id", sortOrder: "desc" }),
    );
  });

  it("actionRequired=trueフィルタを正しくパースする（task-1494-3改善提案）", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?actionRequired=true").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ actionRequired: true }),
    );
  });

  it("actionRequired=falseフィルタを正しくパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks?actionRequired=false").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ actionRequired: false }),
    );
  });

  it("actionRequired未指定時はフィルタを渡さない", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app).get("/api/tasks").expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.not.objectContaining({ actionRequired: expect.anything() }),
    );
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteListTasks.mockRejectedValue(new Error("DB error"));

    const res = await supertest(app).get("/api/tasks").expect(500);

    expect(res.body.error).toBe("Task list retrieval failed");
    expect(res.body.details).toBe("DB error");
  });
});

// ===========================================
// GET /api/tasks/:id
// ===========================================
describe("GET /api/tasks/:id", () => {
  it("タスク詳細を返す", async () => {
    const task = createMockTask({ id: "095" });
    mockExecuteGetTask.mockResolvedValue({ task });

    const res = await supertest(app).get("/api/tasks/095").expect(200);

    expect(res.body.task.id).toBe("095");
    expect(mockExecuteGetTask).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ taskId: "095", includeSubtasks: false }),
    );
  });

  it("includeSubtasks=trueを正しくパースする", async () => {
    mockExecuteGetTask.mockResolvedValue({ task: createMockTask() });

    await supertest(app).get("/api/tasks/095?includeSubtasks=true").expect(200);

    expect(mockExecuteGetTask).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ includeSubtasks: true }),
    );
  });

  it("存在しないIDに404を返す", async () => {
    mockExecuteGetTask.mockResolvedValue({ task: null });

    const res = await supertest(app).get("/api/tasks/999").expect(404);

    expect(res.body.error).toBe("Task not found");
    expect(res.body.taskId).toBe("999");
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteGetTask.mockRejectedValue(new Error("Read error"));

    const res = await supertest(app).get("/api/tasks/001").expect(500);

    expect(res.body.error).toBe("Task retrieval failed");
  });
});

// ===========================================
// PATCH /api/tasks/:id
// ===========================================
describe("PATCH /api/tasks/:id", () => {
  it("タスクを更新する", async () => {
    const updatedTask = createMockTask({ id: "095", status: "completed" });
    mockExecuteUpdateTask.mockResolvedValue({ success: true, task: updatedTask });

    const res = await supertest(app)
      .patch("/api/tasks/095")
      .send({ status: "completed", summary: "Done" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockExecuteUpdateTask).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ taskId: "095", status: "completed", summary: "Done" }),
    );
  });

  it("存在しないIDに404を返す", async () => {
    mockExecuteUpdateTask.mockResolvedValue({ success: false });

    const res = await supertest(app)
      .patch("/api/tasks/999")
      .send({ status: "working" })
      .expect(404);

    expect(res.body.error).toBe("Task not found");
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteUpdateTask.mockRejectedValue(new Error("Write error"));

    const res = await supertest(app)
      .patch("/api/tasks/001")
      .send({ status: "working" })
      .expect(500);

    expect(res.body.error).toBe("Task update failed");
  });

  it("checkpointPassAdd を executeUpdateTask に転送する（C-1）", async () => {
    const updatedTask = createMockTask({ id: "1454", status: "working" });
    mockExecuteUpdateTask.mockResolvedValue({ success: true, task: updatedTask });

    const res = await supertest(app)
      .patch("/api/tasks/1454")
      .send({ checkpointPassAdd: { summary: "暫定判断: dev直接で続行", agentId: "rose" } })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockExecuteUpdateTask).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({
        taskId: "1454",
        checkpointPassAdd: { summary: "暫定判断: dev直接で続行", agentId: "rose" },
      }),
    );
  });
});

// ===========================================
// GET /api/tasks/:id/report
// ===========================================
describe("GET /api/tasks/:id/report", () => {
  it("レポートを返す", async () => {
    mockExecuteGetReport.mockResolvedValue({
      success: true,
      reports: [{ path: "reports/test.md", content: "Report content" }],
    });

    const res = await supertest(app).get("/api/tasks/095/report").expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.reports).toHaveLength(1);
  });

  it("limit指定を正しくパースする", async () => {
    mockExecuteGetReport.mockResolvedValue({ success: true, reports: [] });

    await supertest(app).get("/api/tasks/095/report?limit=5").expect(200);

    expect(mockExecuteGetReport).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ taskId: "095", limit: 5 }),
    );
  });

  it("存在しないIDに404を返す", async () => {
    mockExecuteGetReport.mockResolvedValue({ success: false, message: "Report not found" });

    const res = await supertest(app).get("/api/tasks/999/report").expect(404);

    expect(res.body.error).toBe("Report not found");
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteGetReport.mockRejectedValue(new Error("File read error"));

    const res = await supertest(app).get("/api/tasks/001/report").expect(500);

    expect(res.body.error).toBe("Report retrieval failed");
  });
});

// ===========================================
// GET /api/dashboard
// ===========================================
describe("GET /api/dashboard", () => {
  it("モバイル向けダッシュボードJSONを返す", async () => {
    // V2.1形式のモック設定
    mockGenerateDashboardData.mockResolvedValue({
      v2Goals: [{ id: "001", title: "Test Task", type: "task", mainStatus: "open", subStatus: "working", works: [] }],
      v2ReviewQueue: [],
      v2Artifacts: [],
      v2Stats: { taskCount: 1, workCount: 0, stepCount: 0, completedCount: 0, actionRequiredCount: 0, reviewPendingCount: 0, proposalCount: 0 },
      totalGoals: 1,
    });
    mockExecuteListTasks.mockResolvedValue(createMockListResponse([], 0));
    mockExecuteGetTeamStatus.mockResolvedValue({ agents: [] });

    const res = await supertest(app)
      .get("/api/dashboard")
      .expect(200)
      .expect("Content-Type", /json/);

    expect(res.body.goals).toBeDefined();
    expect(res.body.goals).toHaveLength(1);
    expect(res.body.stats).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });

  it("サービスエラー時に500を返す", async () => {
    mockGenerateDashboardData.mockRejectedValue(new Error("Service error"));

    const res = await supertest(app).get("/api/dashboard").expect(500);

    expect(res.body.error).toBe("V2 Dashboard retrieval failed");
  });

  it("skillCandidates/improvements の id が整数でも文字列に変換されること (#524-3)", async () => {
    mockGenerateDashboardData.mockResolvedValue({
      v2Goals: [],
      v2ReviewQueue: [],
      v2Artifacts: [],
      v2Stats: { taskCount: 0, workCount: 0, stepCount: 0, completedCount: 0, actionRequiredCount: 0, reviewPendingCount: 0, proposalCount: 0 },
      totalGoals: 0,
    });
    // tasks.yaml から整数 id で読み込まれたタスクを模倣
    mockExecuteListTasks
      .mockResolvedValueOnce(createMockListResponse([{ id: 8, title: "スキル候補" } as any], 1))
      .mockResolvedValueOnce(createMockListResponse([{ id: 78, title: "改善提案" } as any], 1));
    mockExecuteGetTeamStatus.mockResolvedValue({ agents: [] });

    const res = await supertest(app).get("/api/dashboard").expect(200);

    expect(res.body.skillCandidates).toHaveLength(1);
    expect(typeof res.body.skillCandidates[0].id).toBe("string");
    expect(res.body.skillCandidates[0].id).toBe("8");

    expect(res.body.improvements).toHaveLength(1);
    expect(typeof res.body.improvements[0].id).toBe("string");
    expect(res.body.improvements[0].id).toBe("78");
  });
});
