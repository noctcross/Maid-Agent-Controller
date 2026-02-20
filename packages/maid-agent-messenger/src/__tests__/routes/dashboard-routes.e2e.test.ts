/**
 * Dashboard Routes E2E テスト
 * 対象: GET /dashboard, /dashboard/completed, /dashboard/data,
 *       PATCH /dashboard/tasks/:id/review, /dashboard/tasks/:id/star
 * SSE (/dashboard/events) は対象外
 *
 * dashboard-routes はファクトリ関数パターン: createDashboardRoutes(deps)
 * テスト用appではビュー関数のスタブを依存注入する
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { TEST_PROJECT_PATH, createMockListResponse } from "../helpers/e2e-setup.js";

// --- モック定義 ---
const mockExecuteListTasks = jest.fn<any>();
const mockExecuteGetTeamStatus = jest.fn<any>();
const mockExecuteUpdateTask = jest.fn<any>();

jest.unstable_mockModule("../../services/index.js", () => ({
  executeListTasks: mockExecuteListTasks,
  executeGetTeamStatus: mockExecuteGetTeamStatus,
  executeUpdateTask: mockExecuteUpdateTask,
}));

jest.unstable_mockModule("../../middleware/project-path.js", () => ({
  getProjectPathFromRequest: () => TEST_PROJECT_PATH,
}));

jest.unstable_mockModule("../../utils/config-loader.js", () => ({
  loadConfig: () => Promise.resolve({
    server: { port: 3100, host: "0.0.0.0" },
    dashboard: { editor: "vscode" },
    keepalive: {},
  }),
  getServerUrl: () => "http://localhost:3100",
}));

jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  getJstTimestamp: () => "2026-02-09 00:00:00",
  stringifyYaml: (data: unknown) => JSON.stringify(data),
}));

jest.unstable_mockModule("../../utils/path-helpers.js", () => ({
  getQueueMaidPath: (p: string) => `${p}/.maid-agent/system/data/maid`,
}));

jest.unstable_mockModule("../../services/project-registry.js", () => ({
  recordProjectAccess: jest.fn<any>().mockResolvedValue(undefined),
}));

// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const { createDashboardRoutes } = await import("../../routes/dashboard-routes.js");

// --- ビュー関数のスタブ ---
const stubGenerateDashboardHtml = jest.fn<(...args: unknown[]) => string>()
  .mockReturnValue("<html><body>stub dashboard</body></html>");
const stubGenerateTaskHtml = jest.fn<(...args: unknown[]) => string>()
  .mockReturnValue("<div>stub tasks</div>");
const stubComposeMasterWaitingHtml = jest.fn<(...args: unknown[]) => string>()
  .mockReturnValue("<div>stub waiting</div>");

// --- テスト用app構築（ファクトリ関数パターン） ---
const app = express();
app.use(express.json());
app.use(createDashboardRoutes({
  generateDashboardHtml: stubGenerateDashboardHtml as any,
  generateTaskHtml: stubGenerateTaskHtml as any,
  composeMasterWaitingHtml: stubComposeMasterWaitingHtml as any,
}));

/** executeListTasks の連続呼び出し用デフォルトモック設定 */
function setupDashboardMocks() {
  // GET /dashboard は executeListTasks を9回、executeGetTeamStatus を1回呼ぶ
  mockExecuteListTasks.mockResolvedValue(createMockListResponse());
  mockExecuteGetTeamStatus.mockResolvedValue({ agents: [] });
}

beforeEach(() => {
  jest.clearAllMocks();
  stubGenerateDashboardHtml.mockReturnValue("<html><body>stub dashboard</body></html>");
  stubGenerateTaskHtml.mockReturnValue("<div>stub tasks</div>");
  stubComposeMasterWaitingHtml.mockReturnValue("<div>stub waiting</div>");
});

// ===========================================
// GET /dashboard
// ===========================================
describe("GET /dashboard", () => {
  it("project未指定かつヘッダーなしの場合はトップページにリダイレクト", async () => {
    // リダイレクト確認（モックは不要）
    const res = await supertest(app)
      .get("/dashboard")
      .expect(302);

    expect(res.headers.location).toBe("/");
  });

  it("HTMLダッシュボードを返す", async () => {
    setupDashboardMocks();

    const res = await supertest(app)
      .get("/dashboard")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH)
      .expect(200)
      .expect("Content-Type", /html/);

    expect(res.text).toContain("stub dashboard");
    expect(stubGenerateDashboardHtml).toHaveBeenCalledTimes(1);
  });

  it("?project=パラメータでプロジェクトパスを指定できる", async () => {
    setupDashboardMocks();

    await supertest(app)
      .get("/dashboard?project=/custom/project")
      .expect(200);

    // executeListTasks が /custom/project で呼ばれたことを確認
    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      "/custom/project",
      expect.anything(),
    );
  });

  it("?editor=パラメータを渡す", async () => {
    setupDashboardMocks();

    await supertest(app)
      .get("/dashboard?editor=cursor")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH)
      .expect(200);

    expect(stubGenerateDashboardHtml).toHaveBeenCalledWith(
      expect.anything(),
      "cursor",
    );
  });

  it("サービスエラー時にエラーHTMLを返す", async () => {
    mockExecuteListTasks.mockRejectedValue(new Error("Service error"));

    const res = await supertest(app)
      .get("/dashboard")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH)
      .expect(500);

    expect(res.text).toContain("Error");
    expect(res.text).toContain("Service error");
  });
});

// ===========================================
// GET /dashboard/completed
// ===========================================
describe("GET /dashboard/completed", () => {
  it("完了タスクのHTMLとメタ情報を返す", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse([], 25));

    const res = await supertest(app)
      .get("/dashboard/completed")
      .expect(200)
      .expect("Content-Type", /json/);

    expect(res.body.html).toBeDefined();
    expect(res.body.total).toBe(25);
    expect(res.body.offset).toBe(0);
    expect(res.body.limit).toBe(10);
    expect(res.body.hasMore).toBe(false);
  });

  it("offset・limitを正しくパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app)
      .get("/dashboard/completed?offset=10&limit=5")
      .expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ offset: 10, limit: 5 }),
    );
  });

  it("reviewed・starredフィルタを正しくパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app)
      .get("/dashboard/completed?reviewed=yes&starred=no")
      .expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reviewed: true, starred: false }),
    );
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteListTasks.mockRejectedValue(new Error("DB error"));

    const res = await supertest(app).get("/dashboard/completed").expect(500);

    expect(res.body.error).toBeDefined();
  });
});

// ===========================================
// GET /dashboard/data
// ===========================================
describe("GET /dashboard/data", () => {
  it("JSONデータを返す", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    const res = await supertest(app)
      .get("/dashboard/data")
      .expect(200)
      .expect("Content-Type", /json/);

    expect(res.body.stats).toBeDefined();
    expect(res.body.tasks).toBeDefined();
    expect(res.body.completedMeta).toBeDefined();
    expect(res.body.serverUrl).toBe("http://localhost:3100");
  });

  it("?project=パラメータでプロジェクトパスを指定できる", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app)
      .get("/dashboard/data?project=%2Fcustom%2Fpath")
      .expect(200);

    expect(mockExecuteListTasks).toHaveBeenCalledWith(
      "/custom/path",
      expect.anything(),
    );
  });

  it("completedLimit・completedOffsetを正しくパースする", async () => {
    mockExecuteListTasks.mockResolvedValue(createMockListResponse());

    await supertest(app)
      .get("/dashboard/data?completedLimit=20&completedOffset=10")
      .expect(200);

    // 3番目の executeListTasks 呼び出し（completed）が limit=20, offset=10 で呼ばれること
    const calls = mockExecuteListTasks.mock.calls;
    const completedCall = calls.find(
      (call: unknown[]) => {
        const filter = call[1] as Record<string, unknown>;
        return Array.isArray(filter.status) &&
          (filter.status as string[]).includes("completed") &&
          filter.limit === 20;
      },
    );
    expect(completedCall).toBeDefined();
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteListTasks.mockRejectedValue(new Error("Service error"));

    const res = await supertest(app).get("/dashboard/data").expect(500);

    expect(res.body.error).toBeDefined();
  });
});

// ===========================================
// PATCH /dashboard/tasks/:id/review
// ===========================================
describe("PATCH /dashboard/tasks/:id/review", () => {
  it("レビュー済みをトグルする", async () => {
    mockExecuteUpdateTask.mockResolvedValue({
      success: true,
      task: { reviewed: true, reviewedAt: "2026-02-09T00:00:00+09:00" },
    });

    const res = await supertest(app)
      .patch("/dashboard/tasks/095/review")
      .send({ reviewed: true })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.reviewed).toBe(true);
  });

  it("reviewed未指定時はデフォルトtrueで呼ぶ", async () => {
    mockExecuteUpdateTask.mockResolvedValue({
      success: true,
      task: { reviewed: true, reviewedAt: "2026-02-09T00:00:00+09:00" },
    });

    await supertest(app)
      .patch("/dashboard/tasks/095/review")
      .send({})
      .expect(200);

    expect(mockExecuteUpdateTask).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ reviewed: true }),
    );
  });

  it("存在しないIDに404を返す", async () => {
    mockExecuteUpdateTask.mockResolvedValue({ success: false });

    const res = await supertest(app)
      .patch("/dashboard/tasks/999/review")
      .send({})
      .expect(404);

    expect(res.body.error).toBe("Task not found");
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteUpdateTask.mockRejectedValue(new Error("Write error"));

    const res = await supertest(app)
      .patch("/dashboard/tasks/001/review")
      .send({})
      .expect(500);

    expect(res.body.error).toBe("Review toggle failed");
  });
});

// ===========================================
// PATCH /dashboard/tasks/:id/star
// ===========================================
describe("PATCH /dashboard/tasks/:id/star", () => {
  it("スターをトグルする", async () => {
    mockExecuteUpdateTask.mockResolvedValue({
      success: true,
      task: { starred: true, starredAt: "2026-02-09T00:00:00+09:00" },
    });

    const res = await supertest(app)
      .patch("/dashboard/tasks/095/star")
      .send({ starred: true })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.starred).toBe(true);
  });

  it("starred未指定時はデフォルトtrueで呼ぶ", async () => {
    mockExecuteUpdateTask.mockResolvedValue({
      success: true,
      task: { starred: true, starredAt: "2026-02-09T00:00:00+09:00" },
    });

    await supertest(app)
      .patch("/dashboard/tasks/095/star")
      .send({})
      .expect(200);

    expect(mockExecuteUpdateTask).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ starred: true }),
    );
  });

  it("存在しないIDに404を返す", async () => {
    mockExecuteUpdateTask.mockResolvedValue({ success: false });

    await supertest(app)
      .patch("/dashboard/tasks/999/star")
      .send({})
      .expect(404);
  });

  it("サービスエラー時に500を返す", async () => {
    mockExecuteUpdateTask.mockRejectedValue(new Error("Write error"));

    const res = await supertest(app)
      .patch("/dashboard/tasks/001/star")
      .send({})
      .expect(500);

    expect(res.body.error).toBe("Star toggle failed");
  });
});
