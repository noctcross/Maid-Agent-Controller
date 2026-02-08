/**
 * task-html テスト
 * generateTaskHtml() の報告書リンクにproject queryパラメータが含まれることを検証
 */

import { describe, it, expect } from "@jest/globals";
import { generateTaskHtml } from "../../views/task-html.js";

const PROJECT_PATH = "/mnt/c/Users/noct/Development/TestProject";

describe("generateTaskHtml - report links", () => {
  const completedTask = {
    id: "test-001",
    title: "テストタスク",
    description: "テスト説明",
    priority: "medium",
    status: "completed",
    assignees: [{ agentId: "lily" }],
    createdAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T01:00:00Z",
    reportPaths: [".maid-agent/system/data/reports/current_lily.md"],
    reviewed: false,
    starred: false,
  };

  it("報告書リンクにproject queryパラメータが含まれる", () => {
    const html = generateTaskHtml([completedTask], "completed", PROJECT_PATH);
    expect(html).toContain(`&project=${encodeURIComponent(PROJECT_PATH)}`);
  });

  it("報告書リンクのhrefに/file?path=が含まれる", () => {
    const html = generateTaskHtml([completedTask], "completed", PROJECT_PATH);
    expect(html).toContain('/file?path=');
  });

  it("報告書がないタスクではreport linkが生成されない", () => {
    const taskNoReport = { ...completedTask, reportPaths: [] };
    const html = generateTaskHtml([taskNoReport], "completed", PROJECT_PATH);
    expect(html).not.toContain("report-link");
  });
});

describe("master_review type", () => {
  it("master_review タスクが action-required-item クラスで生成される", () => {
    const tasks = [{
      id: "001",
      title: "確認待ちタスク",
      description: "テスト",
      completedAt: "2026-02-08T10:00:00+09:00",
      summary: "完了サマリー",
    }];
    const html = generateTaskHtml(tasks as any, "master_review", "/test/project");
    expect(html).toContain("action-required-item");
    expect(html).toContain("001");
    expect(html).toContain("確認待ちタスク");
  });

  it("master_review タスクに review/star ボタンが含まれない", () => {
    const tasks = [{
      id: "001",
      title: "確認待ちタスク",
      description: "テスト",
      completedAt: "2026-02-08T10:00:00+09:00",
    }];
    const html = generateTaskHtml(tasks as any, "master_review", "/test/project");
    expect(html).not.toContain("review-btn");
    expect(html).not.toContain("star-btn");
  });
});
