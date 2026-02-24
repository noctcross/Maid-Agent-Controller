/**
 * V2.1 ダッシュボードUI用HTML生成関数
 *
 * Phase 5: ダッシュボードUI実装
 * - Goalグルーピング表示
 * - Phase/Action階層表示
 * - 成果物パネル
 * - 統計サマリーの種別対応
 * - レビューキュー表示
 */

import { escapeHtml } from "../markdown-utils.js";
import { formatDateJstShort, formatRelativeTime } from "../utils/yaml-helper.js";

// === 型定義 ===

export interface V2Action {
  id: string;
  title: string;
  type: "action";
  mainStatus: string;
  v2Substatus: string;
  assignees?: Array<{ agentId: string }>;
}

export interface V2Phase {
  id: string;
  title: string;
  type: "phase";
  mainStatus: string;
  v2Substatus: string;
  reviewStatus?: string;
  assignees?: Array<{ agentId: string }>;
  actions: V2Action[];
}

export interface V2Goal {
  id: string;
  title: string;
  type: "goal";
  mainStatus: string;
  v2Substatus: string;
  size?: string;
  reviewStatus?: string;
  assignees: Array<{ agentId: string }>;
  phases: V2Phase[];
  // Goal階層連動: 子Phaseの状態から計算された表示用ステータス
  displayStatus?: string;
  displayIcon?: string;
  // V2.1: アーカイブフラグ
  archived?: boolean;
  // V2.1: 更新日時（ソート用）
  updatedAt?: string;
}

export interface V2ReviewTask {
  id: string;
  title: string;
  type: string;
  reviewStatus: string;
  priority: string;
  completedAt: string;
  assignees: Array<{ agentId: string }>;
}

export interface V2Artifact {
  path: string;
  type: string;
  retention: string;
  taskId: string;
  createdAt: string;
}

export interface V2Stats {
  goalCount: number;
  phaseCount: number;
  actionCount: number;
  completedCount: number;
  actionRequiredCount: number;
  reviewPendingCount: number;
  proposalCount: number;
}

// === ステータスアイコン・クラス ===

const STATUS_ICONS: Record<string, string> = {
  active: "🔵",
  paused: "⏸️",
  checkpoint: "🔶",
  waiting: "⏳",
  completed: "✅",
  archived: "📦",
  pending: "⏳",
};

const STATUS_CLASSES: Record<string, string> = {
  active: "status-active",
  paused: "status-paused",
  checkpoint: "status-checkpoint",
  waiting: "status-waiting",
  completed: "status-completed",
  archived: "status-archived",
  pending: "status-pending",
};

// メイドアイコンマッピング（settings.yaml より）
const MAID_ICONS: Record<string, string> = {
  emma: "☕",
  sophia: "❄️",
  lily: "🎀",
  rose: "🌹",
  alice: "✨",
  may: "🕊️",
  flora: "🌿",
  luna: "🌙",
};

/**
 * agentId からアイコンを取得
 */
function getMaidIcon(agentId: string | undefined): string {
  if (!agentId) return "👤";
  return MAID_ICONS[agentId.toLowerCase()] || "👤";
}

const TYPE_ICONS: Record<string, string> = {
  goal: "🎯",
  phase: "📋",
  action: "⚡",
  investigation: "🔍",
};

const ARTIFACT_TYPE_ICONS: Record<string, string> = {
  design: "📄",
  mockup: "🎨",
  code: "💻",
  report: "📊",
  research: "🔬",
  default: "📄",
};

// === 担当者表示ヘルパー ===

/**
 * 担当者表示HTMLを生成（アイコンとメイド名を分離してスマホ対応）
 * @param assignees 担当者配列
 * @param className 親要素のクラス名
 * @returns 担当者がいない場合も空のspanを返す（レイアウト揃え用）
 */
function generateAssigneesHtml(assignees: Array<{ agentId: string }> | undefined, className: string): string {
  if (!assignees || assignees.length === 0) {
    // 担当者がいない場合も空のspanを出力してレイアウトを揃える
    return `<span class="${className}"></span>`;
  }
  const items = assignees
    .filter((a) => a && a.agentId) // undefined/null をスキップ
    .map((a) => {
      const icon = getMaidIcon(a.agentId);
      return `<span class="assignee-item"><span class="assignee-icon">${icon}</span><span class="assignee-name">${escapeHtml(a.agentId)}</span></span>`;
    }).join(" ");
  if (!items) {
    return `<span class="${className}"></span>`;
  }
  return `<span class="${className}">${items}</span>`;
}

// === Goalツリー表示 ===

/**
 * Goal一覧をツリー形式のHTMLで生成
 */
export function generateGoalTreeHtml(goals: V2Goal[], projectPath: string): string {
  if (!goals || goals.length === 0) {
    return '<div class="empty-message">なし</div>';
  }

  return goals.map((goal) => generateGoalItemHtml(goal, projectPath)).join("\n");
}

/**
 * 単一GoalのHTML生成
 */
function generateGoalItemHtml(goal: V2Goal, projectPath: string): string {
  // Goal階層連動: displayStatus/displayIconがある場合は優先使用
  const statusIcon = goal.displayIcon || STATUS_ICONS[goal.v2Substatus] || "❓";
  const statusText = goal.displayStatus || goal.v2Substatus;
  const statusClass = STATUS_CLASSES[goal.v2Substatus] || "";
  // 初期状態は全Goal折りたたみ（ユーザーが展開する）
  const isCollapsed = true;
  const toggleClass = "collapsed";

  // 担当者表示（アイコンとメイド名を分離してスマホ対応）
  const assigneesHtml = generateAssigneesHtml(goal.assignees, "goal-assignees-inline");
  const reviewBadge = goal.reviewStatus ? generateReviewBadgeHtml(goal.reviewStatus) : "";
  // 報告書リンク: Goalには統合サマリーへのリンク
  const reportLink = generateReportLinkHtml(goal.id, "goal", projectPath);

  const phasesHtml = goal.phases.length > 0
    ? `<div class="goal-content">
        <div class="phase-tree">
          ${goal.phases.map((phase) => generatePhaseItemHtml(phase, projectPath)).join("\n")}
        </div>
      </div>`
    : "";

  return `<div class="goal-item" data-id="${escapeHtml(goal.id)}" data-status="${goal.mainStatus}" data-substatus="${goal.v2Substatus}" data-archived="${goal.archived === true || goal.v2Substatus === 'archived'}" data-updated="${goal.updatedAt || ""}">
    <div class="goal-header">
      <span class="goal-toggle ${toggleClass}">▼</span>
      <span class="goal-id">#${escapeHtml(goal.id)}</span>
      <span class="goal-title">${escapeHtml(goal.title)}</span>
      <span class="badge badge-goal">Goal</span>
      ${goal.size ? `<span class="badge badge-size">${escapeHtml(goal.size)}</span>` : ""}
      <span class="status ${statusClass}">${statusIcon}<span class="status-text"> ${escapeHtml(statusText)}</span></span>
      ${assigneesHtml}
      ${reviewBadge}
      ${reportLink}
    </div>
    ${phasesHtml}
  </div>`;
}

/**
 * Phase単体のHTML生成
 */
function generatePhaseItemHtml(phase: V2Phase, projectPath: string): string {
  const statusIcon = STATUS_ICONS[phase.v2Substatus] || "❓";
  const statusClass = STATUS_CLASSES[phase.v2Substatus] || "";
  const reviewBadge = phase.reviewStatus ? generateReviewBadgeHtml(phase.reviewStatus) : "";
  // 報告書リンク: PhaseにはPhase別報告書へのリンク
  const reportLink = generateReportLinkHtml(phase.id, "phase", projectPath);
  // 担当者表示（アイコンとメイド名を分離してスマホ対応）
  const assigneesBadge = generateAssigneesHtml(phase.assignees, "phase-assignees");

  const actionsHtml = phase.actions.length > 0
    ? `<div class="action-list">
        ${phase.actions.map((action, idx, arr) =>
          generateActionItemHtml(action, idx === arr.length - 1)
        ).join("\n")}
      </div>`
    : "";

  return `<div class="phase-item ${phase.v2Substatus === "active" ? "highlight" : ""}" data-id="${escapeHtml(phase.id)}">
    <div class="phase-header">
      <span class="phase-id">#${escapeHtml(phase.id)}</span>
      <span class="phase-name">[${escapeHtml(phase.title)}] Phase</span>
      <span class="status ${statusClass}">${statusIcon}<span class="status-text"> ${phase.v2Substatus}</span></span>
      ${assigneesBadge}
      ${reviewBadge}
      ${reportLink}
    </div>
    ${actionsHtml}
  </div>`;
}

/**
 * Action単体のHTML生成
 */
function generateActionItemHtml(action: V2Action, isLast: boolean): string {
  const statusClass = action.v2Substatus === "completed" ? "completed" :
                      action.v2Substatus === "active" ? "current" : "";
  const icon = isLast ? "└" : "├";
  const statusBadge = action.v2Substatus === "active"
    ? '<span class="current-marker">← 現在ここ</span>'
    : "";
  const statusIcon = STATUS_ICONS[action.v2Substatus] || "⏳";
  // 担当者表示（アイコンとメイド名を分離してスマホ対応）
  const assigneesBadge = generateAssigneesHtml(action.assignees, "action-assignees");

  return `<div class="action-item ${statusClass}">
    <span class="action-icon">${icon}</span>
    <span class="action-name">#${escapeHtml(action.id)} ${escapeHtml(action.title)}</span>
    <span class="action-status ${action.v2Substatus}">${statusIcon}<span class="status-text"> ${action.v2Substatus}</span></span>
    ${assigneesBadge}
    ${statusBadge}
  </div>`;
}

/**
 * レビューバッジのHTML生成
 */
function generateReviewBadgeHtml(reviewStatus: string): string {
  if (reviewStatus === "approved") {
    return '<span class="review-status review-approved">✅ レビュー済</span>';
  } else if (reviewStatus === "pending") {
    return '<span class="review-status review-pending">📋 要レビュー</span>';
  } else if (reviewStatus === "rejected") {
    return '<span class="review-status review-rejected">❌ 差し戻し</span>';
  }
  return "";
}

/**
 * 報告書リンクのHTML生成
 * @param taskId タスクID
 * @param taskType タスク種別（goal/phase）
 * @param projectPath プロジェクトパス
 */
function generateReportLinkHtml(taskId: string, taskType: string, projectPath: string): string {
  const title = taskType === "goal" ? "統合サマリーを開く" : "Phase報告書を開く";
  return `<a href="/report?task=${encodeURIComponent(taskId)}&project=${encodeURIComponent(projectPath)}" class="report-link" title="${title}">📄</a>`;
}

// === レビューキュー表示 ===

/**
 * レビューキューのHTMLを生成
 */
export function generateReviewQueueHtml(reviewTasks: V2ReviewTask[], projectPath: string): string {
  if (!reviewTasks || reviewTasks.length === 0) {
    return '<div class="empty-message">なし</div>';
  }

  return reviewTasks.map((task) => {
    const typeIcon = TYPE_ICONS[task.type] || "📋";
    const priorityClass = task.priority === "high" ? "high" :
                          task.priority === "low" ? "low" : "normal";
    const relativeTime = formatRelativeTime(task.completedAt);

    return `<div class="review-item" data-id="${escapeHtml(task.id)}">
      <span>${typeIcon}</span>
      <span class="review-priority ${priorityClass}">${task.priority}</span>
      <div style="flex:1">
        <div>#${escapeHtml(task.id)} [${escapeHtml(task.type.charAt(0).toUpperCase() + task.type.slice(1))}] ${escapeHtml(task.title)}</div>
      </div>
      <span class="action-time">${relativeTime}</span>
    </div>`;
  }).join("\n");
}

// === 成果物パネル ===

/**
 * 成果物一覧のHTMLを生成
 */
export function generateArtifactsHtml(artifacts: V2Artifact[], projectPath: string): string {
  if (!artifacts || artifacts.length === 0) {
    return '<div class="empty-message">なし</div>';
  }

  return artifacts.map((artifact) => {
    const typeIcon = ARTIFACT_TYPE_ICONS[artifact.type] || ARTIFACT_TYPE_ICONS.default;
    const fileName = artifact.path.split("/").pop() || artifact.path;
    const relativeTime = formatRelativeTime(artifact.createdAt);

    return `<div class="artifact-item" data-task-id="${escapeHtml(artifact.taskId)}">
      <span class="artifact-icon">${typeIcon}</span>
      <a href="/file?path=${encodeURIComponent(artifact.path)}&project=${encodeURIComponent(projectPath)}" class="artifact-path">${escapeHtml(fileName)}</a>
      <span class="artifact-retention">${escapeHtml(artifact.retention)}</span>
      <span class="artifact-source">#${escapeHtml(artifact.taskId)} ${relativeTime}</span>
    </div>`;
  }).join("\n");
}

// === V2.1統計サマリー ===

/**
 * V2.1統計サマリーのHTMLを生成
 */
export function generateV2StatsHtml(stats: V2Stats): string {
  return `<div class="grid grid-stats">
    <div class="stat-card">
      <div class="number">${stats.goalCount}</div>
      <div class="label">🎯 Goal</div>
    </div>
    <div class="stat-card">
      <div class="number">${stats.phaseCount}</div>
      <div class="label">📋 Phase</div>
    </div>
    <div class="stat-card">
      <div class="number">${stats.actionCount}</div>
      <div class="label">⚡ Action</div>
    </div>
    <div class="stat-card success">
      <div class="number">${stats.completedCount}</div>
      <div class="label">✅ 完了</div>
    </div>
    <div class="stat-card warning">
      <div class="number">${stats.actionRequiredCount}</div>
      <div class="label">⚠️ 要対応</div>
    </div>
    <div class="stat-card">
      <div class="number">${stats.reviewPendingCount}</div>
      <div class="label">📋 Review</div>
    </div>
    <div class="stat-card info">
      <div class="number">${stats.proposalCount}</div>
      <div class="label">💡 提案</div>
    </div>
  </div>`;
}
