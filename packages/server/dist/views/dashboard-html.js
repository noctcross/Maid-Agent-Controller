/**
 * ダッシュボードHTML生成
 * generateDashboardHtml() - メインダッシュボードのHTML生成
 *
 * CSS/JS/HTMLテンプレートを各モジュールに委譲する形式に変更。
 * - dashboard-styles.ts: CSSスタイル定義
 * - dashboard-scripts.ts: JavaScriptコード
 * - dashboard-template.ts: HTMLボディテンプレート
 */
import { escapeHtml } from "../markdown-utils.js";
import { generateTaskHtml, composeMasterWaitingHtml } from "./task-html.js";
import { getDashboardStyles } from "./dashboard-styles.js";
import { getDashboardHeadScript, getReportOverlayScript, getDashboardScript, } from "./dashboard-scripts.js";
import { getReportOverlayHtml, } from "./dashboard-template.js";
// V2.1: Task階層表示・レビューキュー・成果物・統計
import { generateTaskTreeHtml, generateReviewQueueHtml, generateArtifactsHtml, generateStatsHtml, } from "./task-tree.js";
// メイド名マッピング（日本語表示用）
const MAID_DISPLAY_NAMES = {
    emma: "Emma",
    sophia: "Sophia",
    lily: "Lily",
    rose: "Rose",
    alice: "Alice",
    may: "May",
    flora: "Flora",
    luna: "Luna",
};
// ステータスアイコン・ラベルマッピング
const STATUS_CONFIG = {
    working: { icon: "🔧", label: "作業中", color: "var(--v2-accent-blue)" },
    completed: { icon: "✅", label: "完了", color: "var(--v2-accent-green)" },
    assigned: { icon: "📋", label: "割当済", color: "var(--v2-accent-purple)" },
    blocked: { icon: "⏸", label: "ブロック", color: "var(--v2-accent-orange)" },
    idle: { icon: "💤", label: "待機", color: "var(--v2-text-secondary)" },
    unknown: { icon: "❓", label: "不明", color: "var(--v2-text-secondary)" },
};
/**
 * V2チーム状態セクションのHTML生成
 * 各メイドの現在の状態をカード形式で表示
 */
export function generateTeamStatusHtml(teamStatus) {
    if (!teamStatus || teamStatus.length === 0) {
        return '<div class="empty-message">チーム情報がありません</div>';
    }
    // 経過時間をフォーマット
    const formatElapsedTime = (startedAt) => {
        if (!startedAt)
            return "";
        const start = new Date(startedAt).getTime();
        const now = Date.now();
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60)
            return `${diffMins}m`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
    };
    const agentCards = teamStatus.map((agent) => {
        const displayName = MAID_DISPLAY_NAMES[agent.id] || agent.id;
        const statusConfig = STATUS_CONFIG[agent.status] || STATUS_CONFIG.unknown;
        const taskId = agent.task_id ? `#${agent.task_id.replace("task-", "")}` : "";
        const elapsedTime = agent.started_at ? formatElapsedTime(agent.started_at) : "";
        const taskTitle = agent.task_title ? escapeHtml(agent.task_title) : "";
        // 2行構成レイアウト
        // 行1: 名前 アイコン （右寄せ）経過時間
        // 行2: タスクID タスク名（長い場合は末尾省略）
        return `
      <div class="v2-team-card v2-team-card-${agent.status}" data-agent="${agent.id}">
        <div class="v2-team-row1">
          <span class="v2-team-name">${escapeHtml(displayName)}</span>
          <span class="v2-team-icon">${statusConfig.icon}</span>
          ${elapsedTime ? `<span class="v2-team-elapsed">${elapsedTime}</span>` : ""}
        </div>
        ${taskId ? `
        <div class="v2-team-row2">
          <span class="v2-team-task">[${taskId}]</span>
          ${taskTitle ? `<span class="v2-team-title">${taskTitle}</span>` : ""}
        </div>` : ""}
      </div>`;
    }).join("\n");
    return `<div class="v2-team-grid">${agentCards}</div>`;
}
/**
 * V2検索・絞り込みセクションのHTML生成
 * 検索ボックスと優先度・担当者フィルターを表示
 */
export function generateV2SearchFilterHtml(teamStatus) {
    // 担当者リストを生成（teamStatusから動的に取得 + すべてオプション）
    const assigneeOptions = [
        '<option value="">すべて</option>',
        ...Object.entries(MAID_DISPLAY_NAMES).map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`)
    ].join("\n              ");
    // 1行コンパクトレイアウト: [検索ボックス] [優先度] [担当者] [クリア]
    return `
    <div class="v2-search-filter-row">
      <div class="v2-search-input-wrapper">
        <span class="v2-search-icon">🔍</span>
        <input type="text" id="v2-search-box" class="v2-search-box" placeholder="検索..." />
      </div>
      <select id="v2-priority-filter" class="v2-filter-select" title="優先度">
        <option value="">優先度</option>
        <option value="high">🔴高</option>
        <option value="medium">🟡中</option>
        <option value="low">🟢低</option>
      </select>
      <select id="v2-assignee-filter" class="v2-filter-select" title="担当者">
        <option value="">担当者</option>
        ${Object.entries(MAID_DISPLAY_NAMES).map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join("")}
      </select>
      <button id="v2-filter-clear-btn" class="v2-filter-clear-btn" title="フィルタをクリア">✕</button>
    </div>`;
}
/**
 * ダッシュボードHTMLを生成
 *
 * @param data - ダッシュボードに表示するデータ
 * @param editorScheme - エディタスキーム（デフォルト: "vscode"）
 * @returns 完全なHTML文字列
 */
export function generateDashboardHtml(data, editorScheme = "vscode") {
    const { projectPath, timestamp, pending, working, recentCompleted, completedTotal, masterWaiting, masterReview, skillCandidates, improvements, teamStatus, stats, } = data;
    // バージョン取得（デフォルト: v2）
    const version = data.dashboardVersion || "v2";
    // ステータスアイコンマップ
    const statusIcon = {
        working: "🔧",
        completed: "✅",
        assigned: "📋",
        blocked: "🚫",
        idle: "💤",
        unknown: "❓",
        error: "⚠️",
    };
    // Phase 2: 経過時間計算ヘルパー
    const formatElapsedTime = (startedAt) => {
        if (!startedAt)
            return "";
        const start = new Date(startedAt).getTime();
        const now = Date.now();
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60)
            return `${diffMins}m`;
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
        const taskDesc = agent.task_title
            ? escapeHtml(agent.task_title.substring(0, 30)) +
                (agent.task_title.length > 30 ? "..." : "")
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
        "action_required", // 後方互換（V2.1では actionRequired フラグを使用）
        "skill_candidate",
        "improvement",
    ];
    const filteredPending = pending.filter((task) => {
        // V2.1: actionRequired フラグがtrueのタスクを除外
        if (task.actionRequired)
            return false;
        // 後方互換: 旧カテゴリのタスクを除外
        if (task.category && SPECIAL_CATEGORIES.includes(task.category))
            return false;
        return true;
    });
    // HTML生成を task-html.ts に委譲（初回レンダリングとポーリング更新で同一出力を保証）
    const pendingHtml = generateTaskHtml(filteredPending, "pending", projectPath);
    const workingHtml = generateTaskHtml(working, "working", projectPath);
    const completedHtml = generateTaskHtml(recentCompleted, "completed", projectPath);
    const masterWaitingSectionHtml = composeMasterWaitingHtml(masterWaiting, masterReview, projectPath);
    const skillCandidatesHtml = generateTaskHtml(skillCandidates, "skill_candidate", projectPath);
    const improvementsHtml = generateTaskHtml(improvements, "improvement", projectPath);
    // V2.1: Task階層・レビューキュー・成果物・統計HTML生成
    const v2TasksHtml = data.v2Goals
        ? generateTaskTreeHtml(data.v2Goals, projectPath)
        : "";
    const v2ReviewQueueHtml = data.v2ReviewQueue
        ? generateReviewQueueHtml(data.v2ReviewQueue, projectPath)
        : "";
    const v2ArtifactsHtml = data.v2Artifacts
        ? generateArtifactsHtml(data.v2Artifacts, projectPath)
        : "";
    const v2StatsHtml = data.v2Stats
        ? generateStatsHtml(data.v2Stats)
        : "";
    // WebSocket接続用のCSPホスト生成
    const serverHost = new URL(data.serverUrl).host;
    const cspConnectSrc = `ws://localhost:3100 wss://localhost:3100 http://localhost:3100 https://localhost:3100 ws://127.0.0.1:3100 wss://127.0.0.1:3100 http://127.0.0.1:3100 https://127.0.0.1:3100 ws://${serverHost} wss://${serverHost} http://${serverHost} https://${serverHost}`;
    // スクリプトパラメータ
    const scriptParams = {
        projectPath,
        completedTotal,
        serverUrl: data.serverUrl,
    };
    // テンプレートパラメータ
    const templateParams = {
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
    // V2ダッシュボードボディ
    const bodyContent = `
<body>
  <div class="header">
    <div>
      <h1>📋 Maid Agent Dashboard</h1>
      <div class="project-path">${escapeHtml(projectPath)}</div>
    </div>
    <div class="timestamp">更新: ${timestamp}</div>
  </div>
  <div class="grid">`;
    // V2.1セクションHTML（データがある場合のみ表示）
    const v2SectionsHtml = (data.v2Goals || data.v2ReviewQueue || data.v2Artifacts || data.v2Stats)
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

      <!-- 👥 チーム状態セクション -->
      <div class="card v2-team-status-section" data-section="v2-team-status">
        <div class="card-header collapsible-header">
          <span class="card-title">👥 チーム状態</span>
          <span class="count-badge">${teamStatus.length}</span>
        </div>
        <div class="collapsible-content">
          ${generateTeamStatusHtml(teamStatus)}
        </div>
      </div>

      <!-- 🔍 検索・絞り込みセクション -->
      <div class="card v2-search-filter-section" data-section="v2-search-filter">
        <div class="card-header collapsible-header">
          <span class="card-title">🔍 検索・絞り込み</span>
        </div>
        <div class="collapsible-content">
          ${generateV2SearchFilterHtml(teamStatus)}
        </div>
      </div>

      <!-- 🚨 要対応セクション（常に表示） -->
      <div class="card v2-master-waiting-section card-action-required" data-section="v2-master-waiting">
        <div class="card-header collapsible-header">
          <span class="card-title">🚨 要対応</span>
          <span class="count-badge count-badge-alert">${masterWaiting.length + masterReview.length}</span>
        </div>
        <div class="collapsible-content">
          ${(masterWaiting.length > 0 || masterReview.length > 0) ? masterWaitingSectionHtml : '<div class="empty-message">ご主人様判断待ちのタスクはありません</div>'}
        </div>
      </div>

      ${v2TasksHtml ? `
      <!-- 進行中セクション -->
      <div class="card v2-goals-open-section" data-section="v2-goals-open">
        <div class="card-header collapsible-header">
          <span class="card-title">🔵 進行中</span>
          <span class="count-badge" id="v2-goals-open-count">0</span>
          <div class="v2-goals-pagination-wrapper">
            <div class="inline-pagination" id="v2-goals-open-pagination"></div>
          </div>
          <div class="v2-filter-controls">
            <div class="v2-sort-controls">
              <button id="v2-goals-open-sort-id" class="sort-toggle-btn active" title="タスク番号でソート">#↓</button>
              <button id="v2-goals-open-sort-updated" class="sort-toggle-btn" title="更新日時でソート">📅</button>
            </div>
            <div class="v2-toggle-group" id="v2-goals-open-limit-group">
              <button class="v2-toggle-btn" data-value="5">5</button>
              <button class="v2-toggle-btn active" data-value="10">10</button>
              <button class="v2-toggle-btn" data-value="20">20</button>
            </div>
          </div>
        </div>
        <div class="collapsible-content goal-tree-container" id="v2-goals-open-list">
        </div>
      </div>

      <!-- 完了済みセクション -->
      <div class="card v2-goals-closed-section" data-section="v2-goals-closed">
        <div class="card-header collapsible-header">
          <span class="card-title">✅ 完了済み</span>
          <span class="count-badge" id="v2-goals-closed-count">0</span>
          <div class="v2-goals-pagination-wrapper">
            <div class="inline-pagination" id="v2-goals-closed-pagination"></div>
          </div>
          <div class="v2-filter-controls">
            <label class="v2-filter-checkbox">
              <input type="checkbox" id="v2-goals-show-archived">
              <span>Archived</span>
            </label>
            <div class="v2-sort-controls">
              <button id="v2-goals-closed-sort-id" class="sort-toggle-btn active" title="タスク番号でソート">#↓</button>
              <button id="v2-goals-closed-sort-updated" class="sort-toggle-btn" title="更新日時でソート">📅</button>
            </div>
            <div class="v2-toggle-group" id="v2-goals-closed-limit-group">
              <button class="v2-toggle-btn active" data-value="10">10</button>
              <button class="v2-toggle-btn" data-value="20">20</button>
              <button class="v2-toggle-btn" data-value="50">50</button>
            </div>
          </div>
        </div>
        <div class="collapsible-content goal-tree-container" id="v2-goals-closed-list">
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

      ${ /* 成果物セクション: 運用ルール・UI未実装のため非表示（NOTES.md 2026-02-26 #396-2）
        v2ArtifactsHtml ? `
        <div class="card v2-artifacts-section" data-section="v2-artifacts">
          <div class="card-header collapsible-header">
            <span class="card-title">📄 成果物</span>
            <span class="count-badge">${data.v2Artifacts?.length || 0}</span>
          </div>
          <div class="collapsible-content">
            ${v2ArtifactsHtml}
          </div>
        </div>` : "" */""}

      ${(skillCandidates.length > 0 || improvements.length > 0) ? `
      <!-- スキル候補・改善提案セクション（左右分割） -->
      <div class="v2-skill-improvement-row">
        ${skillCandidates.length > 0 ? `
        <div class="card v2-skill-candidates-section card-skill" data-section="v2-skill-candidates">
          <div class="card-header collapsible-header">
            <span class="card-title">📚 スキル候補</span>
            <span class="count-badge count-badge-purple">${skillCandidates.length}</span>
          </div>
          <div class="collapsible-content">
            ${skillCandidatesHtml}
          </div>
        </div>` : '<div></div>'}
        ${improvements.length > 0 ? `
        <div class="card v2-improvements-section card-improvement" data-section="v2-improvements">
          <div class="card-header collapsible-header">
            <span class="card-title">💡 改善提案</span>
            <span class="count-badge count-badge-orange">${improvements.length}</span>
          </div>
          <div class="collapsible-content">
            ${improvementsHtml}
          </div>
        </div>` : '<div></div>'}
      </div>` : ""}
    </div>`
        : "";
    // gridの閉じタグ
    const gridClose = `</div>`;
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
${v2SectionsHtml}
${gridClose}
${getReportOverlayHtml()}
${getReportOverlayScript()}
${getDashboardScript()}
</body>
</html>`;
}
