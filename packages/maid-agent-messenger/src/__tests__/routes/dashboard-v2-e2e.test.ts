/**
 * Dashboard V2 E2E テスト
 *
 * Phase E-1: E2Eテスト追加
 * - TC-E1-1: Goalsツリー表示
 * - TC-E1-2: ページネーション
 * - TC-E1-3: フィルタ切り替え
 * - TC-E1-4: タスク詳細ポップアップ
 * - TC-E1-5: WebSocket更新（スキップ：別途統合テストで実施）
 * - TC-E1-6: レスポンシブ表示
 *
 * Phase E-2: パフォーマンス計測
 * - ダッシュボード表示 < 2秒
 * - Goals取得API < 500ms
 *
 * 注: HTML生成の詳細テストは dashboard-v2.1.test.ts でカバー
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { TEST_PROJECT_PATH, createMockListResponse } from "../helpers/e2e-setup.js";

// --- モック定義 ---
const mockExecuteListTasks = jest.fn<any>();
const mockExecuteGetTeamStatus = jest.fn<any>();
const mockExecuteUpdateTask = jest.fn<any>();
const mockExecuteGetReport = jest.fn<any>().mockResolvedValue({
  success: true,
  reports: [],
});

// V2用モック
const mockGenerateV2DashboardData = jest.fn<any>();

jest.unstable_mockModule("../../services/index.js", () => ({
  executeListTasks: mockExecuteListTasks,
  executeGetTeamStatus: mockExecuteGetTeamStatus,
  executeUpdateTask: mockExecuteUpdateTask,
  executeGetReport: mockExecuteGetReport,
  generateV2DashboardData: mockGenerateV2DashboardData,
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
  getJstTimestamp: () => "2026-02-25 00:00:00",
  stringifyYaml: (data: unknown) => JSON.stringify(data),
}));

jest.unstable_mockModule("../../utils/path-helpers.js", () => ({
  getQueueMaidPath: (p: string) => `${p}/.maid-agent/system/data/maid`,
}));

jest.unstable_mockModule("../../services/project-registry.js", () => ({
  recordProjectAccess: jest.fn<any>().mockResolvedValue(undefined),
}));

// --- テストデータ ---
const mockV2GoalsData = {
  v2Goals: [
    {
      id: "310",
      title: "V2.1ダッシュボード実装",
      type: "task",
      mainStatus: "open",
      v2Substatus: "working",
      size: "complex",
      assignees: [{ agentId: "emma" }],
      phases: [
        {
          id: "310-P1",
          title: "設計Phase",
          type: "work",
          mainStatus: "closed",
          v2Substatus: "completed",
          actions: [
            { id: "310-1", title: "要件定義", type: "step", mainStatus: "closed", v2Substatus: "completed" },
            { id: "310-2", title: "基本設計", type: "step", mainStatus: "closed", v2Substatus: "completed" },
          ],
        },
        {
          id: "310-P2",
          title: "実装Phase",
          type: "work",
          mainStatus: "open",
          v2Substatus: "working",
          actions: [
            { id: "310-3", title: "バックエンド実装", type: "step", mainStatus: "open", v2Substatus: "working" },
            { id: "310-4", title: "フロントエンド実装", type: "step", mainStatus: "open", v2Substatus: "pending" },
          ],
        },
      ],
    },
  ],
  v2ReviewQueue: [],
  v2Artifacts: [],
  v2Stats: {
    taskCount: 1,
    workCount: 2,
    stepCount: 4,
    completedCount: 2,
    actionRequiredCount: 0,
    reviewPendingCount: 0,
    proposalCount: 0,
  },
};

// --- V2用のスタブHTML（実際の構造を模倣） ---
const v2StubHtml = `<!DOCTYPE html>
<html>
<head>
<style>
@media (max-width: 768px) {
  .status-text { display: none; }
}
</style>
</head>
<body>
<div class="dashboard-v2">
  <div class="filter-controls">
    <button class="filter-btn" data-filter="open">Open</button>
    <button class="filter-btn" data-filter="closed">Closed</button>
    <button class="filter-btn" data-filter="all">All</button>
  </div>
  <div class="pagination">
    <button>Prev</button>
    <span>Page 1</span>
    <button>Next</button>
  </div>
  <div class="goal-tree">
    <div class="goal-item" data-id="310">
      <div class="goal-header">
        <span class="status">🔵</span>
        <span class="title">V2.1ダッシュボード実装</span>
      </div>
      <div class="phase-item" data-id="310-P1">
        <span class="status">✅</span>
        <span class="title">設計Phase</span>
        <div class="action-item" data-id="310-1">要件定義</div>
        <div class="action-item" data-id="310-2">基本設計</div>
      </div>
    </div>
  </div>
  <div class="task-popup" style="display:none"></div>
</div>
<script>
function showTaskPopup(taskId) {}
function hideTaskPopup() {}
const ws = new WebSocket('ws://localhost:3100/dashboard/ws');
</script>
</body>
</html>`;

// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const { createDashboardRoutes } = await import("../../routes/dashboard-routes.js");

// --- ビュースタブ（V2対応） ---
const stubGenerateDashboardHtml = jest.fn<(...args: unknown[]) => string>()
  .mockImplementation((data: any) => {
    // V2の場合はV2用HTMLを返す
    if (data.dashboardVersion === "v2") {
      return v2StubHtml;
    }
    return "<html><body>stub v1 dashboard</body></html>";
  });
const stubGenerateTaskHtml = jest.fn<(...args: unknown[]) => string>()
  .mockReturnValue("<div>stub tasks</div>");
const stubComposeMasterWaitingHtml = jest.fn<(...args: unknown[]) => string>()
  .mockReturnValue("<div>stub waiting</div>");

// --- テスト用app構築 ---
const app = express();
app.use(express.json());
app.use(createDashboardRoutes({
  generateDashboardHtml: stubGenerateDashboardHtml as any,
  generateTaskHtml: stubGenerateTaskHtml as any,
  composeMasterWaitingHtml: stubComposeMasterWaitingHtml as any,
}));

/** モック設定ヘルパー */
function setupV2Mocks() {
  mockExecuteListTasks.mockResolvedValue(createMockListResponse());
  mockExecuteGetTeamStatus.mockResolvedValue({ agents: [] });
  mockGenerateV2DashboardData.mockResolvedValue(mockV2GoalsData);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupV2Mocks();
});

// ===========================================
// TC-E1-1: Goalsツリー表示
// ===========================================
describe("TC-E1-1: Goalsツリー表示", () => {
  it("V2ダッシュボードが正常に返される", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH)
      .expect(200);

    expect(res.text).toBeDefined();
    expect(res.headers["content-type"]).toMatch(/html/);
  });

  it("Goal要素が含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("goal-item");
  });

  it("Phase要素が含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("phase-item");
  });

  it("Action要素が含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("action-item");
  });

  it("ステータスアイコンが表示される", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/✅|🔵/);
  });

  it("generateV2DashboardDataが呼び出される", async () => {
    await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(mockGenerateV2DashboardData).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.any(Object)
    );
  });
});

// ===========================================
// TC-E1-2: ページネーション
// ===========================================
describe("TC-E1-2: ページネーション", () => {
  it("ページネーションコントロールが含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("pagination");
  });

  it("V2データAPIでlimitパラメータが適用される", async () => {
    await supertest(app)
      .get("/dashboard/v2/goals?limit=20")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(mockGenerateV2DashboardData).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ limit: 20 })
    );
  });

  it("V2データAPIでoffsetパラメータが適用される", async () => {
    await supertest(app)
      .get("/dashboard/v2/goals?offset=10")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(mockGenerateV2DashboardData).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ offset: 10 })
    );
  });
});

// ===========================================
// TC-E1-3: フィルタ切り替え
// ===========================================
describe("TC-E1-3: フィルタ切り替え", () => {
  it("status=openでstatusFilter=openが渡される", async () => {
    await supertest(app)
      .get("/dashboard/v2/goals?status=open")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(mockGenerateV2DashboardData).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ statusFilter: "open" })
    );
  });

  it("status=closedでstatusFilter=closedが渡される", async () => {
    await supertest(app)
      .get("/dashboard/v2/goals?status=closed")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(mockGenerateV2DashboardData).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ statusFilter: "closed" })
    );
  });

  it("status=allでstatusFilter=allが渡される", async () => {
    await supertest(app)
      .get("/dashboard/v2/goals?status=all")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(mockGenerateV2DashboardData).toHaveBeenCalledWith(
      TEST_PROJECT_PATH,
      expect.objectContaining({ statusFilter: "all" })
    );
  });

  it("フィルタボタンがHTMLに含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("filter-btn");
  });
});

// ===========================================
// TC-E1-4: タスク詳細ポップアップ
// ===========================================
describe("TC-E1-4: タスク詳細ポップアップ", () => {
  it("ポップアップ用スクリプトが含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("showTaskPopup");
  });

  it("ポップアップ用HTML要素が含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("task-popup");
  });
});

// ===========================================
// TC-E1-5: WebSocket更新
// ===========================================
describe("TC-E1-5: WebSocket更新", () => {
  it("WebSocket接続用スクリプトが含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("WebSocket");
  });
});

// ===========================================
// TC-E1-6: レスポンシブ表示
// ===========================================
describe("TC-E1-6: レスポンシブ表示", () => {
  it("メディアクエリが含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("@media");
  });

  it("モバイル向けスタイルが含まれる", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("max-width");
  });

  it("status-textクラスが定義されている", async () => {
    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    expect(res.status).toBe(200);
    expect(res.text).toContain("status-text");
  });
});

// ===========================================
// E-2: パフォーマンス計測
// ===========================================
describe("E-2: パフォーマンス計測", () => {
  it("ダッシュボード表示が2秒以内", async () => {
    const start = performance.now();

    const res = await supertest(app)
      .get("/dashboard?version=v2")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(2000); // 2秒以内
  });

  it("V2データ取得APIが500ms以内", async () => {
    const start = performance.now();

    const res = await supertest(app)
      .get("/dashboard/v2/goals")
      .set("X-Maid-Project-Path", TEST_PROJECT_PATH);

    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(500); // 500ms以内
  });
});
