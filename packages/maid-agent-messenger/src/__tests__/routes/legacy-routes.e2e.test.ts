/**
 * Legacy Routes E2E テスト
 * 対象: POST /tools/get_my_task, /tools/update_status, /tools/assign_task, /tools/get_team_status
 *
 * バリデーション方式の違い:
 * - get_my_task, update_status, assign_task: Zod スキーマ（不正入力→400）
 * - get_team_status: Zod 未使用（as キャスト）。バリデーションエラーテスト不要
 *
 * エラーレスポンス形式の不統一:
 * - update_status, assign_task の500: { success: false, error, details }
 * - get_my_task, get_team_status の500: { error, details }（success フィールドなし）
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { TEST_PROJECT_PATH } from "../helpers/e2e-setup.js";

// --- モック定義 ---
const mockExecuteGetMyTask = jest.fn<any>();
const mockExecuteUpdateStatus = jest.fn<any>();
const mockExecuteAssignTask = jest.fn<any>();
const mockExecuteGetTeamStatus = jest.fn<any>();

jest.unstable_mockModule("../../services/index.js", () => ({
  executeGetMyTask: mockExecuteGetMyTask,
  executeUpdateStatus: mockExecuteUpdateStatus,
  executeAssignTask: mockExecuteAssignTask,
  executeGetTeamStatus: mockExecuteGetTeamStatus,
}));

jest.unstable_mockModule("../../middleware/session-manager.js", () => ({
  getProjectPathFromRequest: () => TEST_PROJECT_PATH,
}));

jest.unstable_mockModule("../../utils/path-helpers.js", () => ({
  getQueueMaidPath: (p: string) => `${p}/.maid-agent/system/data/maid`,
  getCurrentReportsPath: (p: string) => `${p}/.maid-agent/system/data/reports`,
  getArchiveReportsPath: (p: string) => `${p}/.maid-agent/master/reports`,
}));

// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const legacyRoutes = (await import("../../routes/legacy-routes.js")).default;

// --- テスト用app構築 ---
const app = express();
app.use(express.json());
app.use(legacyRoutes);

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================
// POST /tools/get_my_task
// ===========================================
describe("POST /tools/get_my_task", () => {
  it("正常系: タスク情報を返す", async () => {
    mockExecuteGetMyTask.mockResolvedValue({
      task_id: "task-095-1",
      description: "Test task",
      status: "assigned",
    });

    const res = await supertest(app)
      .post("/tools/get_my_task")
      .send({ agent_id: "emma" })
      .expect(200)
      .expect("Content-Type", /json/);

    expect(res.body.task_id).toBe("task-095-1");
    expect(res.body.project_path).toBe(TEST_PROJECT_PATH);
  });

  it("Zodバリデーションエラー: 不正なagent_id → 400", async () => {
    const res = await supertest(app)
      .post("/tools/get_my_task")
      .send({ agent_id: "invalid_agent" })
      .expect(400);

    expect(res.body.error).toBe("Invalid input");
    expect(res.body.details).toBeDefined();
  });

  it("Zodバリデーションエラー: agent_id未指定 → 400", async () => {
    const res = await supertest(app)
      .post("/tools/get_my_task")
      .send({})
      .expect(400);

    expect(res.body.error).toBe("Invalid input");
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteGetMyTask.mockRejectedValue(new Error("File not found"));

    const res = await supertest(app)
      .post("/tools/get_my_task")
      .send({ agent_id: "lily" })
      .expect(500);

    expect(res.body.error).toBe("Task retrieval failed");
    expect(res.body.details).toBe("File not found");
    // get_my_task の500にはsuccessフィールドなし
    expect(res.body.success).toBeUndefined();
  });
});

// ===========================================
// POST /tools/update_status
// ===========================================
describe("POST /tools/update_status", () => {
  it("正常系: ステータスを更新する", async () => {
    mockExecuteUpdateStatus.mockResolvedValue({
      success: true,
      updated_fields: ["status"],
    });

    const res = await supertest(app)
      .post("/tools/update_status")
      .send({ agent_id: "emma", status: "working" })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it("正常系: summaryオプション付きで更新する", async () => {
    mockExecuteUpdateStatus.mockResolvedValue({ success: true });

    await supertest(app)
      .post("/tools/update_status")
      .send({ agent_id: "lily", status: "completed", summary: "Task done" })
      .expect(200);

    expect(mockExecuteUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "lily", status: "completed", summary: "Task done" }),
    );
  });

  it("Zodバリデーションエラー: 不正なstatus → 400", async () => {
    const res = await supertest(app)
      .post("/tools/update_status")
      .send({ agent_id: "emma", status: "invalid_status" })
      .expect(400);

    expect(res.body.error).toBe("Invalid input");
  });

  it("Zodバリデーションエラー: summary文字数超過 → 400", async () => {
    const res = await supertest(app)
      .post("/tools/update_status")
      .send({ agent_id: "emma", status: "working", summary: "x".repeat(101) })
      .expect(400);

    expect(res.body.error).toBe("Invalid input");
  });

  it("サービスエラー時に500を返す（successフィールドあり）", async () => {
    mockExecuteUpdateStatus.mockRejectedValue(new Error("Write failed"));

    const res = await supertest(app)
      .post("/tools/update_status")
      .send({ agent_id: "emma", status: "working" })
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Status update failed");
  });
});

// ===========================================
// POST /tools/assign_task
// ===========================================
describe("POST /tools/assign_task", () => {
  it("正常系: タスクを割り当てる", async () => {
    mockExecuteAssignTask.mockResolvedValue({ success: true });

    const res = await supertest(app)
      .post("/tools/assign_task")
      .send({
        task_id: "task-095-1",
        target_agent: "emma",
        title: "Review task",
      })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it("正常系: オプションフィールド付きで割り当てる", async () => {
    mockExecuteAssignTask.mockResolvedValue({ success: true });

    await supertest(app)
      .post("/tools/assign_task")
      .send({
        task_id: "task-095-1",
        target_agent: "sophia",
        title: "Impl task",
        description: "Implement feature X",
        target_path: "src/routes/",
      })
      .expect(200);

    expect(mockExecuteAssignTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-095-1",
        targetAgent: "sophia",
        title: "Impl task",
        description: "Implement feature X",
        targetPath: "src/routes/",
      }),
    );
  });

  it("割当済み（conflict）に409を返す", async () => {
    mockExecuteAssignTask.mockResolvedValue({
      success: false,
      error: "Agent already has a task",
    });

    const res = await supertest(app)
      .post("/tools/assign_task")
      .send({
        task_id: "task-095-1",
        target_agent: "emma",
        title: "Conflict task",
      })
      .expect(409);

    expect(res.body.success).toBe(false);
  });

  it("Zodバリデーションエラー: title未指定 → 400", async () => {
    const res = await supertest(app)
      .post("/tools/assign_task")
      .send({ task_id: "task-001", target_agent: "emma" })
      .expect(400);

    expect(res.body.error).toBe("Invalid input");
  });

  it("Zodバリデーションエラー: 不正なagent → 400", async () => {
    const res = await supertest(app)
      .post("/tools/assign_task")
      .send({ task_id: "task-001", target_agent: "invalid", title: "Test" })
      .expect(400);

    expect(res.body.error).toBe("Invalid input");
  });

  it("Zodバリデーションエラー: title文字数超過 → 400", async () => {
    const res = await supertest(app)
      .post("/tools/assign_task")
      .send({
        task_id: "task-001",
        target_agent: "emma",
        title: "x".repeat(101),
      })
      .expect(400);

    expect(res.body.error).toBe("Invalid input");
  });

  it("サービスエラー時に500を返す（successフィールドあり）", async () => {
    mockExecuteAssignTask.mockRejectedValue(new Error("YAML write failed"));

    const res = await supertest(app)
      .post("/tools/assign_task")
      .send({
        task_id: "task-001",
        target_agent: "emma",
        title: "Error task",
      })
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe("Task assignment failed");
  });
});

// ===========================================
// POST /tools/get_team_status
// ===========================================
describe("POST /tools/get_team_status", () => {
  it("正常系: チームステータスを返す", async () => {
    mockExecuteGetTeamStatus.mockResolvedValue({
      agents: [
        { id: "emma", status: "working", task_id: "task-001" },
        { id: "lily", status: "idle", task_id: null },
      ],
    });

    const res = await supertest(app)
      .post("/tools/get_team_status")
      .send({})
      .expect(200)
      .expect("Content-Type", /json/);

    expect(res.body.agents).toHaveLength(2);
    expect(res.body.project_path).toBe(TEST_PROJECT_PATH);
  });

  it("正常系: フィルタ付きでチームステータスを返す", async () => {
    mockExecuteGetTeamStatus.mockResolvedValue({ agents: [] });

    await supertest(app)
      .post("/tools/get_team_status")
      .send({ status: ["working"], agentId: "emma", includeCompleted: 5 })
      .expect(200);

    expect(mockExecuteGetTeamStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { status: ["working"], agentId: "emma", includeCompleted: 5 },
      }),
    );
  });

  it("サービスエラー時に500を返す（successフィールドなし）", async () => {
    mockExecuteGetTeamStatus.mockRejectedValue(new Error("Read error"));

    const res = await supertest(app)
      .post("/tools/get_team_status")
      .send({})
      .expect(500);

    expect(res.body.error).toBe("Team status retrieval failed");
    // get_team_status の500にはsuccessフィールドなし
    expect(res.body.success).toBeUndefined();
  });
});
