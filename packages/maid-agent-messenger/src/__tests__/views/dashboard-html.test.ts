import { describe, it, expect } from "@jest/globals";
import { generateDashboardHtml } from "../../views/dashboard-html.js";
import type { DashboardData } from "../../views/dashboard-html.js";

const minimalDashboardData: DashboardData = {
  projectPath: "/test/project",
  timestamp: "2026-02-08T00:00:00+09:00",
  pending: [],
  working: [],
  recentCompleted: [],
  completedTotal: 0,
  masterWaiting: [],
  masterReview: [],
  skillCandidates: [],
  improvements: [],
  teamStatus: [],
  stats: {
    pendingCount: 0,
    workingCount: 0,
    masterWaitingCount: 0,
    completedTodayCount: 0,
  },
  serverUrl: "http://127.0.0.1:3100",
  // V2表示モード
  dashboardVersion: "v2",
};

describe("serverBaseUrl の動的化", () => {
  it("生成HTMLに window.location.origin が含まれること", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      serverUrl: "http://127.0.0.1:3100",
    });
    expect(html).toContain("window.location.origin");
  });

  it("生成HTMLにサーバー設定値が埋め込まれること", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      serverUrl: "http://192.168.1.100:3100",
    });
    expect(html).toContain("http://192.168.1.100:3100");
  });

  it("ハードコード http://127.0.0.1:3100 が含まれないこと", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      serverUrl: "http://127.0.0.1:3100",
    });
    expect(html).not.toContain("const serverBaseUrl = 'http://127.0.0.1:3100'");
  });
});

describe("generateDashboardHtml - V2ダッシュボード基本構造", () => {
  it("V2ダッシュボードのヘッダーが表示される", () => {
    const html = generateDashboardHtml(minimalDashboardData);
    expect(html).toContain("Maid Agent Dashboard");
    expect(html).toContain("/test/project");
  });

  it("V2セクション（v2Goals等）がある場合、v2-sectionsとgoalコンテナが含まれる", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      v2Goals: [{
        id: "goal-001",
        title: "テストGoal",
        description: "テスト",
        type: "task",
        mainStatus: "open",
        v2Substatus: "working",
        assignees: [],
        works: [],
      }],
    });
    // v2セクションコンテナが含まれること
    expect(html).toContain("v2-sections");
    // Goal表示用のコンテナが含まれること（実際のGoal項目はJavaScriptで動的にレンダリング）
    expect(html).toContain("v2-goals-open-section");
    expect(html).toContain("v2-goals-closed-section");
  });

  // NOTE: v1削除によりv1固有のセクションテストは削除
  // v2ダッシュボードはv2SectionsHtml（goal tree, review queue等）で表示
});
