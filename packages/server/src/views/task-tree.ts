/**
 * ダッシュボードUI用HTML生成関数 - タスクツリー表示
 *
 * ダッシュボードUI実装
 * - Taskグルーピング表示
 * - Work/Step階層表示
 * - 成果物パネル
 * - 統計サマリーの種別対応
 * - レビューキュー表示
 */

import { escapeHtml } from "../markdown-utils.js";
import { formatDateJstShort, formatRelativeTime } from "../utils/yaml-helper.js";

// === 型定義 ===

export interface Step {
  id: string;
  title: string;
  description?: string;
  type: "step";
  mainStatus: string;
  subStatus: string;
  assignees?: Array<{ agentId: string }>;
  updatedAt?: string;
  hasReport?: boolean;
}

export interface Work {
  id: string;
  title: string;
  description?: string;
  type: "work";
  mainStatus: string;
  subStatus: string;
  reviewStatus?: string;
  assignees?: Array<{ agentId: string }>;
  steps: Step[];
  updatedAt?: string;
  hasReport?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: "task";
  mainStatus: string;
  subStatus: string;
  size?: string;
  reviewStatus?: string;
  assignees: Array<{ agentId: string }>;
  works: Work[];
  // Task階層連動: 子Workの状態から計算された表示用ステータス
  displayStatus?: string;
  displayIcon?: string;
  // V2.1: アーカイブフラグ
  archived?: boolean;
  // V2.1: 更新日時（ソート用）
  updatedAt?: string;
  hasReport?: boolean;
}

// 後方互換エイリアス
export type Goal = Task;
export type Phase = Work;
export type Action = Step;

export interface ReviewTask {
  id: string;
  title: string;
  type: string;
  reviewStatus: string;
  priority: string;
  completedAt: string;
  assignees: Array<{ agentId: string }>;
}

export interface Artifact {
  path: string;
  type: string;
  retention: string;
  taskId: string;
  createdAt: string;
}

export interface Stats {
  taskCount: number;
  workCount: number;
  stepCount: number;
  completedCount: number;
  actionRequiredCount: number;
  reviewPendingCount: number;
  proposalCount: number;
}

// === ステータスアイコン・クラス ===

const STATUS_ICONS: Record<string, string> = {
  pending: "⏸️",
  assigned: "📋",
  working: "🔵",
  checkpoint: "🔶",
  waiting: "⏳",
  completed: "✅",
  archived: "📦",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "status-pending",
  assigned: "status-assigned",
  working: "status-working",
  checkpoint: "status-checkpoint",
  waiting: "status-waiting",
  completed: "status-completed",
  archived: "status-archived",
};

const STATUS_TEXT_JP: Record<string, string> = {
  pending: "未着手",
  working: "進行中",
  completed: "完了",
  checkpoint: "確認待ち",
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
  task: "🎯",
  work: "📋",
  step: "⚡",
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
    // 担当者がいない場合は「担当なし」を表示（スマホでは「－」のみ）
    return `<span class="${className} no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>`;
  }
  const items = assignees
    .filter((a) => a && a.agentId) // undefined/null をスキップ
    .map((a) => {
      const icon = getMaidIcon(a.agentId);
      return `<span class="assignee-item"><span class="assignee-icon">${icon}</span><span class="assignee-name">${escapeHtml(a.agentId)}</span></span>`;
    }).join(" ");
  if (!items) {
    return `<span class="${className} no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>`;
  }
  return `<span class="${className}">${items}</span>`;
}

// === Taskツリー表示 ===

/**
 * Task一覧をツリー形式のHTMLで生成
 */
export function generateTaskTreeHtml(tasks: Task[], projectPath: string): string {
  if (!tasks || tasks.length === 0) {
    return '<div class="empty-message">なし</div>';
  }

  return tasks.map((task) => generateTaskItemHtml(task, projectPath)).join("\n");
}

// 後方互換エイリアス
export const generateGoalTreeHtml = generateTaskTreeHtml;

/**
 * 単一TaskのHTML生成
 */
function generateTaskItemHtml(task: Task, projectPath: string): string {
  // Task階層連動: displayStatus/displayIconがある場合は優先使用
  const statusIcon = task.displayIcon || STATUS_ICONS[task.subStatus] || "❓";
  const statusText = task.displayStatus || STATUS_TEXT_JP[task.subStatus] || task.subStatus;
  const statusClass = STATUS_CLASSES[task.subStatus] || "";
  // 初期状態は全Task折りたたみ（ユーザーが展開する）
  const hasChildren = task.works.length > 0;
  // サブタスク有り: ▼（展開可能）、サブタスク無し: ●（単独タスク）
  const toggleIcon = hasChildren ? "▼" : "●";
  const toggleClass = hasChildren ? "collapsed" : "collapsed no-children";

  // 担当者表示（アイコンとメイド名を分離してスマホ対応）
  const assigneesHtml = generateAssigneesHtml(task.assignees, "task-assignees-inline");
  const reviewBadge = task.reviewStatus ? generateReviewBadgeHtml(task.reviewStatus) : "";
  // 報告書リンク: Taskには統合サマリーへのリンク
  const reportLink = generateReportLinkHtml(task.id, "task", projectPath);

  // アーカイブ関連: クライアントサイド（dashboard-scripts.ts）でのみ生成
  // サーバーサイドでは何も出力しない（重複防止）
  const archiveHtml = "";

  const worksHtml = task.works.length > 0
    ? `<div class="task-content">
        <div class="work-tree">
          ${task.works.map((work) => generateWorkItemHtml(work, projectPath)).join("\n")}
        </div>
      </div>`
    : "";

  return `<div class="task-item" data-id="${escapeHtml(task.id)}" data-status="${task.mainStatus}" data-substatus="${task.subStatus}" data-archived="${task.archived === true || task.subStatus === 'archived'}" data-updated="${task.updatedAt || ""}">
    <div class="task-header">
      <span class="task-toggle ${toggleClass}">${toggleIcon}</span>
      <span class="task-id">#${escapeHtml(task.id)}</span>
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="badge badge-task">Task</span>
      ${task.size ? `<span class="badge badge-size">${escapeHtml(task.size)}</span>` : ""}
      <span class="status ${statusClass}">${statusIcon}<span class="status-text"> ${escapeHtml(statusText)}</span></span>
      ${assigneesHtml}
      ${reviewBadge}
      ${reportLink}
      ${archiveHtml}
    </div>
    ${worksHtml}
  </div>`;
}

/**
 * Work単体のHTML生成
 */
function generateWorkItemHtml(work: Work, projectPath: string): string {
  const statusIcon = STATUS_ICONS[work.subStatus] || "❓";
  const statusClass = STATUS_CLASSES[work.subStatus] || "";
  const reviewBadge = work.reviewStatus ? generateReviewBadgeHtml(work.reviewStatus) : "";
  // 報告書リンク: WorkにはWork別報告書へのリンク
  const reportLink = generateReportLinkHtml(work.id, "work", projectPath);
  // 担当者表示（アイコンとメイド名を分離してスマホ対応）
  const assigneesBadge = generateAssigneesHtml(work.assignees, "work-assignees");

  const stepsHtml = work.steps.length > 0
    ? `<div class="step-list">
        ${work.steps.map((step, idx, arr) =>
          generateStepItemHtml(step, idx === arr.length - 1, projectPath)
        ).join("\n")}
      </div>`
    : "";

  return `<div class="work-item ${work.subStatus === "working" ? "highlight" : ""}" data-id="${escapeHtml(work.id)}">
    <div class="work-header">
      <span class="work-id">#${escapeHtml(work.id)}</span>
      <span class="work-name">[${escapeHtml(work.title)}] Work</span>
      <span class="status ${statusClass}">${statusIcon}<span class="status-text"> ${STATUS_TEXT_JP[work.subStatus] || work.subStatus}</span></span>
      ${assigneesBadge}
      ${reviewBadge}
      ${reportLink}
    </div>
    ${stepsHtml}
  </div>`;
}

/**
 * Step単体のHTML生成
 */
function generateStepItemHtml(step: Step, isLast: boolean, projectPath: string): string {
  const statusClass = step.subStatus === "completed" ? "completed" :
                      step.subStatus === "working" ? "current" : "";
  const icon = isLast ? "└" : "├";
  const statusBadge = step.subStatus === "working"
    ? '<span class="current-marker">← 現在ここ</span>'
    : "";
  const statusIcon = STATUS_ICONS[step.subStatus] || "⏳";
  // 担当者表示（アイコンとメイド名を分離してスマホ対応）
  const assigneesBadge = generateAssigneesHtml(step.assignees, "step-assignees");
  // 報告書リンク: StepにはStep報告書へのリンク
  const reportLink = generateReportLinkHtml(step.id, "step", projectPath);

  return `<div class="step-item ${statusClass}">
    <span class="step-icon">${icon}</span>
    <span class="step-name">#${escapeHtml(step.id)} ${escapeHtml(step.title)}</span>
    <span class="step-status ${step.subStatus}">${statusIcon}<span class="status-text"> ${STATUS_TEXT_JP[step.subStatus] || step.subStatus}</span></span>
    ${assigneesBadge}
    ${reportLink}
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
 * @param taskType タスク種別（task/work/step）
 * @param projectPath プロジェクトパス
 */
function generateReportLinkHtml(taskId: string, taskType: string, projectPath: string): string {
  const titleMap: Record<string, string> = {
    task: "統合サマリーを開く",
    work: "Work報告書を開く",
    step: "Step報告書を開く",
  };
  const title = titleMap[taskType] || "報告書を開く";
  return `<a href="/report?task=${encodeURIComponent(taskId)}&project=${encodeURIComponent(projectPath)}" class="report-link" title="${title}">📄</a>`;
}

// === レビューキュー表示 ===

/**
 * レビューキューのHTMLを生成
 */
export function generateReviewQueueHtml(reviewTasks: ReviewTask[], projectPath: string): string {
  if (!reviewTasks || reviewTasks.length === 0) {
    return '<div class="empty-message">なし</div>';
  }

  return reviewTasks.map((task) => {
    const typeIcon = TYPE_ICONS[task.type] || "📋";
    const priorityClass = task.priority === "high" ? "high" :
                          task.priority === "low" ? "low" : "normal";
    const relativeTime = formatRelativeTime(task.completedAt);

    // タスク詳細情報をBase64エンコード（モーダル表示用）
    const taskInfoJson = JSON.stringify({
      id: task.id,
      title: task.title,
      description: "",
      status: task.reviewStatus || "pending",
      assignees: task.assignees?.map((a) => a.agentId).join(", ") || "",
      updatedAt: task.completedAt || "",
    });
    const taskInfoBase64 = Buffer.from(taskInfoJson, "utf-8").toString("base64");

    return `<div class="review-item" data-id="${escapeHtml(task.id)}">
      <span>${typeIcon}</span>
      <span class="review-priority ${priorityClass}">${task.priority}</span>
      <div style="flex:1">
        <div><span class="task-id-clickable" data-task-info="${taskInfoBase64}">#${escapeHtml(task.id)}</span> [${escapeHtml(task.type.charAt(0).toUpperCase() + task.type.slice(1))}] ${escapeHtml(task.title)}</div>
      </div>
      <span class="action-time">${relativeTime}</span>
    </div>`;
  }).join("\n");
}

// === 成果物パネル ===

/**
 * 成果物一覧のHTMLを生成
 */
export function generateArtifactsHtml(artifacts: Artifact[], projectPath: string): string {
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
export function generateStatsHtml(stats: Stats): string {
  return `<div class="grid grid-stats">
    <div class="stat-card">
      <div class="number">${stats.taskCount}</div>
      <div class="label">🎯 Task</div>
    </div>
    <div class="stat-card">
      <div class="number">${stats.workCount}</div>
      <div class="label">📋 Work</div>
    </div>
    <div class="stat-card">
      <div class="number">${stats.stepCount}</div>
      <div class="label">⚡ Step</div>
    </div>
    <div class="stat-card success">
      <div class="number">${stats.completedCount}</div>
      <div class="label">✅ 完了</div>
    </div>
    <div class="stat-card warning${stats.actionRequiredCount >= 1 ? ' alert' : ''}">
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
