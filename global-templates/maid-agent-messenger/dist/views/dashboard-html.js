/**
 * ダッシュボードHTML生成
 * generateDashboardHtml() - メインダッシュボードのHTML生成
 */
import { escapeHtml } from "../markdown-utils.js";
import { generateTaskHtml, composeMasterWaitingHtml } from "./task-html.js";
export function generateDashboardHtml(data, editorScheme = "vscode") {
    const { projectPath, timestamp, pending, working, recentCompleted, completedTotal, masterWaiting, masterReview, skillCandidates, improvements, teamStatus, stats } = data;
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
        const elapsedTime = agent.started_at ? formatElapsedTime(agent.started_at) : "";
        const taskDesc = agent.task_description ? escapeHtml(agent.task_description.substring(0, 30)) + (agent.task_description.length > 30 ? "..." : "") : "";
        const substatusInfo = agent.substatus ? `<span class="agent-substatus">⚠️ ${escapeHtml(agent.substatus)}</span>` : "";
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
    const SPECIAL_CATEGORIES = ["action_required", "skill_candidate", "improvement"];
    const filteredPending = pending.filter((task) => !task.category || !SPECIAL_CATEGORIES.includes(task.category));
    // HTML生成を task-html.ts に委譲（初回レンダリングとポーリング更新で同一出力を保証）
    const pendingHtml = generateTaskHtml(filteredPending, "pending", projectPath);
    const workingHtml = generateTaskHtml(working, "working", projectPath);
    const completedHtml = generateTaskHtml(recentCompleted, "completed", projectPath);
    const masterWaitingSectionHtml = composeMasterWaitingHtml(masterWaiting, masterReview, projectPath);
    const skillCandidatesHtml = generateTaskHtml(skillCandidates, "skill_candidate", projectPath);
    const improvementsHtml = generateTaskHtml(improvements, "improvement", projectPath);
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maid Agent Dashboard</title>
  <style>
    :root {
      --bg-color: #1e1e1e;
      --card-bg: #252526;
      --border-color: #3c3c3c;
      --text-color: #cccccc;
      --text-muted: #808080;
      --accent-color: #569cd6;
      --success-color: #4ec9b0;
      --warning-color: #dcdcaa;
      --error-color: #f14c4c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      background: var(--bg-color);
      color: var(--text-color);
      padding: 20px;
      min-height: 100vh;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    .header h1 { font-size: 1.2rem; }
    .header .timestamp { color: var(--text-muted); font-size: 0.8rem; }
    .project-path { color: var(--text-muted); font-size: 0.7rem; margin-top: 3px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
    @media (max-width: 500px) { .grid { grid-template-columns: 1fr; gap: 6px; } }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      overflow: hidden;
      min-width: 0;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--border-color);
    }
    .card-title { font-size: 0.95rem; font-weight: 600; }
    .card-count { background: var(--accent-color); color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.75rem; }
    .task-item {
      padding: 5px 8px;
      margin: 3px 0;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 0.85rem;
    }
    .task-id { color: var(--accent-color); font-weight: 500; min-width: 35px; flex-shrink: 0; }
    .task-title { flex: 1; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .task-desc { flex: 1; color: var(--text-muted); font-size: 0.8rem; }
    .task-priority { color: var(--text-muted); font-size: 0.7rem; flex-shrink: 0; }
    .task-assignee { color: var(--success-color); font-size: 0.7rem; flex-shrink: 0; }
    .task-status { color: var(--warning-color); font-size: 0.7rem; }
    .task-date { color: var(--text-muted); font-size: 0.7rem; flex-shrink: 0; }
    .task-summary-text { color: var(--success-color); }
    .priority-high { border-left: 3px solid var(--error-color); }
    .priority-medium { border-left: 3px solid var(--warning-color); }
    .priority-low { border-left: 3px solid var(--text-muted); }
    .completed { opacity: 0.7; }
    .completed.reviewed { opacity: 0.5; }
    .task-actions { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
    .task-action-btn { background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 0.85rem; opacity: 0.5; transition: opacity 0.2s; line-height: 1; }
    .task-action-btn:hover { opacity: 1; }
    .task-action-btn.active { opacity: 1; }
    .task-action-btn.review-btn.active { color: var(--success-color); }
    .task-action-btn.star-btn.active { color: #f5c542; }
    .completed-count-toggle { cursor: pointer; user-select: none; transition: background 0.2s; }
    .completed-count-toggle:hover { background: rgba(86, 156, 214, 0.3); }
    .pagination-controls { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 6px 0; font-size: 0.75rem; color: var(--text-muted); }
    .pagination-controls:empty { display: none; }
    .pagination-btn { background: rgba(255,255,255,0.08); border: 1px solid var(--border-color); color: var(--text-color); cursor: pointer; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; }
    .pagination-btn:hover { background: rgba(255,255,255,0.15); }
    .pagination-btn:disabled { opacity: 0.3; cursor: default; }
    .pagination-info { color: var(--text-muted); }
    /* 完了セクション: ヘッダーインライン配置（左:タイトル+件数、中央:ページネーション、右:フィルタ） */
    .completed-header-row { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; width: 100%; }
    .completed-header-left { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .completed-header-center { flex: 1; display: flex; justify-content: center; }
    .completed-header-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .completed-filter-group { display: flex; align-items: center; gap: 4px; }
    .sort-toggle-group { display: flex; gap: 3px; margin-left: auto; }
    .sort-toggle-btn { background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); color: var(--text-muted); cursor: pointer; padding: 1px 6px; border-radius: 3px; font-size: 0.68rem; transition: all 0.15s; user-select: none; }
    .sort-toggle-btn:hover { background: rgba(255,255,255,0.12); }
    .sort-toggle-btn.active { background: rgba(86, 156, 214, 0.2); border-color: var(--accent-color); color: var(--accent-color); }
    .filter-toggle-btn { background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); color: var(--text-muted); cursor: pointer; padding: 2px 7px; border-radius: 4px; font-size: 0.7rem; transition: all 0.15s; user-select: none; }
    .filter-toggle-btn:hover { background: rgba(255,255,255,0.12); }
    .filter-toggle-btn.filter-yes { background: rgba(76,175,80,0.2); border-color: var(--success-color); color: var(--success-color); }
    .filter-toggle-btn.filter-no { background: rgba(244,67,54,0.15); border-color: #f44336; color: #f44336; }
    .inline-pagination { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--text-muted); }
    .inline-pagination .pagination-btn { padding: 1px 6px; font-size: 0.7rem; }
    .empty-message { color: var(--text-muted); font-style: italic; padding: 6px; }
    .team-section { grid-column: 1 / -1; }
    .team-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
    @media (max-width: 600px) { .team-grid { grid-template-columns: repeat(2, 1fr); } }
    .agent-status {
      display: flex;
      flex-direction: column;
      padding: 4px 7px;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      font-size: 0.8rem;
      overflow: hidden;
    }
    .agent-row-top { display: flex; align-items: center; gap: 4px; }
    .agent-icon { font-size: 0.85rem; flex-shrink: 0; }
    .agent-name { font-weight: 500; }
    .agent-row-mid { color: var(--accent-color); font-size: 0.7rem; padding-left: 1px; }
    .agent-working { background: rgba(78, 201, 176, 0.1); border: 1px solid var(--success-color); }
    .agent-completed { background: rgba(86, 156, 214, 0.1); border: 1px solid var(--accent-color); }
    .agent-blocked { background: rgba(241, 76, 76, 0.1); border: 1px solid var(--error-color); }
    /* Phase 1: 特殊カテゴリ・blocked用スタイル */
    .special-section { grid-column: 1 / -1; }
    .special-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 768px) { .special-grid { grid-template-columns: 1fr; } }
    /* モバイル対応: 500px以下でフィルタUIを縦並びに変更 */
    @media (max-width: 500px) {
      .controls-section {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .filter-group {
        width: 100%;
        justify-content: space-between;
      }
      .filter-group .filter-select {
        flex: 1;
        min-width: 0;
      }
      .completed-header-row {
        flex-wrap: wrap;
        gap: 4px;
      }
      .completed-header-left {
        width: 100%;
        justify-content: flex-start;
      }
      .completed-header-center {
        flex-shrink: 1;
        min-width: 0;
      }
      .completed-header-right {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
        flex-shrink: 0;
      }
      .sort-toggle-group,
      .completed-filter-group {
        display: flex;
        gap: 3px;
        flex-shrink: 0;
      }
    }
    .card-action-required { border-left: 3px solid var(--error-color); }
    .card-blocked { border-left: 3px solid #ff6b6b; }
    .card-skill { border-left: 3px solid #9b59b6; }
    .card-improvement { border-left: 3px solid #f39c12; }
    .action-required-item { border-left: 3px solid var(--error-color); }
    .blocked-item { border-left: 3px solid #ff6b6b; }
    .skill-item { border-left: 3px solid #9b59b6; }
    .improvement-item { border-left: 3px solid #f39c12; }
    .task-main-row { display: flex; gap: 8px; align-items: center; width: 100%; }
    .task-right-group { display: flex; gap: 6px; align-items: center; margin-left: auto; flex-shrink: 0; }
    .task-summary { color: var(--success-color); font-size: 0.8rem; margin-top: 3px; padding-left: 50px; font-style: italic; }
    .task-substatus { color: var(--warning-color); font-size: 0.8rem; margin-top: 3px; padding-left: 50px; }
    .task-substatus-inline { color: var(--warning-color); font-size: 0.75rem; }
    .count-badge { background: var(--accent-color); color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.75rem; }
    .count-badge-alert { background: var(--error-color); }
    .count-badge-warning { background: #ff6b6b; }
    .count-badge-purple { background: #9b59b6; }
    .count-badge-orange { background: #f39c12; }
    .subsection-header { color: var(--text-muted); font-size: 0.8rem; font-weight: 600; padding: 6px 0 3px; margin-top: 8px; border-bottom: 1px solid var(--border-color); }
    .subsection-header:first-child { margin-top: 0; }
    .collapsible-header { cursor: pointer; user-select: none; }
    .collapsible-header:hover { opacity: 0.8; }
    .collapsible-content { }
    /* Phase 2: 統計セクション */
    .stats-section { grid-column: 1 / -1; }
    .stats-grid { display: flex; gap: 10px; flex-wrap: wrap; }
    .stat-item {
      flex: 1;
      min-width: 80px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      text-align: center;
    }
    .stat-value { font-size: 1.4rem; font-weight: 700; color: var(--accent-color); }
    .stat-label { font-size: 0.75rem; color: var(--text-muted); margin-top: 3px; }
    .stat-pending .stat-value { color: var(--warning-color); }
    .stat-working .stat-value { color: var(--success-color); }
    .stat-blocked .stat-value { color: var(--error-color); }
    .stat-completed .stat-value { color: var(--accent-color); }
    /* Phase 2: チーム詳細化 */
    .agent-elapsed { color: var(--text-muted); font-size: 0.65rem; margin-left: auto; flex-shrink: 0; }
    .agent-substatus { color: var(--warning-color); font-size: 0.65rem; margin-top: 1px; }
    .agent-task-desc { color: var(--text-muted); font-size: 0.65rem; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* Phase 2: ホバー詳細 */
    .task-item { position: relative; cursor: pointer; flex-wrap: wrap; min-width: 0; }
    .task-item:hover { background: rgba(255,255,255,0.08); }
    .task-detail { display: none; width: 100%; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color); font-size: 0.8rem; }
    .task-item.expanded .task-detail { display: block; }
    .task-detail-row { display: flex; gap: 8px; margin: 3px 0; }
    .task-detail-label { color: var(--text-muted); min-width: 70px; }
    .task-detail-value { color: var(--text-color); word-break: break-word; overflow-wrap: break-word; }
    .task-report-links { display: flex; gap: 6px; flex-wrap: wrap; }
    .report-link { color: var(--accent-color); text-decoration: none; padding: 1px 5px; background: rgba(86, 156, 214, 0.1); border-radius: 3px; font-size: 0.75rem; }
    .report-link:hover { background: rgba(86, 156, 214, 0.2); text-decoration: underline; }
    .path-link { color: var(--accent-color); text-decoration: none; border-bottom: 1px dotted var(--accent-color); cursor: pointer; }
    .path-link:hover { text-decoration: underline; background: rgba(86, 156, 214, 0.1); }
    /* Phase 3: フィルタ/検索 */
    .controls-section { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .search-box {
      flex: 1;
      min-width: 150px;
      padding: 5px 10px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-color);
      font-size: 0.8rem;
    }
    .search-box:focus { outline: none; border-color: var(--accent-color); }
    .filter-group { display: flex; gap: 6px; align-items: center; }
    .filter-label { color: var(--text-muted); font-size: 0.8rem; }
    .filter-select {
      padding: 4px 8px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-color);
      font-size: 0.8rem;
    }
    .filter-select:focus { outline: none; border-color: var(--accent-color); }
    /* Phase 3: タブ切り替え */
    .tabs { display: flex; gap: 4px; margin-bottom: 10px; }
    .tab-btn {
      padding: 5px 12px;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.2s;
    }
    .tab-btn:hover { background: rgba(255,255,255,0.05); }
    .tab-btn.active { background: var(--accent-color); color: white; border-color: var(--accent-color); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    /* アニメーション */
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    /* レポートオーバーレイ */
    .report-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      z-index: 1000;
      overflow-y: auto;
      padding: 16px;
    }
    .report-overlay.visible { display: block; }
    .report-overlay-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--accent-color);
    }
    .report-overlay-header h2 { color: var(--accent-color); margin: 0; font-size: 1.1em; }
    .report-close-btn {
      background: rgba(255,255,255,0.1);
      color: white;
      border: 1px solid rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .report-close-btn:hover { background: rgba(255,255,255,0.2); }
    .report-overlay-content {
      background: rgba(0,0,0,0.3);
      border-radius: 8px;
      padding: 16px;
      line-height: 1.6;
    }
    .report-overlay-content .md-h1 { font-size: 1.4em; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; margin: 16px 0 12px 0; }
    .report-overlay-content .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
    .report-overlay-content .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
    .report-overlay-content .md-p { margin: 8px 0; }
    .report-overlay-content .md-ul { margin: 6px 0; padding-left: 25px; }
    .report-overlay-content .md-li { margin: 4px 0; list-style-type: disc; }
    .report-overlay-content .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    .report-overlay-content .md-table th, .report-overlay-content .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
    .report-overlay-content .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
    .report-overlay-content .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
    .report-overlay-content .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
    .report-overlay-content strong { color: #ffc107; }
  </style>
  <script>
    // VSCode Webview APIは1回しか呼べないため、初回に取得してキャッシュ
    var _vscodeApi = null;
    try {
      if (typeof acquireVsCodeApi !== 'undefined') {
        _vscodeApi = acquireVsCodeApi();
      }
    } catch (e) {}

    // VSCode Webview用: ファイルをプレビュー付きで開く
    // ブラウザでは通常のリンク動作（/file?path=...）にフォールバック
    function openFile(element, filePath) {
      if (_vscodeApi) {
        _vscodeApi.postMessage({ command: 'openFile', path: filePath });
        return false; // リンクのデフォルト動作をキャンセル
      }
      // ブラウザの場合は通常のリンク動作（/file?path=...）
      return true;
    }

    function toggleReview(event, taskId, newValue) {
      event.stopPropagation();
      if (_vscodeApi) {
        _vscodeApi.postMessage({ command: 'toggleReview', taskId: taskId, reviewed: newValue });
      } else {
        fetch('/dashboard/tasks/' + taskId + '/review', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': '${escapeHtml(projectPath)}' },
          body: JSON.stringify({ reviewed: newValue })
        }).then(function() {
          // サーバーサイドフィルタで現在ページを再取得
          requestCompletedPage();
        });
      }
    }

    function toggleStar(event, taskId, newValue) {
      event.stopPropagation();
      if (_vscodeApi) {
        _vscodeApi.postMessage({ command: 'toggleStar', taskId: taskId, starred: newValue });
      } else {
        fetch('/dashboard/tasks/' + taskId + '/star', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': '${escapeHtml(projectPath)}' },
          body: JSON.stringify({ starred: newValue })
        }).then(function() {
          // サーバーサイドフィルタで現在ページを再取得
          requestCompletedPage();
        });
      }
    }

    // ソート状態管理
    var sortState = { pending: 'id', working: 'id', completed: 'id' };

    function toggleSort(section, sortBy) {
      sortState[section] = sortBy;
      // ボタンのアクティブ状態を更新
      var buttons = document.querySelectorAll('.sort-toggle-btn[data-section="' + section + '"]');
      buttons.forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.sort === sortBy);
      });
      // 完了セクションはサーバーサイドソート
      if (section === 'completed') {
        completedCurrentPage = 0;
        requestCompletedPage();
        return;
      }
      // 待機中・進行中はクライアントサイドソート
      sortTaskItems(section, sortBy);
    }

    function sortTaskItems(section, sortBy) {
      var sectionEl = document.querySelector('[data-section="' + section + '"]');
      if (!sectionEl) return;
      var items = Array.from(sectionEl.querySelectorAll('.task-item'));
      if (items.length === 0) return;
      var parent = items[0].parentNode;
      items.sort(function(a, b) {
        if (sortBy === 'id') {
          return compareTaskIds(b.dataset.id || '', a.dataset.id || '');
        } else {
          var aTime = a.dataset.updated || '';
          var bTime = b.dataset.updated || '';
          return bTime.localeCompare(aTime);
        }
      });
      items.forEach(function(item) { parent.appendChild(item); });
    }

    function compareTaskIds(a, b) {
      var partsA = a.split('-');
      var partsB = b.split('-');
      for (var i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        var pa = i < partsA.length ? parseInt(partsA[i], 10) : -1;
        var pb = i < partsB.length ? parseInt(partsB[i], 10) : -1;
        if (isNaN(pa)) pa = -1;
        if (isNaN(pb)) pb = -1;
        if (pa !== pb) return pa - pb;
      }
      return 0;
    }

    // Part 2: 表示件数トグル（セッション中のみ保持）
    var COMPLETED_LIMIT_OPTIONS = [5, 10, 20, 100];
    var COMPLETED_LIMIT_DEFAULT_INDEX = 1; // 初期値: 10
    var completedLimitIndex = COMPLETED_LIMIT_DEFAULT_INDEX;
    var completedCurrentPage = 0;

    function getCompletedLimit() {
      return COMPLETED_LIMIT_OPTIONS[completedLimitIndex];
    }

    function toggleCompletedLimit() {
      completedLimitIndex = (completedLimitIndex + 1) % COMPLETED_LIMIT_OPTIONS.length;
      completedCurrentPage = 0;
      // カウントバッジにリミット表示（totalは requestCompletedPage で更新される）
      var badge = document.querySelector('.completed-count-toggle');
      if (badge) {
        badge.textContent = getCompletedLimit() + '件表示 (' + completedTotalForPagination + ')';
      }
      requestCompletedPage();
    }

    // Part 2.5: チェック・スターフィルター（3状態トグル: all → yes → no → all）
    // 状態: 'all' | 'yes' | 'no'
    var completedFilterReview = 'all';
    var completedFilterStar = 'all';
    var FILTER_CYCLE = ['all', 'yes', 'no'];

    function cycleFilter(type) {
      if (type === 'review') {
        var idx = FILTER_CYCLE.indexOf(completedFilterReview);
        completedFilterReview = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
      } else {
        var idx = FILTER_CYCLE.indexOf(completedFilterStar);
        completedFilterStar = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
      }
      completedCurrentPage = 0;
      updateFilterButtons();
      hideCompletedNewBadge();
      requestCompletedPage();
    }

    function updateFilterButtons() {
      var reviewBtn = document.getElementById('filterReviewBtn');
      var starBtn = document.getElementById('filterStarBtn');
      if (reviewBtn) {
        reviewBtn.className = 'filter-toggle-btn' + (completedFilterReview === 'yes' ? ' filter-yes' : completedFilterReview === 'no' ? ' filter-no' : '');
        reviewBtn.textContent = completedFilterReview === 'yes' ? '✔あり' : completedFilterReview === 'no' ? '✔なし' : '✔すべて';
      }
      if (starBtn) {
        starBtn.className = 'filter-toggle-btn' + (completedFilterStar === 'yes' ? ' filter-yes' : completedFilterStar === 'no' ? ' filter-no' : '');
        starBtn.textContent = completedFilterStar === 'yes' ? '★あり' : completedFilterStar === 'no' ? '★なし' : '★すべて';
      }
    }

    function isCompletedDefaultView() {
      return completedCurrentPage === 0
        && completedFilterReview === 'all'
        && completedFilterStar === 'all'
        && completedLimitIndex === COMPLETED_LIMIT_DEFAULT_INDEX;
    }

    function showCompletedNewBadge() {
      var badge = document.querySelector('.completed-new-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'completed-new-badge';
        badge.textContent = '新着あり';
        badge.style.cssText = 'background:#ff9800;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;margin-left:8px;cursor:pointer;';
        badge.onclick = function() {
          completedCurrentPage = 0;
          completedFilterReview = 'all';
          completedFilterStar = 'all';
          updateFilterButtons();
          requestCompletedPage();
          badge.remove();
        };
        var header = document.querySelector('.completed-header-row');
        if (header) header.appendChild(badge);
      }
    }

    function hideCompletedNewBadge() {
      var badge = document.querySelector('.completed-new-badge');
      if (badge) badge.remove();
    }

    // Part 3: ページネーション
    var completedTotalForPagination = 0;

    function requestCompletedPage() {
      var limit = getCompletedLimit();
      var offset = completedCurrentPage * limit;
      // フィルタパラメータを構築
      var filterParams = '';
      if (completedFilterReview === 'yes') filterParams += '&reviewed=yes';
      else if (completedFilterReview === 'no') filterParams += '&reviewed=no';
      if (completedFilterStar === 'yes') filterParams += '&starred=yes';
      else if (completedFilterStar === 'no') filterParams += '&starred=no';
      // ソートパラメータを追加
      if (sortState.completed !== 'id') {
        filterParams += '&completedSortField=' + sortState.completed;
      }
      // テキスト検索パラメータを追加
      if (completedSearchTerm) {
        filterParams += '&search=' + encodeURIComponent(completedSearchTerm);
      }

      if (_vscodeApi) {
        _vscodeApi.postMessage({
          command: 'completedPage',
          offset: offset,
          limit: limit,
          reviewed: completedFilterReview !== 'all' ? completedFilterReview : undefined,
          starred: completedFilterStar !== 'all' ? completedFilterStar : undefined,
          completedSortField: sortState.completed !== 'id' ? sortState.completed : undefined,
          search: completedSearchTerm || undefined,
        });
        // 表示設定をextensionに送信（ポーリング時に使用）
        syncCompletedViewState();
      } else {
        // ブラウザ用: 直接APIを呼び出す
        var url = '/dashboard/completed?project=${encodeURIComponent(projectPath)}&offset=' + offset + '&limit=' + limit + filterParams;
        fetch(url)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            updateCompletedSection(data.html, data.total, offset, limit);
          });
      }
    }

    // VSCode Webview用: 表示設定をextensionに送信
    function syncCompletedViewState() {
      if (_vscodeApi) {
        _vscodeApi.postMessage({
          command: 'updateCompletedViewState',
          limit: getCompletedLimit(),
          offset: completedCurrentPage * getCompletedLimit(),
          reviewed: completedFilterReview !== 'all' ? completedFilterReview : undefined,
          starred: completedFilterStar !== 'all' ? completedFilterStar : undefined,
          hash: completedHash,
          completedSortField: sortState.completed !== 'id' ? sortState.completed : undefined
        });
      }
    }

    function updateCompletedSection(html, total, offset, limit) {
      var container = document.querySelector('.completed-tasks-container');
      if (container) {
        container.innerHTML = html;
        attachTaskItemListeners();
        restoreExpandedStates();
      }
      completedTotalForPagination = total;
      // インラインページネーションUI更新
      updateInlinePagination(total, offset, limit);
      // 明示的なページ取得なので新着バッジを非表示
      hideCompletedNewBadge();
      // カウントバッジ更新
      var badge = document.querySelector('.completed-count-toggle');
      if (badge) {
        badge.textContent = limit + '件表示 (' + total + ')';
      }
    }

    function updateInlinePagination(total, offset, limit) {
      var paginationEl = document.getElementById('completedPagination');
      if (!paginationEl) return;
      var totalPages = Math.ceil(total / limit);
      var currentPage = Math.floor(offset / limit);
      if (totalPages <= 1) {
        paginationEl.innerHTML = '<span class="pagination-info">' + total + '件</span>';
      } else {
        paginationEl.innerHTML =
          '<button class="pagination-btn" data-page="' + (currentPage - 1) + '" ' + (currentPage === 0 ? 'disabled' : '') + '>◀</button>' +
          '<span class="pagination-info">' + (currentPage + 1) + '/' + totalPages + '</span>' +
          '<button class="pagination-btn" data-page="' + (currentPage + 1) + '" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>';
      }
    }

    function goCompletedPage(page) {
      if (page < 0) return;
      completedCurrentPage = page;
      requestCompletedPage();
    }

    // 初期表示時にページネーションを表示（件数がページサイズを超える場合）
    function initCompletedPagination() {
      // サーバーから埋め込まれた実際の総件数を使用
      var total = ${completedTotal};
      completedTotalForPagination = total;
      var limit = getCompletedLimit();
      updateInlinePagination(total, 0, limit);
    }
  </script>
</head>
<body>
  <div class="header">
    <div>
      <h1>📋 Maid Agent Dashboard</h1>
      <div class="project-path">${escapeHtml(projectPath)}</div>
    </div>
    <div class="timestamp">更新: ${timestamp}</div>
  </div>

  <div class="grid">
    <!-- Phase 2: 統計セクション -->
    <div class="card stats-section">
      <div class="stats-grid">
        <div class="stat-item stat-pending">
          <div class="stat-value">${stats.pendingCount}</div>
          <div class="stat-label">⏳ 待機中</div>
        </div>
        <div class="stat-item stat-working">
          <div class="stat-value">${stats.workingCount}</div>
          <div class="stat-label">⚡ 進行中</div>
        </div>
        <div class="stat-item stat-blocked">
          <div class="stat-value">${stats.masterWaitingCount}</div>
          <div class="stat-label">⚠️ 対応待ち</div>
        </div>
        <div class="stat-item stat-completed">
          <div class="stat-value">${stats.completedTodayCount}</div>
          <div class="stat-label">✅ 本日完了</div>
        </div>
      </div>
    </div>

    <div class="card team-section" data-section="team">
      <div class="card-header">
        <span class="card-title">👥 チーム状態</span>
      </div>
      <div class="team-grid">
        ${teamStatusHtml}
      </div>
    </div>

    <!-- Phase 3: フィルタ/検索コントロール -->
    <div class="controls-section">
      <input type="text" class="search-box" id="searchBox" placeholder="🔍 タスクID / 説明で検索..." />
      <div class="filter-group">
        <span class="filter-label">優先度:</span>
        <select class="filter-select" id="priorityFilter">
          <option value="">すべて</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">担当者:</span>
        <select class="filter-select" id="assigneeFilter">
          <option value="">すべて</option>
          <option value="emma">emma</option>
          <option value="sophia">sophia</option>
          <option value="lily">lily</option>
          <option value="rose">rose</option>
          <option value="alice">alice</option>
          <option value="may">may</option>
          <option value="flora">flora</option>
          <option value="luna">luna</option>
        </select>
      </div>
    </div>

    <!-- ⚠️対応待ちセクション（統合） -->
    <div class="card special-section card-action-required" data-section="master-waiting">
      <div class="card-header">
        <span class="card-title">⚠️ 対応待ち</span>
        <span class="count-badge count-badge-alert">${masterWaiting.length + masterReview.length}</span>
      </div>
      <div class="collapsible-content">
        ${masterWaitingSectionHtml}
      </div>
    </div>

    <div class="card" data-section="pending">
      <div class="card-header">
        <span class="card-title">⏳ 待機中</span>
        <span class="card-count">${filteredPending.length}</span>
        <div class="sort-toggle-group">
          <button class="sort-toggle-btn active" data-section="pending" data-sort="id">ID↓</button>
          <button class="sort-toggle-btn" data-section="pending" data-sort="updatedAt">更新↓</button>
        </div>
      </div>
      ${pendingHtml}
    </div>

    <div class="card" data-section="working">
      <div class="card-header">
        <span class="card-title">⚡ 進行中</span>
        <span class="card-count">${working.length}</span>
        <div class="sort-toggle-group">
          <button class="sort-toggle-btn active" data-section="working" data-sort="id">ID↓</button>
          <button class="sort-toggle-btn" data-section="working" data-sort="updatedAt">更新↓</button>
        </div>
      </div>
      ${workingHtml}
    </div>

    <div class="card" style="grid-column: 1 / -1;" data-section="completed">
      <div class="card-header">
        <div class="completed-header-row">
          <div class="completed-header-left">
            <span class="card-title">✅ 直近完了</span>
            <span class="card-count completed-count-toggle" title="クリックで表示件数を切替">
              10件表示 (${completedTotal})
            </span>
          </div>
          <div class="completed-header-center">
            <div class="inline-pagination" id="completedPagination"></div>
          </div>
          <div class="completed-header-right">
            <div class="sort-toggle-group">
              <button class="sort-toggle-btn active" data-section="completed" data-sort="id">ID↓</button>
              <button class="sort-toggle-btn" data-section="completed" data-sort="updatedAt">更新↓</button>
            </div>
            <div class="completed-filter-group">
              <button id="filterReviewBtn" class="filter-toggle-btn" data-filter="review" title="チェックフィルター（クリックで切替）">✔すべて</button>
              <button id="filterStarBtn" class="filter-toggle-btn" data-filter="star" title="スターフィルター（クリックで切替）">★すべて</button>
            </div>
          </div>
        </div>
      </div>
      <div class="completed-tasks-container">
        ${completedHtml}
      </div>
    </div>

    <!-- P1: スキル候補・改善提案セクション -->
    <div class="card card-skill" data-section="skill-candidates">
      <div class="card-header collapsible-header">
        <span class="card-title">📚 スキル候補</span>
        <span class="count-badge count-badge-purple">${skillCandidates.length}</span>
      </div>
      <div class="collapsible-content">
        ${skillCandidatesHtml}
      </div>
    </div>

    <div class="card card-improvement" data-section="improvements">
      <div class="card-header collapsible-header">
        <span class="card-title">💡 改善提案</span>
        <span class="count-badge count-badge-orange">${improvements.length}</span>
      </div>
      <div class="collapsible-content">
        ${improvementsHtml}
      </div>
    </div>
  </div>

  <script>
    // task-item内ボタンのリスナーを追加する共通ヘルパー
    function addTaskItemButtonListeners(item) {
      // C-1: レポートリンク (openFile)
      item.querySelectorAll('.report-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
          if (_vscodeApi) {
            e.preventDefault();
            _vscodeApi.postMessage({ command: 'openFile', path: this.dataset.path });
          }
          // ブラウザではデフォルトのhref遷移を許可
        });
      });
      // C-2: レビューボタン (toggleReview)
      item.querySelectorAll('.review-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleReview(e, this.dataset.taskId, this.dataset.newValue === 'true');
        });
      });
      // C-3: スターボタン (toggleStar)
      item.querySelectorAll('.star-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleStar(e, this.dataset.taskId, this.dataset.newValue === 'true');
        });
      });
    }

    // Phase 2: タスク展開機能（初期リスナー設定）
    document.querySelectorAll('.task-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
        if (e.target.closest('a') || e.target.closest('button')) return;
        this.classList.toggle('expanded');
      });
      addTaskItemButtonListeners(item);
    });

    // Phase 3: 検索機能
    const searchBox = document.getElementById('searchBox');
    const priorityFilter = document.getElementById('priorityFilter');
    const assigneeFilter = document.getElementById('assigneeFilter');

    // デバウンス関数（サーバーサイド検索用）
    function debounce(func, wait) {
      let timeoutId = null;
      return function(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), wait);
      };
    }

    // 完了タスクの検索状態
    var completedSearchTerm = '';

    function filterTasks() {
      const searchTerm = searchBox.value.toLowerCase();
      const priority = priorityFilter.value;
      const assignee = assigneeFilter.value;

      // 進行中タスクはクライアントサイドでフィルタ
      document.querySelectorAll('.task-item').forEach(item => {
        // 完了タスクはサーバーサイド検索で処理
        if (item.closest('.completed-tasks-container')) return;
        const id = item.querySelector('.task-id')?.textContent?.toLowerCase() || '';
        const desc = item.querySelector('.task-desc')?.textContent?.toLowerCase() || '';
        const itemPriority = item.dataset.priority || '';
        const itemAssignee = item.dataset.assignee || '';

        const matchesSearch = !searchTerm || id.includes(searchTerm) || desc.includes(searchTerm);
        const matchesPriority = !priority || itemPriority === priority;
        const matchesAssignee = !assignee || itemAssignee.includes(assignee);

        item.style.display = (matchesSearch && matchesPriority && matchesAssignee) ? '' : 'none';
      });

      // 完了タスクはサーバーサイド検索（デバウンスで呼び出し）
      debouncedCompletedSearch(searchTerm);
    }

    // 完了タスクのサーバーサイド検索
    function searchCompletedTasks(searchTerm) {
      if (completedSearchTerm === searchTerm) return; // 変化なしならスキップ
      completedSearchTerm = searchTerm;
      completedCurrentPage = 0; // 検索時はページをリセット
      requestCompletedPage();
    }

    var debouncedCompletedSearch = debounce(searchCompletedTasks, 300);

    searchBox?.addEventListener('input', filterTasks);
    priorityFilter?.addEventListener('change', filterTasks);
    assigneeFilter?.addEventListener('change', filterTasks);

    // Phase 3: ポーリングによるリアルタイム更新（表示設定を送信可能）
    let pollingIntervalId = null;
    const POLLING_INTERVAL = 10000; // 10秒

    // 展開状態を記憶するMap（taskId -> expanded）
    const expandedState = new Map();

    // 完了セクションのハッシュ（差分検知用）
    var completedHash = '';

    // サーバーURLを動的に取得（ブラウザ: location.origin、VSCode Webview: サーバー設定値）
    // 0.0.0.0 はリッスンアドレスであり接続先として不適切なため 127.0.0.1 にfallback
    const serverBaseUrl = (typeof acquireVsCodeApi !== 'undefined')
      ? '${data.serverUrl}'.replace('0.0.0.0', '127.0.0.1')
      : window.location.origin;

    function startPolling() {
      if (pollingIntervalId) return; // 既に開始済み
      pollingIntervalId = setInterval(fetchDashboardData, POLLING_INTERVAL);
    }

    function stopPolling() {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
      }
    }

    function fetchDashboardData() {
      var projectPath = encodeURIComponent('${escapeHtml(projectPath)}');
      var limit = getCompletedLimit();
      var offset = completedCurrentPage * limit;

      // フィルタパラメータを構築
      var completedParams = '&completedLimit=' + limit + '&completedOffset=' + offset;
      if (completedFilterReview !== 'all') completedParams += '&completedReviewed=' + completedFilterReview;
      if (completedFilterStar !== 'all') completedParams += '&completedStarred=' + completedFilterStar;
      if (completedHash) completedParams += '&completedHash=' + completedHash;
      if (sortState.completed !== 'id') completedParams += '&completedSortField=' + sortState.completed;
      if (completedSearchTerm) completedParams += '&completedSearch=' + encodeURIComponent(completedSearchTerm);

      var url = serverBaseUrl + '/dashboard/data?project=' + projectPath + completedParams;
      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          // 統計を更新
          updateStats(data.stats);
          // タスクリストを更新（completedMeta付き）
          updateTaskListsWithMeta(data.tasks, data.completedMeta);
        })
        .catch(function(e) {
          console.error('Polling error:', e);
        });
    }

    function updateTaskListsWithMeta(tasks, completedMeta) {
      if (!tasks) return;

      // 現在の展開状態を保存
      saveExpandedStates();

      // 完了以外のセクションを更新
      if (tasks.pending) {
        updateTaskSection('[data-section="pending"]', tasks.pending);
      }
      if (tasks.working) {
        updateTaskSection('[data-section="working"]', tasks.working);
      }
      if (tasks.masterWaiting !== undefined || tasks.masterReview !== undefined) {
        // ⚠️対応待ちセクション全体を更新
        updateTaskSection('[data-section="master-waiting"]',
          (tasks.masterWaiting || '') + (tasks.masterReview || ''));
      }
      if (tasks.skillCandidates) {
        updateTaskSection('[data-section="skill-candidates"]', tasks.skillCandidates);
      }
      if (tasks.improvements) {
        updateTaskSection('[data-section="improvements"]', tasks.improvements);
      }

      // 完了セクション: ハッシュ比較で変更があった場合のみ更新
      if (completedMeta) {
        if (completedMeta.changed && tasks.completed) {
          // 変更あり: HTMLを更新
          var completedContainer = document.querySelector('.completed-tasks-container');
          if (completedContainer) {
            completedContainer.innerHTML = tasks.completed;
            attachTaskItemListeners();
            restoreExpandedStates();
          }
          completedTotalForPagination = completedMeta.total;
          updateInlinePagination(completedMeta.total, completedCurrentPage * getCompletedLimit(), getCompletedLimit());
          // カウントバッジ更新
          var badge = document.querySelector('.completed-count-toggle');
          if (badge) {
            badge.textContent = getCompletedLimit() + '件表示 (' + completedMeta.total + ')';
          }
          hideCompletedNewBadge();
        }
        // ハッシュを更新
        completedHash = completedMeta.hash;
        // VSCode Webview: ハッシュをextensionに同期
        syncCompletedViewState();
      }

      // 展開状態を復元
      restoreExpandedStates();

      // イベントリスナーを再設定
      attachTaskItemListeners();

      // ソート状態を再適用
      Object.keys(sortState).forEach(function(section) {
        if (sortState[section] !== 'id' && section !== 'completed') {
          sortTaskItems(section, sortState[section]);
        }
      });

      // フィルタを再適用
      filterTasks();
    }

    function updateStats(stats) {
      if (!stats) return;
      const mapping = {
        pendingCount: '.stat-pending .stat-value',
        workingCount: '.stat-working .stat-value',
        masterWaitingCount: '.stat-blocked .stat-value',
        completedTodayCount: '.stat-completed .stat-value'
      };
      for (const [key, selector] of Object.entries(mapping)) {
        const el = document.querySelector(selector);
        if (el && stats[key] !== undefined) {
          el.textContent = stats[key];
          el.classList.add('fade-in');
          setTimeout(() => el.classList.remove('fade-in'), 300);
        }
      }
      // 更新時刻を更新
      if (stats.timestamp) {
        const timestampEl = document.querySelector('.timestamp');
        if (timestampEl) {
          timestampEl.textContent = '更新: ' + stats.timestamp;
          timestampEl.classList.add('fade-in');
          setTimeout(() => timestampEl.classList.remove('fade-in'), 300);
        }
      }
    }

    // 展開状態を保存（閉じたタスクはMapから削除）
    function saveExpandedStates() {
      document.querySelectorAll('.task-item').forEach(item => {
        const taskId = item.dataset.id;
        if (!taskId) return;
        if (item.classList.contains('expanded')) {
          expandedState.set(taskId, true);
        } else {
          expandedState.delete(taskId);
        }
      });
    }

    // 展開状態を復元
    function restoreExpandedStates() {
      document.querySelectorAll('.task-item').forEach(item => {
        const taskId = item.dataset.id;
        if (taskId && expandedState.has(taskId)) {
          item.classList.add('expanded');
        }
      });
    }

    // タスクリストを更新（DOMを再構築しつつ展開状態を保持）
    function updateTaskLists(tasks) {
      if (!tasks) return;

      // 現在の展開状態を保存
      saveExpandedStates();

      // 各セクションを更新（data-section属性で識別）
      if (tasks.pending) {
        updateTaskSection('[data-section="pending"]', tasks.pending);
      }
      if (tasks.working) {
        updateTaskSection('[data-section="working"]', tasks.working);
      }
      if (tasks.completed) {
        if (isCompletedDefaultView()) {
          // デフォルト表示: 通常通り完了セクションを更新
          var completedContainer = document.querySelector('.completed-tasks-container');
          if (completedContainer) {
            completedContainer.innerHTML = tasks.completed;
          } else {
            updateTaskSection('[data-section="completed"]', tasks.completed);
          }
          initCompletedPagination();
        } else {
          // カスタム表示: 更新スキップ、「新着あり」バッジを表示
          showCompletedNewBadge();
        }
      }
      if (tasks.masterWaiting !== undefined || tasks.masterReview !== undefined) {
        updateTaskSection('[data-section="master-waiting"]',
          (tasks.masterWaiting || '') + (tasks.masterReview || ''));
      }
      if (tasks.skillCandidates) {
        updateTaskSection('[data-section="skill-candidates"]', tasks.skillCandidates);
      }
      if (tasks.improvements) {
        updateTaskSection('[data-section="improvements"]', tasks.improvements);
      }

      // 展開状態を復元
      restoreExpandedStates();

      // イベントリスナーを再設定
      attachTaskItemListeners();

      // ソート状態を再適用
      Object.keys(sortState).forEach(function(section) {
        if (sortState[section] !== 'id' && section !== 'completed') {
          sortTaskItems(section, sortState[section]);
        }
      });

      // フィルタを再適用
      filterTasks();
    }

    function updateTaskSection(selector, taskHtml) {
      const section = document.querySelector(selector);
      if (!section) {
        console.warn('Section not found:', selector);
        return;
      }

      // .collapsible-contentがある場合はそれを更新、なければカードヘッダー以降を更新
      const contentArea = section.querySelector('.collapsible-content');

      if (contentArea) {
        contentArea.innerHTML = taskHtml;
      } else {
        // カードヘッダー以降を更新
        const header = section.querySelector('.card-header');
        if (header) {
          // ヘッダー以降のコンテンツを削除
          let sibling = header.nextSibling;
          while (sibling) {
            const next = sibling.nextSibling;
            section.removeChild(sibling);
            sibling = next;
          }
          // 新しいコンテンツを追加
          const wrapper = document.createElement('div');
          wrapper.innerHTML = taskHtml;
          while (wrapper.firstChild) {
            section.appendChild(wrapper.firstChild);
          }
        }
      }
    }

    function attachTaskItemListeners() {
      document.querySelectorAll('.task-item').forEach(item => {
        // 既存のリスナーを削除して重複を防ぐ
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);

        newItem.addEventListener('click', function(e) {
          // フォーム要素やリンクのクリックでは展開/折りたたみしない
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
          if (e.target.closest('a') || e.target.closest('button')) return;
          this.classList.toggle('expanded');
        });
        // cloneNodeでaddEventListenerが失われるため再設定
        addTaskItemButtonListeners(newItem);
      });
    }

    // ポーリング開始（VSCode Webviewでは無効 - extension.tsがポーリング担当）
    // VSCode WebviewではacquireVsCodeApiが存在するので、それで判定
    const isVSCodeWebview = typeof acquireVsCodeApi !== 'undefined';
    if (!isVSCodeWebview) {
      try {
        startPolling();
      } catch (e) {
        console.log('Polling not available:', e);
      }
    } else {
      console.log('VSCode Webview detected - polling disabled, extension handles updates');
    }

    // 初期表示: ページネーションとフィルターを初期化
    initCompletedPagination();

    // === addEventListener登録（インラインonclick置換） ===

    // A-1: ソートボタン
    document.querySelectorAll('.sort-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        toggleSort(this.dataset.section, this.dataset.sort);
      });
    });

    // A-2: 表示件数トグル
    var countToggle = document.querySelector('.completed-count-toggle');
    if (countToggle) {
      countToggle.addEventListener('click', toggleCompletedLimit);
    }

    // A-3: フィルターボタン
    document.querySelectorAll('.filter-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        cycleFilter(this.dataset.filter);
      });
    });

    // B-1: ページネーション（イベント委任）
    var paginationRoot = document.getElementById('completedPagination');
    if (paginationRoot) {
      paginationRoot.addEventListener('click', function(e) {
        var btn = e.target.closest('.pagination-btn');
        if (btn && !btn.disabled) {
          var page = parseInt(btn.dataset.page, 10);
          goCompletedPage(page);
        }
      });
    }
  </script>
  <!-- レポートオーバーレイ（VSCode Webview内でレポートを表示） -->
  <div id="reportOverlay" class="report-overlay">
    <div class="report-overlay-header">
      <h2 id="reportTitle">📄 Report</h2>
      <button class="report-close-btn">✕ 閉じる</button>
    </div>
    <div id="reportContent" class="report-overlay-content"></div>
  </div>
  <script>
    function showReportOverlay(html, fileName) {
      document.getElementById('reportTitle').textContent = '📄 ' + fileName;
      document.getElementById('reportContent').innerHTML = html;
      document.getElementById('reportOverlay').classList.add('visible');
    }
    function closeReportOverlay() {
      document.getElementById('reportOverlay').classList.remove('visible');
    }
    // A-4: レポートオーバーレイ閉じる（M-1: 第3スクリプトブロック内に配置）
    var closeBtn = document.querySelector('.report-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeReportOverlay);
    }
  </script>
</body>
</html>`;
}
