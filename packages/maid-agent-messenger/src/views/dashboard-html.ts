/**
 * ダッシュボードHTML生成
 * generateDashboardHtml() - メインダッシュボードのHTML生成
 *
 * CSS/JS/HTMLテンプレートを各モジュールに委譲する形式に変更。
 * - dashboard-styles.ts: CSSスタイル定義
 * - dashboard-scripts.ts: JavaScriptコード
 * - dashboard-template.ts: HTMLボディテンプレート
 */

import type { AgentStatus } from "../types/index.js";
import { escapeHtml } from "../markdown-utils.js";
import { generateTaskHtml, composeMasterWaitingHtml } from "./task-html.js";
import { getDashboardStyles } from "./dashboard-styles.js";
import {
  getDashboardHeadScript,
  getDashboardMainScript,
  getReportOverlayScript,
  getV2DashboardScript,
  type DashboardScriptParams,
} from "./dashboard-scripts.js";
import {
  getDashboardBodyTemplate,
  getReportOverlayHtml,
  type DashboardBodyParams,
} from "./dashboard-template.js";
// V2.1: Goal階層表示・レビューキュー・成果物・統計
import {
  generateGoalTreeHtml,
  generateReviewQueueHtml,
  generateArtifactsHtml,
  generateV2StatsHtml,
  type V2Goal,
  type V2ReviewTask,
  type V2Artifact,
  type V2Stats,
} from "./task-html-v2.js";

// DashboardData型定義
export interface DashboardData {
  projectPath: string;
  timestamp: string;
  pending: Array<{
    id: string;
    title: string;
    description: string;
    priority: string;
    createdAt: string;
    updatedAt?: string;
    category?: string;
    actionRequired?: boolean;  // V2.1: 要対応フラグ
  }>;
  working: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    assignees: Array<{ agentId: string }>;
    priority: string;
    startedAt?: string | null;
    updatedAt?: string;
  }>;
  recentCompleted: Array<{
    id: string;
    title: string;
    description: string;
    completedAt: string | null;
    summary: string | null;
    assignees: Array<{ agentId: string }>;
    reportPaths: string[];
    reviewed?: boolean;
    starred?: boolean;
    updatedAt?: string;
  }>;
  completedTotal: number;
  masterWaiting: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    substatus: string | null;
    assignees: Array<{ agentId: string }>;
    priority: string;
    actionRequired?: boolean;  // V2.1: escalation → actionRequired
    actionRequiredAt?: string | null;
  }>;
  masterReview: Array<{
    id: string;
    title: string;
    description: string;
    completedAt: string | null;
    summary: string | null;
    reviewed?: boolean;
  }>;
  skillCandidates: Array<{ id: string; title: string; description: string }>;
  improvements: Array<{ id: string; title: string; description: string }>;
  teamStatus: AgentStatus[];
  stats: {
    pendingCount: number;
    workingCount: number;
    masterWaitingCount: number;
    completedTodayCount: number;
  };
  serverUrl: string; // サーバーの実URL（ポーリング用）
  // V2.1: Goal階層表示用データ（オプション）
  v2Goals?: V2Goal[];
  v2ReviewQueue?: V2ReviewTask[];
  v2Artifacts?: V2Artifact[];
  v2Stats?: V2Stats;
  // V1/V2切り替え（デフォルト: v2）
  dashboardVersion?: "v1" | "v2";
}

/**
 * ダッシュボードHTMLを生成
 *
 * @param data - ダッシュボードに表示するデータ
 * @param editorScheme - エディタスキーム（デフォルト: "vscode"）
 * @returns 完全なHTML文字列
 */
export function generateDashboardHtml(
  data: DashboardData,
  editorScheme: string = "vscode"
): string {
  const {
    projectPath,
    timestamp,
    pending,
    working,
    recentCompleted,
    completedTotal,
    masterWaiting,
    masterReview,
    skillCandidates,
    improvements,
    teamStatus,
    stats,
  } = data;

  // バージョン取得（デフォルト: v2）
  const version = data.dashboardVersion || "v2";

  // ステータスアイコンマップ
  const statusIcon: Record<string, string> = {
    working: "🔧",
    completed: "✅",
    assigned: "📋",
    blocked: "🚫",
    idle: "💤",
    unknown: "❓",
    error: "⚠️",
  };

  // Phase 2: 経過時間計算ヘルパー
  const formatElapsedTime = (startedAt: string | null | undefined): string => {
    if (!startedAt) return "";
    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  // チームステータスHTML生成（Phase 2: 詳細化）
  const teamStatusHtml = teamStatus
    .map((agent) => {
      const icon = statusIcon[agent.status] || "❓";
      const taskInfo = agent.task_id ? `[${agent.task_id}]` : "";
      const elapsedTime = agent.started_at
        ? formatElapsedTime(agent.started_at)
        : "";
      const taskDesc = agent.task_description
        ? escapeHtml(agent.task_description.substring(0, 30)) +
          (agent.task_description.length > 30 ? "..." : "")
        : "";
      const substatusInfo = agent.substatus
        ? `<span class="agent-substatus">⚠️ ${escapeHtml(agent.substatus)}</span>`
        : "";

      return `<div class="agent-status agent-${agent.status}" data-agent="${agent.id}" title="${taskDesc}">
        <div class="agent-row-top">
          <span class="agent-icon">${icon}</span>
          <span class="agent-name">${agent.id}</span>
          ${elapsedTime ? `<span class="agent-elapsed">${elapsedTime}</span>` : ""}
        </div>
        ${taskInfo ? `<div class="agent-row-mid">${taskInfo}</div>` : ""}
        ${substatusInfo}
        ${taskDesc ? `<div class="agent-task-desc">${taskDesc}</div>` : ""}
      </div>`;
    })
    .join("\n");

  // 待機中タスク（特殊カテゴリは専用セクションに表示するため除外）
  // V2.1: action_required は actionRequired フラグに移行済み
  // 後方互換: 旧カテゴリのデータも除外
  const SPECIAL_CATEGORIES = [
    "action_required",  // 後方互換（V2.1では actionRequired フラグを使用）
    "skill_candidate",
    "improvement",
  ];
  const filteredPending = pending.filter((task) => {
    // V2.1: actionRequired フラグがtrueのタスクを除外
    if (task.actionRequired) return false;
    // 後方互換: 旧カテゴリのタスクを除外
    if (task.category && SPECIAL_CATEGORIES.includes(task.category)) return false;
    return true;
  });

  // HTML生成を task-html.ts に委譲（初回レンダリングとポーリング更新で同一出力を保証）
  const pendingHtml = generateTaskHtml(filteredPending, "pending", projectPath);
  const workingHtml = generateTaskHtml(working, "working", projectPath);
  const completedHtml = generateTaskHtml(
    recentCompleted,
    "completed",
    projectPath
  );
  const masterWaitingSectionHtml = composeMasterWaitingHtml(
    masterWaiting,
    masterReview,
    projectPath
  );
  const skillCandidatesHtml = generateTaskHtml(
    skillCandidates,
    "skill_candidate",
    projectPath
  );
  const improvementsHtml = generateTaskHtml(
    improvements,
    "improvement",
    projectPath
  );

  // V2.1: Goal階層・レビューキュー・成果物・統計HTML生成
  const v2GoalsHtml = data.v2Goals
    ? generateGoalTreeHtml(data.v2Goals, projectPath)
    : "";
  const v2ReviewQueueHtml = data.v2ReviewQueue
    ? generateReviewQueueHtml(data.v2ReviewQueue, projectPath)
    : "";
  const v2ArtifactsHtml = data.v2Artifacts
    ? generateArtifactsHtml(data.v2Artifacts, projectPath)
    : "";
  const v2StatsHtml = data.v2Stats
    ? generateV2StatsHtml(data.v2Stats)
    : "";

  // WebSocket接続用のCSPホスト生成
  const serverHost = new URL(data.serverUrl).host;
  const cspConnectSrc = `ws://localhost:3100 wss://localhost:3100 http://localhost:3100 https://localhost:3100 ws://127.0.0.1:3100 wss://127.0.0.1:3100 http://127.0.0.1:3100 https://127.0.0.1:3100 ws://${serverHost} wss://${serverHost} http://${serverHost} https://${serverHost}`;

  // スクリプトパラメータ
  const scriptParams: DashboardScriptParams = {
    projectPath,
    completedTotal,
    serverUrl: data.serverUrl,
  };

  // テンプレートパラメータ
  const templateParams: DashboardBodyParams = {
    projectPath,
    timestamp,
    stats,
    teamStatusHtml,
    masterWaitingCount: masterWaiting.length + masterReview.length,
    masterWaitingSectionHtml,
    filteredPendingCount: filteredPending.length,
    pendingHtml,
    workingCount: working.length,
    workingHtml,
    completedTotal,
    completedHtml,
    skillCandidatesCount: skillCandidates.length,
    skillCandidatesHtml,
    improvementsCount: improvements.length,
    improvementsHtml,
  };

  // V1/V2表示切り替え
  const showV1Sections = version === "v1";
  const showV2Sections = version === "v2";

  // バージョン切り替えリンク
  const versionSwitchLink = version === "v1"
    ? `<a href="/dashboard?project=${encodeURIComponent(projectPath)}&version=v2" class="version-switch-link">V2に切り替え</a>`
    : `<a href="/dashboard?project=${encodeURIComponent(projectPath)}&version=v1" class="version-switch-link">V1に切り替え（レガシー）</a>`;

  // V1ボディ（従来型表示）またはV2用ヘッダー
  const bodyContent = showV1Sections
    ? getDashboardBodyTemplate(templateParams)
    : `
<body>
  <div class="header">
    <div>
      <h1>📋 Maid Agent Dashboard</h1>
      <div class="project-path">${escapeHtml(projectPath)}</div>
      ${versionSwitchLink}
    </div>
    <div class="timestamp">更新: ${timestamp}</div>
  </div>
  <div class="grid">`;

  // V2.1セクションHTML（V2表示時かつデータがある場合のみ表示）
  const v2SectionsHtml = showV2Sections && (data.v2Goals || data.v2ReviewQueue || data.v2Artifacts || data.v2Stats)
    ? `
    <!-- V2.1: Goal階層・レビューキュー・成果物セクション -->
    <div class="v2-sections" style="grid-column: 1 / -1; margin-top: 1rem;">
      ${v2StatsHtml ? `
      <div class="card v2-stats-section" data-section="v2-stats">
        <div class="card-header">
          <span class="card-title">📊 V2.1 統計</span>
        </div>
        ${v2StatsHtml}
      </div>` : ""}

      ${v2GoalsHtml ? `
      <div class="card v2-goals-section" data-section="v2-goals">
        <div class="card-header collapsible-header">
          <span class="card-title">🎯 Goal階層</span>
          <span class="count-badge" id="v2-goals-count">${data.v2Goals?.length || 0}</span>
          <div class="v2-goals-pagination-wrapper">
            <div class="inline-pagination" id="v2-goals-pagination"></div>
          </div>
          <div class="v2-filter-controls">
            <div class="v2-toggle-group" id="v2-goals-status-group">
              <button class="v2-toggle-btn active" data-value="open">Open</button>
              <button class="v2-toggle-btn" data-value="closed">Closed</button>
              <button class="v2-toggle-btn" data-value="all">All</button>
            </div>
            <label class="v2-filter-checkbox">
              <input type="checkbox" id="v2-goals-show-archived">
              <span>Archived</span>
            </label>
            <div class="v2-sort-controls">
              <button id="v2-goals-sort-id" class="sort-toggle-btn active" title="タスク番号でソート">#↓</button>
              <button id="v2-goals-sort-updated" class="sort-toggle-btn" title="更新日時でソート">📅</button>
            </div>
            <div class="v2-toggle-group" id="v2-goals-limit-group">
              <button class="v2-toggle-btn active" data-value="10">10</button>
              <button class="v2-toggle-btn" data-value="20">20</button>
              <button class="v2-toggle-btn" data-value="50">50</button>
              <button class="v2-toggle-btn" data-value="100">100</button>
            </div>
          </div>
        </div>
        <div class="collapsible-content goal-tree-container" id="v2-goals-list">
          ${v2GoalsHtml}
        </div>
      </div>` : ""}

      ${v2ReviewQueueHtml ? `
      <div class="card v2-review-section" data-section="v2-review">
        <div class="card-header collapsible-header">
          <span class="card-title">📋 レビューキュー</span>
          <span class="count-badge count-badge-alert">${data.v2ReviewQueue?.length || 0}</span>
        </div>
        <div class="collapsible-content">
          ${v2ReviewQueueHtml}
        </div>
      </div>` : ""}

      ${v2ArtifactsHtml ? `
      <div class="card v2-artifacts-section" data-section="v2-artifacts">
        <div class="card-header collapsible-header">
          <span class="card-title">📄 成果物</span>
          <span class="count-badge">${data.v2Artifacts?.length || 0}</span>
        </div>
        <div class="collapsible-content">
          ${v2ArtifactsHtml}
        </div>
      </div>` : ""}
    </div>`
    : "";

  // V1モード用バージョン切り替えリンク（V2モードはヘッダー内に含まれる）
  const v1VersionSwitchHtml = showV1Sections
    ? `<div class="version-switch-container">${versionSwitchLink}</div>`
    : "";

  // V2モードのgrid閉じタグ（V1モードはgetDashboardBodyTemplateに含まれる）
  const v2GridClose = showV2Sections ? `</div>` : "";

  // HTML構築（各モジュールに委譲）
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' ${cspConnectSrc}; img-src data: http: https:;">
  <title>Maid Agent Dashboard</title>
  <style>
${getDashboardStyles()}
  </style>
${getDashboardHeadScript(scriptParams)}
</head>
${bodyContent}
${v1VersionSwitchHtml}
${v2SectionsHtml}
${v2GridClose}
${getReportOverlayHtml()}
${getDashboardMainScript(scriptParams)}
${getReportOverlayScript()}
${getV2DashboardScript()}
</body>
</html>`;
}
