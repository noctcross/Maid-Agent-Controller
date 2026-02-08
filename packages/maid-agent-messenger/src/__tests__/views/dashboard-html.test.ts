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
