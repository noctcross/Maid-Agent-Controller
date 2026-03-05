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
  // V1表示モードでテスト（V1セクションのテストのため）
  dashboardVersion: "v1",
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

  it("0.0.0.0 が 127.0.0.1 にfallbackされるコードが含まれること", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      serverUrl: "http://0.0.0.0:3100",
    });
    expect(html).toContain(".replace('0.0.0.0', '127.0.0.1')");
  });

  it("ハードコード http://127.0.0.1:3100 が含まれないこと", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      serverUrl: "http://127.0.0.1:3100",
    });
    expect(html).not.toContain("const serverBaseUrl = 'http://127.0.0.1:3100'");
  });
});

describe("generateDashboardHtml - セクション表示（task-html.ts委譲後）", () => {
  it("空ダッシュボードで各セクションに「なし」が表示される", () => {
    const html = generateDashboardHtml(minimalDashboardData);
    // pendingセクション、workingセクション、completedセクション等に「なし」が含まれる
    const matches = html.match(/class="empty-message">なし/g);
    // pending, working, completed, masterWaiting(統合で1つ), skillCandidates, improvements = 6つ
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(6);
  });

  it("pendingセクションにタスクIDとタイトルが表示される", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      pending: [{ id: "p-001", title: "待機タスク", description: "テスト", priority: "high", createdAt: "2026-01-01T00:00:00Z" }],
    });
    expect(html).toContain("p-001");
    expect(html).toContain("待機タスク");
    expect(html).toContain("priority-high");
  });

  it("workingセクションにタスクと担当者が表示される", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      working: [{ id: "w-001", title: "作業中タスク", description: "テスト", status: "working", assignees: [{ agentId: "emma" }], priority: "medium" }],
    });
    expect(html).toContain("w-001");
    expect(html).toContain("作業中タスク");
    expect(html).toContain("emma");
  });

  it("completedセクションに報告書リンクが表示される", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      recentCompleted: [{
        id: "c-001", title: "完了タスク", description: "テスト",
        completedAt: "2026-01-01T01:00:00Z", summary: "完了",
        assignees: [{ agentId: "lily" }],
        reportPaths: [".maid-agent/master/reports/task-001.md"],
        reviewed: false, starred: false,
      }],
    });
    expect(html).toContain("c-001");
    expect(html).toContain("完了タスク");
    expect(html).toContain("report-link");
    expect(html).toContain("task-001.md");
  });

  it("対応待ちセクションが統合表示される（アクティブ+確認待ち）", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      masterWaiting: [{
        id: "mw-001", title: "判断待ち", description: "テスト",
        status: "blocked", substatus: "技術方針待ち",
        assignees: [{ agentId: "emma" }], priority: "high",
      }],
      masterReview: [{
        id: "mr-001", title: "確認待ち", description: "テスト",
        completedAt: "2026-01-01T01:00:00Z", summary: "完了",
      }],
    });
    expect(html).toContain("mw-001");
    expect(html).toContain("mr-001");
    expect(html).toContain("アクティブ (1)");
    expect(html).toContain("確認待ち (1)");
  });

  it("対応待ちセクションが両方空の場合「なし」が1つだけ表示される", () => {
    const html = generateDashboardHtml(minimalDashboardData);
    // 対応待ちセクション内のcollapsible-contentを抽出
    const masterWaitingMatch = html.match(/data-section="master-waiting"[\s\S]*?<div class="collapsible-content">([\s\S]*?)<\/div>\s*<\/div>/);
    expect(masterWaitingMatch).not.toBeNull();
    const masterWaitingContent = masterWaitingMatch![1];
    const nashi = masterWaitingContent.match(/なし/g);
    expect(nashi).toHaveLength(1);
  });

  it("スキル候補セクションにタスクが表示される", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      skillCandidates: [{ id: "sk-001", title: "スキル候補", description: "テスト" }],
    });
    expect(html).toContain("sk-001");
    expect(html).toContain("スキル候補");
  });

  it("改善提案セクションにタスクが表示される", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      improvements: [{ id: "imp-001", title: "改善提案", description: "テスト" }],
    });
    expect(html).toContain("imp-001");
    expect(html).toContain("改善提案");
  });

  it("actionRequiredフラグがtrueのタスクはpendingセクションに表示されない", () => {
    const html = generateDashboardHtml({
      ...minimalDashboardData,
      pending: [
        { id: "p-001", title: "通常タスク", description: "テスト", priority: "medium", createdAt: "2026-01-01T00:00:00Z" },
        { id: "ar-001", title: "要対応", description: "テスト", priority: "high", createdAt: "2026-01-01T00:00:00Z", actionRequired: true },
      ],
    });
    // pendingセクション内にar-001が含まれないこと（次のdata-sectionまでをキャプチャ）
    const pendingSection = html.match(/data-section="pending"[\s\S]*?(?=data-section="working")/);
    expect(pendingSection).not.toBeNull();
    expect(pendingSection![0]).toContain("p-001");
    expect(pendingSection![0]).not.toContain("ar-001");
  });
});
