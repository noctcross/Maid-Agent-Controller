/**
 * Dashboard V2.1 UI テスト
 *
 * Phase 5: ダッシュボードUI実装
 * - Taskグルーピング表示
 * - Work/Step階層表示
 * - 成果物パネル
 * - 統計サマリーの種別対応
 * - レビューキュー表示
 */

import { describe, it, expect } from "@jest/globals";
import {
  generateTaskTreeHtml,
  generateReviewQueueHtml,
  generateArtifactsHtml,
  generateStatsHtml,
  type Task,
  type ReviewTask,
  type Artifact,
  type Stats,
} from "../../views/task-tree.js";

// === テストデータ ===

const mockTasks: Task[] = [
  {
    id: "289",
    title: "ダッシュボード構造改善",
    type: "task",
    mainStatus: "open",
    subStatus: "working",
    size: "complex",
    reviewStatus: "pending",
    assignees: [
      { agentId: "emma" },
      { agentId: "sophia" },
    ],
    works: [
      {
        id: "289-P1",
        title: "調査",
        type: "work",
        mainStatus: "closed",
        subStatus: "completed",
        reviewStatus: "approved",
        steps: [
          {
            id: "289-1",
            title: "要件調査",
            type: "step",
            mainStatus: "closed",
            subStatus: "completed",
          },
        ],
      },
      {
        id: "289-P2",
        title: "設計",
        type: "work",
        mainStatus: "open",
        subStatus: "working",
        reviewStatus: "pending",
        steps: [
          {
            id: "289-2",
            title: "設計書作成",
            type: "step",
            mainStatus: "closed",
            subStatus: "completed",
          },
          {
            id: "289-3",
            title: "モックアップ作成",
            type: "step",
            mainStatus: "open",
            subStatus: "working",
          },
        ],
      },
    ],
  },
  {
    id: "301",
    title: "APIリファクタリング",
    type: "task",
    mainStatus: "closed",
    subStatus: "completed",
    size: "standard",
    reviewStatus: "approved",
    assignees: [{ agentId: "rose" }],
    works: [],
  },
];

const mockReviewQueue: ReviewTask[] = [
  {
    id: "301",
    title: "API設計レビュー",
    type: "work",
    reviewStatus: "pending",
    priority: "high",
    completedAt: "2026-02-22T08:00:00Z",
    assignees: [{ agentId: "alice" }],
  },
  {
    id: "289",
    title: "ダッシュボード改善",
    type: "task",
    reviewStatus: "pending",
    priority: "normal",
    completedAt: "2026-02-22T06:00:00Z",
    assignees: [{ agentId: "emma" }],
  },
];

const mockArtifacts: Artifact[] = [
  {
    path: "docs/decisions/dashboard-v2.1.md",
    type: "design",
    retention: "L3",
    taskId: "289",
    createdAt: "2026-02-22T10:00:00Z",
  },
  {
    path: "docs/mockups/dashboard-v2.1.html",
    type: "mockup",
    retention: "L2",
    taskId: "289",
    createdAt: "2026-02-22T09:00:00Z",
  },
];

const mockStats: Stats = {
  taskCount: 3,
  workCount: 12,
  stepCount: 24,
  completedCount: 45,
  actionRequiredCount: 3,
  reviewPendingCount: 4,
  proposalCount: 3,
};

// === Taskツリー表示テスト ===

describe("generateTaskTreeHtml - Taskグルーピング表示", () => {
  it("Task一覧が正しく表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    expect(html).toContain("#289");
    expect(html).toContain("ダッシュボード構造改善");
    expect(html).toContain("task-item");
  });

  it("Taskのステータスバッジが表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    // working Task
    expect(html).toContain("status-working");
    expect(html).toContain("🔵");
    // completed Task
    expect(html).toContain("status-completed");
    expect(html).toContain("✅");
  });

  it("Task配下のWorkが階層表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    expect(html).toContain("work-tree");
    expect(html).toContain("289-P1");
    expect(html).toContain("調査");
    expect(html).toContain("289-P2");
    expect(html).toContain("設計");
  });

  it("Work配下のStepが表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    expect(html).toContain("289-1");
    expect(html).toContain("要件調査");
    expect(html).toContain("289-3");
    expect(html).toContain("モックアップ作成");
  });

  it("レビューステータスバッジが表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    expect(html).toContain("review-pending");
    expect(html).toContain("review-approved");
  });

  it("担当者が表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    expect(html).toContain("emma");
    expect(html).toContain("sophia");
  });

  it("空のTask配列の場合は「なし」を表示", () => {
    const html = generateTaskTreeHtml([], "/project");

    expect(html).toContain("empty-message");
    expect(html).toContain("なし");
  });

  it("closed/completedのTaskは視覚的に区別される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    // #301 は completed なので、completed クラスを持つべき
    expect(html).toMatch(/task-item[^>]*data-status="closed"/);
  });

  it("サブタスク有りのTaskは展開アイコン▼が表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    // ID 289 は works が2つあるので ▼ が表示される
    // task-item data-id="289" の中の task-toggle に ▼ があること
    const task289Match = html.match(/data-id="289"[^>]*>[\s\S]*?<span class="task-toggle[^"]*">(.*?)<\/span>/);
    expect(task289Match).not.toBeNull();
    expect(task289Match![1]).toBe("▼");
  });

  it("サブタスク無しのTaskは単独アイコン●が表示される", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    // ID 301 は works が空なので ● が表示される
    const task301Match = html.match(/data-id="301"[^>]*>[\s\S]*?<span class="task-toggle[^"]*">(.*?)<\/span>/);
    expect(task301Match).not.toBeNull();
    expect(task301Match![1]).toBe("●");
  });

  it("サブタスク無しのTaskはno-childrenクラスを持つ", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    // ID 301 は works が空なので no-children クラスを持つ
    expect(html).toMatch(/data-id="301"[\s\S]*?task-toggle[^"]*no-children/);
  });

  it("Taskのアーカイブボタンはクライアントサイドで生成される（サーバーサイドでは出力なし）", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    // アーカイブボタン/バッジはクライアントサイドで生成される
    // サーバーサイドでは出力しない（重複防止）
    expect(html).not.toContain('archive-placeholder');
    expect(html).not.toContain('archive-btn');
  });

  it("未完了Taskにはアーカイブボタンが表示されない", () => {
    const html = generateTaskTreeHtml(mockTasks, "/project");

    // ID 289 は working なのでアーカイブボタンが表示されない
    // task-item data-id="289" 内に archive-btn がないことを確認
    const task289Section = html.match(/data-id="289"[\s\S]*?(?=data-id="301"|$)/);
    expect(task289Section).not.toBeNull();
    expect(task289Section![0]).not.toContain("archive-btn");
  });

  it("アーカイブ済みTaskにはアーカイブプレースホルダーとdata-archivedが設定される", () => {
    const archivedTasks: Task[] = [
      {
        id: "400",
        title: "アーカイブ済みタスク",
        type: "task",
        mainStatus: "closed",
        subStatus: "completed",
        archived: true,
        assignees: [],
        works: [],
      },
    ];
    const html = generateTaskTreeHtml(archivedTasks, "/project");

    // アーカイブボタン/バッジはクライアントサイドで生成される
    // サーバーサイドではdata-archived属性のみ出力（ボタンは出力しない）
    expect(html).toContain('data-archived="true"');
    // プレースホルダー・ボタンはサーバーサイドで出力されない
    expect(html).not.toContain('archive-placeholder');
    expect(html).not.toContain('archive-btn');
  });
});

// === レビューキュー表示テスト ===

describe("generateReviewQueueHtml - レビューキュー表示", () => {
  it("レビューキュー一覧が表示される", () => {
    const html = generateReviewQueueHtml(mockReviewQueue, "/project");

    expect(html).toContain("review-item");
    expect(html).toContain("#301");
    expect(html).toContain("API設計レビュー");
  });

  it("優先度バッジが表示される", () => {
    const html = generateReviewQueueHtml(mockReviewQueue, "/project");

    expect(html).toContain("review-priority");
    expect(html).toContain("high");
    expect(html).toContain("normal");
  });

  it("タスクタイプアイコンが表示される", () => {
    const html = generateReviewQueueHtml(mockReviewQueue, "/project");

    // phase は 📋, goal は 🎯
    expect(html).toContain("📋"); // phase
    expect(html).toContain("🎯"); // goal
  });

  it("空の場合は「なし」を表示", () => {
    const html = generateReviewQueueHtml([], "/project");

    expect(html).toContain("empty-message");
    expect(html).toContain("なし");
  });
});

// === 成果物パネルテスト ===

describe("generateArtifactsHtml - 成果物パネル", () => {
  it("成果物一覧が表示される", () => {
    const html = generateArtifactsHtml(mockArtifacts, "/project");

    expect(html).toContain("artifact-item");
    expect(html).toContain("dashboard-v2.1.md");
    expect(html).toContain("dashboard-v2.1.html");
  });

  it("retention レベルが表示される", () => {
    const html = generateArtifactsHtml(mockArtifacts, "/project");

    expect(html).toContain("L3");
    expect(html).toContain("L2");
  });

  it("タスクIDリンクが表示される", () => {
    const html = generateArtifactsHtml(mockArtifacts, "/project");

    expect(html).toContain("#289");
  });

  it("成果物タイプアイコンが表示される", () => {
    const html = generateArtifactsHtml(mockArtifacts, "/project");

    expect(html).toContain("📄"); // ドキュメント
  });

  it("空の場合は「なし」を表示", () => {
    const html = generateArtifactsHtml([], "/project");

    expect(html).toContain("empty-message");
    expect(html).toContain("なし");
  });
});

// === V2.1統計サマリーテスト ===

describe("generateStatsHtml - V2.1統計サマリー", () => {
  it("Task/Work/Step件数が表示される", () => {
    const html = generateStatsHtml(mockStats);

    expect(html).toContain("3"); // taskCount
    expect(html).toContain("🎯"); // Task icon
    expect(html).toContain("12"); // workCount
    expect(html).toContain("📋"); // Work icon
    expect(html).toContain("24"); // stepCount
    expect(html).toContain("⚡"); // Step icon
  });

  it("完了件数が表示される", () => {
    const html = generateStatsHtml(mockStats);

    expect(html).toContain("45"); // completedCount
    expect(html).toContain("✅"); // Completed icon
  });

  it("要対応件数が表示される", () => {
    const html = generateStatsHtml(mockStats);

    expect(html).toContain("stat-card");
    // actionRequiredCount (warning style)
    expect(html).toMatch(/warning[^>]*>.*3/s);
  });

  it("レビュー待ち件数が表示される", () => {
    const html = generateStatsHtml(mockStats);

    expect(html).toContain("4"); // reviewPendingCount
  });

  it("提案件数が表示される", () => {
    const html = generateStatsHtml(mockStats);

    expect(html).toContain("3"); // proposalCount
    expect(html).toContain("💡"); // Proposal icon
  });
});
