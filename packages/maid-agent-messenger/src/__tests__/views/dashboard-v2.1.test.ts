/**
 * Dashboard V2.1 UI テスト
 *
 * Phase 5: ダッシュボードUI実装
 * - Goalグルーピング表示
 * - Phase/Action階層表示
 * - 成果物パネル
 * - 統計サマリーの種別対応
 * - レビューキュー表示
 */

import { describe, it, expect } from "@jest/globals";
import {
  generateGoalTreeHtml,
  generateReviewQueueHtml,
  generateArtifactsHtml,
  generateV2StatsHtml,
  type V2Goal,
  type V2ReviewTask,
  type V2Artifact,
  type V2Stats,
} from "../../views/task-html-v2.js";

// === テストデータ ===

const mockGoals: V2Goal[] = [
  {
    id: "289",
    title: "ダッシュボード構造改善",
    type: "goal",
    mainStatus: "open",
    v2Substatus: "working",
    size: "complex",
    reviewStatus: "pending",
    assignees: [
      { agentId: "emma" },
      { agentId: "sophia" },
    ],
    phases: [
      {
        id: "289-P1",
        title: "調査",
        type: "phase",
        mainStatus: "closed",
        v2Substatus: "completed",
        reviewStatus: "approved",
        actions: [
          {
            id: "289-1",
            title: "要件調査",
            type: "action",
            mainStatus: "closed",
            v2Substatus: "completed",
          },
        ],
      },
      {
        id: "289-P2",
        title: "設計",
        type: "phase",
        mainStatus: "open",
        v2Substatus: "working",
        reviewStatus: "pending",
        actions: [
          {
            id: "289-2",
            title: "設計書作成",
            type: "action",
            mainStatus: "closed",
            v2Substatus: "completed",
          },
          {
            id: "289-3",
            title: "モックアップ作成",
            type: "action",
            mainStatus: "open",
            v2Substatus: "working",
          },
        ],
      },
    ],
  },
  {
    id: "301",
    title: "APIリファクタリング",
    type: "goal",
    mainStatus: "closed",
    v2Substatus: "completed",
    size: "standard",
    reviewStatus: "approved",
    assignees: [{ agentId: "rose" }],
    phases: [],
  },
];

const mockReviewQueue: V2ReviewTask[] = [
  {
    id: "301",
    title: "API設計レビュー",
    type: "phase",
    reviewStatus: "pending",
    priority: "high",
    completedAt: "2026-02-22T08:00:00Z",
    assignees: [{ agentId: "alice" }],
  },
  {
    id: "289",
    title: "ダッシュボード改善",
    type: "goal",
    reviewStatus: "pending",
    priority: "normal",
    completedAt: "2026-02-22T06:00:00Z",
    assignees: [{ agentId: "emma" }],
  },
];

const mockArtifacts: V2Artifact[] = [
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

const mockV2Stats: V2Stats = {
  goalCount: 3,
  phaseCount: 12,
  actionCount: 24,
  completedCount: 45,
  actionRequiredCount: 3,
  reviewPendingCount: 4,
  proposalCount: 3,
};

// === Goalツリー表示テスト ===

describe("generateGoalTreeHtml - Goalグルーピング表示", () => {
  it("Goal一覧が正しく表示される", () => {
    const html = generateGoalTreeHtml(mockGoals, "/project");

    expect(html).toContain("#289");
    expect(html).toContain("ダッシュボード構造改善");
    expect(html).toContain("goal-item");
  });

  it("Goalのステータスバッジが表示される", () => {
    const html = generateGoalTreeHtml(mockGoals, "/project");

    // working Goal
    expect(html).toContain("status-working");
    expect(html).toContain("🔵");
    // completed Goal
    expect(html).toContain("status-completed");
    expect(html).toContain("✅");
  });

  it("Goal配下のPhaseが階層表示される", () => {
    const html = generateGoalTreeHtml(mockGoals, "/project");

    expect(html).toContain("phase-tree");
    expect(html).toContain("289-P1");
    expect(html).toContain("調査");
    expect(html).toContain("289-P2");
    expect(html).toContain("設計");
  });

  it("Phase配下のActionが表示される", () => {
    const html = generateGoalTreeHtml(mockGoals, "/project");

    expect(html).toContain("289-1");
    expect(html).toContain("要件調査");
    expect(html).toContain("289-3");
    expect(html).toContain("モックアップ作成");
  });

  it("レビューステータスバッジが表示される", () => {
    const html = generateGoalTreeHtml(mockGoals, "/project");

    expect(html).toContain("review-pending");
    expect(html).toContain("review-approved");
  });

  it("担当者が表示される", () => {
    const html = generateGoalTreeHtml(mockGoals, "/project");

    expect(html).toContain("emma");
    expect(html).toContain("sophia");
  });

  it("空のGoal配列の場合は「なし」を表示", () => {
    const html = generateGoalTreeHtml([], "/project");

    expect(html).toContain("empty-message");
    expect(html).toContain("なし");
  });

  it("closed/completedのGoalは視覚的に区別される", () => {
    const html = generateGoalTreeHtml(mockGoals, "/project");

    // #301 は completed なので、completed クラスを持つべき
    expect(html).toMatch(/goal-item[^>]*data-status="closed"/);
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

describe("generateV2StatsHtml - V2.1統計サマリー", () => {
  it("Goal/Phase/Action件数が表示される", () => {
    const html = generateV2StatsHtml(mockV2Stats);

    expect(html).toContain("3"); // goalCount
    expect(html).toContain("🎯"); // Goal icon
    expect(html).toContain("12"); // phaseCount
    expect(html).toContain("📋"); // Phase icon
    expect(html).toContain("24"); // actionCount
    expect(html).toContain("⚡"); // Action icon
  });

  it("完了件数が表示される", () => {
    const html = generateV2StatsHtml(mockV2Stats);

    expect(html).toContain("45"); // completedCount
    expect(html).toContain("✅"); // Completed icon
  });

  it("要対応件数が表示される", () => {
    const html = generateV2StatsHtml(mockV2Stats);

    expect(html).toContain("stat-card");
    // actionRequiredCount (warning style)
    expect(html).toMatch(/warning[^>]*>.*3/s);
  });

  it("レビュー待ち件数が表示される", () => {
    const html = generateV2StatsHtml(mockV2Stats);

    expect(html).toContain("4"); // reviewPendingCount
  });

  it("提案件数が表示される", () => {
    const html = generateV2StatsHtml(mockV2Stats);

    expect(html).toContain("3"); // proposalCount
    expect(html).toContain("💡"); // Proposal icon
  });
});
