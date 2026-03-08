/**
 * ダッシュボード SPA版 HTML生成
 * 静的HTMLシェル + クライアントJSでAPI呼び出し
 *
 * 全機能実装版:
 * - アコーディオン開閉（Goals/Works/Steps）
 * - タブ切り替え（Open/Closed）
 * - 検索・フィルタリング
 * - ページネーション
 * - タスク操作（アーカイブ/スター/レビュー/Close）
 * - 報告書表示（Markdownレンダリング）
 * - WebSocketリアルタイム更新
 */
import { getDashboardStyles } from "./dashboard-styles.js";
import { escapeHtml } from "../markdown-utils.js";
/**
 * SPA版ダッシュボードの静的HTMLシェルを生成
 */
export function generateDashboardSpaHtml(projectPath, serverUrl) {
    const styles = getDashboardStyles();
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📋 Maid Agent Dashboard</title>
  <style>
${styles}
    /* SPA固有スタイル */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: var(--v2-text-secondary);
    }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--v2-border);
      border-top-color: var(--v2-accent-blue);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      margin-top: 16px;
      font-size: 14px;
    }
    .error-container {
      padding: 40px;
      text-align: center;
      color: var(--v2-accent-red);
    }
    .spa-badge {
      background: var(--v2-accent-purple);
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      margin-left: 8px;
      vertical-align: middle;
    }
    /* タブスタイル */
    .tab-container {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
    }
    .tab-btn {
      padding: 8px 16px;
      border: 1px solid var(--v2-border);
      background: var(--v2-bg-secondary);
      color: var(--v2-text-secondary);
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: var(--v2-bg-primary);
      color: var(--v2-text-primary);
      border-bottom-color: var(--v2-bg-primary);
    }
    .tab-btn:hover:not(.active) {
      background: var(--v2-bg-card);
    }
    /* アクションボタン */
    .action-btn {
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
      margin-left: 4px;
    }
    .action-btn:hover {
      opacity: 0.8;
    }
    .action-btn.archive-btn {
      background: var(--v2-accent-orange);
      color: #fff;
    }
    .action-btn.close-btn {
      background: var(--v2-accent-green);
      color: #fff;
    }
    /* タスク詳細モーダル */
    .task-detail-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .task-detail-modal.show {
      display: flex;
    }
    .task-detail-content {
      background: var(--v2-bg-card);
      border-radius: 12px;
      max-width: 800px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      padding: 24px;
    }
    .task-detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--v2-border);
    }
    .task-detail-close {
      background: none;
      border: none;
      color: var(--v2-text-secondary);
      font-size: 24px;
      cursor: pointer;
    }
    /* Goal展開/折りたたみ - 現行準拠 */
    .goal-item {
      margin-bottom: 4px;
    }
    .goal-header {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      background: var(--v2-bg-card);
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
      gap: 8px;
      flex-wrap: wrap;
    }
    .goal-header:hover {
      background: rgba(255,255,255,0.05);
    }
    .goal-toggle {
      width: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
      font-size: 0.7rem;
    }
    .goal-toggle.collapsed {
      transform: rotate(-90deg);
    }
    .goal-content {
      margin-left: 0;
      padding-left: 16px;
    }
    /* Phase/Step - 現行準拠 */
    .phase-item {
      margin-left: 8px;
      padding-left: 8px;
      border-left: 2px solid var(--v2-border);
    }
    .phase-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
      cursor: pointer;
    }
    .phase-header:hover {
      background: rgba(255,255,255,0.05);
    }
    .step-item {
      display: flex;
      align-items: center;
      padding: 1px 0;
      gap: 6px;
      font-size: 0.85rem;
    }
    .step-item.completed {
      opacity: 0.6;
    }
    .step-item.current {
      color: var(--v2-accent-blue);
      font-weight: 500;
    }
    .step-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .step-status {
      margin-left: auto;
    }
    .step-assignees {
      flex-shrink: 0;
    }
    .report-link {
      flex-shrink: 0;
    }
    /* スキル候補・改善提案 - 現行準拠1行形式 */
    .task-item {
      padding: 5px 8px;
      margin: 3px 0;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .task-item:hover {
      background: rgba(255,255,255,0.08);
    }
    .skill-item {
      border-left: 3px solid #9b59b6;
    }
    .improvement-item {
      border-left: 3px solid #f39c12;
    }
    /* タスク詳細ポップアップ - 現行準拠 */
    .task-detail-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .task-detail-popup {
      background: var(--v2-bg-card);
      border-radius: 8px;
      max-width: 700px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    .task-detail-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--v2-border);
      background: var(--v2-bg-secondary);
    }
    .task-detail-title {
      font-weight: 600;
      font-size: 1rem;
      color: var(--v2-text-primary);
    }
    .task-detail-close {
      background: none;
      border: none;
      color: var(--v2-text-secondary);
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
    }
    .task-detail-close:hover {
      color: var(--v2-text-primary);
    }
    .task-detail-body {
      padding: 16px;
    }
    .task-detail-row {
      display: flex;
      margin-bottom: 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      padding: 8px;
    }
    .task-detail-label {
      min-width: 80px;
      font-weight: 500;
      color: var(--v2-text-secondary);
      font-size: 0.85rem;
    }
    .task-detail-value {
      color: var(--v2-text-primary);
      font-size: 0.9rem;
      word-break: break-word;
    }
    .task-detail-description {
      white-space: pre-wrap;
    }
    /* ヘッダー内ページネーション（タイトル後、中央寄せ） */
    .header-pagination {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 auto 0 8px;
      font-size: 0.8rem;
    }
    .header-pagination .pagination-btn {
      padding: 2px 8px;
      border: 1px solid var(--v2-border);
      background: var(--v2-bg-secondary);
      color: var(--v2-text-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
    }
    .header-pagination .pagination-btn:hover:not(:disabled) {
      background: var(--v2-bg-card);
    }
    .header-pagination .pagination-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .header-pagination .pagination-info {
      color: var(--v2-text-secondary);
      font-size: 0.75rem;
    }
    /* ページネーション */
    .pagination {
      display: flex;
      justify-content: center;
      gap: 8px;
      padding: 16px 0;
    }
    .pagination button {
      padding: 8px 16px;
      border: 1px solid var(--v2-border);
      background: var(--v2-bg-secondary);
      color: var(--v2-text-primary);
      border-radius: 4px;
      cursor: pointer;
    }
    .pagination button:hover:not(:disabled) {
      background: var(--v2-bg-card);
    }
    .pagination button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .pagination .page-info {
      display: flex;
      align-items: center;
      color: var(--v2-text-secondary);
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>📋 Maid Agent Dashboard<span class="spa-badge">SPA</span></h1>
      <div class="project-path">${escapeHtml(projectPath)}</div>
    </div>
    <div class="timestamp" id="timestamp">更新: 読み込み中...</div>
  </div>

  <div class="grid" id="main-content">
    <!-- V2.1セクション -->
    <div class="v2-sections" style="grid-column: 1 / -1;">

      <!-- 📊 タスク統計 -->
      <div class="card v2-stats-section" data-section="v2-stats">
        <div class="card-header">
          <span class="card-title">📊 タスク統計</span>
        </div>
        <div class="grid grid-stats" id="v2-stats-grid">
          <div class="stat-card"><div class="number" id="stat-task">-</div><div class="label">🎯 Task</div></div>
          <div class="stat-card"><div class="number" id="stat-work">-</div><div class="label">📋 Work</div></div>
          <div class="stat-card"><div class="number" id="stat-step">-</div><div class="label">⚡ Step</div></div>
          <div class="stat-card success"><div class="number" id="stat-completed">-</div><div class="label">✅ 完了</div></div>
          <div class="stat-card warning"><div class="number" id="stat-action-required">-</div><div class="label">⚠️ 要対応</div></div>
          <div class="stat-card"><div class="number" id="stat-review">-</div><div class="label">📋 Review</div></div>
          <div class="stat-card info"><div class="number" id="stat-proposal">-</div><div class="label">💡 提案</div></div>
        </div>
      </div>

      <!-- 👥 チーム状態セクション -->
      <div class="card v2-team-status-section" data-section="v2-team-status">
        <div class="card-header collapsible-header" onclick="toggleSection('v2-team-status')">
          <span class="card-title">👥 チーム状態</span>
          <span class="count-badge" id="team-count">8</span>
        </div>
        <div class="collapsible-content" id="team-content">
          <div class="loading-container"><div class="loading-spinner"></div></div>
        </div>
      </div>

      <!-- 🔍 検索・絞り込みセクション -->
      <div class="card v2-search-filter-section" data-section="v2-search-filter">
        <div class="card-header collapsible-header" onclick="toggleSection('v2-search-filter')">
          <span class="card-title">🔍 検索・絞り込み</span>
        </div>
        <div class="collapsible-content" id="search-filter-content">
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
              <option value="emma">Emma</option>
              <option value="sophia">Sophia</option>
              <option value="lily">Lily</option>
              <option value="rose">Rose</option>
              <option value="alice">Alice</option>
              <option value="may">May</option>
              <option value="flora">Flora</option>
              <option value="luna">Luna</option>
            </select>
            <button id="v2-filter-clear-btn" class="v2-filter-clear-btn" title="フィルタをクリア">✕</button>
          </div>
        </div>
      </div>

      <!-- 🚨 要対応セクション -->
      <div class="card v2-master-waiting-section card-action-required" data-section="v2-master-waiting">
        <div class="card-header collapsible-header" onclick="toggleSection('v2-master-waiting')">
          <span class="card-title">🚨 要対応</span>
          <span class="count-badge count-badge-alert" id="review-count">0</span>
        </div>
        <div class="collapsible-content" id="review-queue-content">
          <div class="empty-message">ご主人様判断待ちのタスクはありません</div>
        </div>
      </div>

      <!-- 🔵 進行中セクション -->
      <div class="card v2-goals-open-section" data-section="v2-goals-open">
        <div class="card-header collapsible-header">
          <span class="card-title">🔵 進行中</span>
          <span class="count-badge" id="v2-goals-open-count">0</span>
          <div class="header-pagination" id="v2-goals-open-pagination"></div>
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
          <div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">読み込み中...</div></div>
        </div>
      </div>

      <!-- ✅ 完了済みセクション -->
      <div class="card v2-goals-closed-section" data-section="v2-goals-closed">
        <div class="card-header collapsible-header">
          <span class="card-title">✅ 完了済み</span>
          <span class="count-badge" id="v2-goals-closed-count">0</span>
          <div class="header-pagination" id="v2-goals-closed-pagination"></div>
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
          <div class="empty-message">完了済みタスクはありません</div>
        </div>
      </div>

      <!-- スキル候補・改善提案セクション（左右分割） -->
      <div class="v2-skill-improvement-row">
        <div class="card v2-skill-candidates-section card-skill" data-section="v2-skill-candidates">
          <div class="card-header collapsible-header" onclick="toggleSection('v2-skill-candidates')">
            <span class="card-title">📚 スキル候補</span>
            <span class="count-badge count-badge-purple" id="skill-count">0</span>
          </div>
          <div class="collapsible-content" id="skill-content">
            <div class="empty-message">スキル候補なし</div>
          </div>
        </div>
        <div class="card v2-improvements-section card-improvement" data-section="v2-improvements">
          <div class="card-header collapsible-header" onclick="toggleSection('v2-improvements')">
            <span class="card-title">💡 改善提案</span>
            <span class="count-badge count-badge-orange" id="improvement-count">0</span>
          </div>
          <div class="collapsible-content" id="improvement-content">
            <div class="empty-message">改善提案なし</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- レポートオーバーレイ -->
  <div id="reportOverlay" class="report-overlay">
    <div class="report-overlay-header">
      <h2 id="reportTitle">Report</h2>
      <button class="report-close-btn" onclick="closeReportOverlay()">閉じる</button>
    </div>
    <div id="reportContent" class="report-overlay-content"></div>
  </div>

  <!-- タスク詳細モーダル -->
  <div id="taskDetailModal" class="task-detail-modal" onclick="if(event.target===this)closeTaskDetail()">
    <div class="task-detail-content">
      <div class="task-detail-header">
        <h2 id="taskDetailTitle">Task Detail</h2>
        <button class="task-detail-close" onclick="closeTaskDetail()">&times;</button>
      </div>
      <div id="taskDetailBody"></div>
    </div>
  </div>

  <script>
    (function() {
      // ========================================
      // 設定・状態
      // ========================================
      var projectPath = ${JSON.stringify(projectPath)};
      // サーバーURLを動的に決定（スマホブラウザ対応）
      // VSCode Webview: window.location.originがvscode-webview://になるため、serverBaseUrlを使用
      // ブラウザ: window.location.originを使用（スマホなど外部デバイスからのアクセス対応）
      var isVSCodeWebview = window.location.protocol === 'vscode-webview:';
      var serverUrl = isVSCodeWebview ? ${JSON.stringify(serverUrl)} : window.location.origin;
      var wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = isVSCodeWebview
        ? ${JSON.stringify(serverUrl)}.replace(/^http/, 'ws') + '/dashboard/ws?project=' + encodeURIComponent(projectPath)
        : wsProtocol + '//' + window.location.host + '/dashboard/ws?project=' + encodeURIComponent(projectPath);

      var currentData = null;
      var ws = null;
      var reconnectTimer = null;

      // V2.1 Goals ページネーション状態（Open/Closed 別管理）
      var v2GoalsOpenCurrentPage = 0;
      var v2GoalsOpenLimit = 10;
      var v2GoalsOpenTotal = 0;
      var v2GoalsOpenSortField = 'id';
      var v2GoalsOpenSortOrder = 'desc';

      var v2GoalsClosedCurrentPage = 0;
      var v2GoalsClosedLimit = 10;
      var v2GoalsClosedTotal = 0;
      var v2GoalsClosedSortField = 'id';
      var v2GoalsClosedSortOrder = 'desc';

      // 検索・絞り込みフィルター状態
      var v2FilterState = {
        search: '',
        priority: '',
        assignee: ''
      };
      var v2SearchDebounceTimer = null;

      // 折りたたみ状態
      var collapsedSections = {};
      var collapsedGoals = {};

      // ========================================
      // ユーティリティ関数
      // ========================================
      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function debounce(fn, delay) {
        var timer;
        return function() {
          var args = arguments;
          var ctx = this;
          clearTimeout(timer);
          timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
        };
      }

      // ========================================
      // API呼び出し
      // ========================================
      function fetchApi(endpoint, options) {
        options = options || {};
        var url = endpoint;
        if (url.indexOf('?') === -1) {
          url += '?project=' + encodeURIComponent(projectPath);
        } else {
          url += '&project=' + encodeURIComponent(projectPath);
        }
        return fetch(url, options).then(function(res) {
          if (!res.ok) throw new Error('API error: ' + res.status);
          return res.json();
        });
      }

      // ========================================
      // ダッシュボードデータ取得（現行準拠: Open/Closed別）
      // ========================================

      // 進行中（Open）Goals一覧をサーバーから取得
      function refreshGoalsOpen() {
        var offset = v2GoalsOpenCurrentPage * v2GoalsOpenLimit;
        var url = serverUrl + '/dashboard/goals?project=' + encodeURIComponent(projectPath) +
          '&offset=' + offset +
          '&limit=' + v2GoalsOpenLimit +
          '&status=open' +
          '&archived=false' +
          '&sort=' + v2GoalsOpenSortField +
          '&order=' + v2GoalsOpenSortOrder;

        if (v2FilterState.search) url += '&search=' + encodeURIComponent(v2FilterState.search);
        if (v2FilterState.priority) url += '&priority=' + encodeURIComponent(v2FilterState.priority);
        if (v2FilterState.assignee) url += '&assignee=' + encodeURIComponent(v2FilterState.assignee);

        fetch(url)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            updateV2GoalsOpenSection(data.goals, data.total, data.offset, data.limit);
          })
          .catch(function(err) {
            console.error('[refreshGoalsOpen] Error:', err);
          });
      }

      // 完了済み（Closed）Goals一覧をサーバーから取得
      function refreshGoalsClosed() {
        var archivedCheckbox = document.getElementById('v2-goals-show-archived');
        var showArchived = archivedCheckbox ? archivedCheckbox.checked : false;
        var offset = v2GoalsClosedCurrentPage * v2GoalsClosedLimit;
        var url = serverUrl + '/dashboard/goals?project=' + encodeURIComponent(projectPath) +
          '&offset=' + offset +
          '&limit=' + v2GoalsClosedLimit +
          '&status=closed' +
          '&archived=' + showArchived +
          '&sort=' + v2GoalsClosedSortField +
          '&order=' + v2GoalsClosedSortOrder;

        if (v2FilterState.search) url += '&search=' + encodeURIComponent(v2FilterState.search);
        if (v2FilterState.priority) url += '&priority=' + encodeURIComponent(v2FilterState.priority);
        if (v2FilterState.assignee) url += '&assignee=' + encodeURIComponent(v2FilterState.assignee);

        fetch(url)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            updateV2GoalsClosedSection(data.goals, data.total, data.offset, data.limit);
          })
          .catch(function(err) {
            console.error('[refreshGoalsClosed] Error:', err);
          });
      }

      // チーム状態・統計・要対応を取得
      function refreshDashboardMeta() {
        var url = serverUrl + '/api/dashboard?project=' + encodeURIComponent(projectPath) +
          '&includeTeamStatus=true&limit=0';

        fetch(url)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            currentData = data;
            renderDashboardMeta(data);
          })
          .catch(function(err) {
            console.error('[refreshDashboardMeta] Error:', err);
          });
      }

      window.refreshDashboard = function() {
        refreshDashboardMeta();
        refreshGoalsOpen();
        refreshGoalsClosed();
      };

      // ========================================
      // レンダリング
      // ========================================
      function renderDashboardMeta(data) {
        // タイムスタンプ
        document.getElementById('timestamp').textContent = '更新: ' + (data.timestamp || new Date().toLocaleString('ja-JP'));

        // 統計（V2.1形式: 7項目）
        if (data.stats) {
          var el;
          el = document.getElementById('stat-task'); if (el) el.textContent = data.stats.taskCount || 0;
          el = document.getElementById('stat-work'); if (el) el.textContent = data.stats.workCount || 0;
          el = document.getElementById('stat-step'); if (el) el.textContent = data.stats.stepCount || 0;
          el = document.getElementById('stat-completed'); if (el) el.textContent = data.stats.completedCount || 0;
          el = document.getElementById('stat-action-required'); if (el) el.textContent = data.stats.actionRequiredCount || 0;
          el = document.getElementById('stat-review'); if (el) el.textContent = data.stats.reviewPendingCount || 0;
          el = document.getElementById('stat-proposal'); if (el) el.textContent = data.stats.proposalCount || 0;
        }

        // チーム状態
        if (data.teamStatus) {
          var teamContent = document.getElementById('team-content');
          if (teamContent) teamContent.innerHTML = renderTeamStatus(data.teamStatus);
          var teamCount = document.getElementById('team-count');
          if (teamCount) teamCount.textContent = data.teamStatus.length;
        }

        // 要対応（masterWaiting + masterReview）
        var reviewQueue = (data.masterWaiting || []).concat(data.masterReview || []);
        var reviewCount = document.getElementById('review-count');
        var reviewContent = document.getElementById('review-queue-content');
        if (reviewCount) reviewCount.textContent = reviewQueue.length;
        if (reviewContent) {
          reviewContent.innerHTML = reviewQueue.length > 0
            ? renderReviewQueue(reviewQueue)
            : '<div class="empty-message">ご主人様判断待ちのタスクはありません</div>';
        }

        // スキル候補
        var skills = data.skillCandidates || [];
        var skillCount = document.getElementById('skill-count');
        var skillContent = document.getElementById('skill-content');
        if (skillCount) skillCount.textContent = skills.length;
        if (skillContent) skillContent.innerHTML = skills.length > 0 ? renderSimpleList(skills, 'skill_candidate') : '<div class="empty-message">スキル候補なし</div>';

        // 改善提案
        var improvements = data.improvements || [];
        var improvementCount = document.getElementById('improvement-count');
        var improvementContent = document.getElementById('improvement-content');
        if (improvementCount) improvementCount.textContent = improvements.length;
        if (improvementContent) improvementContent.innerHTML = improvements.length > 0 ? renderSimpleList(improvements, 'improvement') : '<div class="empty-message">改善提案なし</div>';
      }

      // 進行中セクションを更新
      function updateV2GoalsOpenSection(goals, total, offset, limit) {
        var goalsList = document.getElementById('v2-goals-open-list');
        if (!goalsList) return;

        v2GoalsOpenTotal = total;

        if (goals && goals.length > 0) {
          goalsList.innerHTML = renderGoals(goals);
        } else {
          goalsList.innerHTML = '<div class="empty-message">進行中のタスクはありません</div>';
        }

        var countBadge = document.getElementById('v2-goals-open-count');
        if (countBadge) countBadge.textContent = String(total);

        updateV2GoalsOpenPagination(total, offset, limit);
        initGoalTree();
      }

      // 完了済みセクションを更新
      function updateV2GoalsClosedSection(goals, total, offset, limit) {
        var goalsList = document.getElementById('v2-goals-closed-list');
        if (!goalsList) return;

        v2GoalsClosedTotal = total;

        if (goals && goals.length > 0) {
          goalsList.innerHTML = renderGoals(goals);
        } else {
          goalsList.innerHTML = '<div class="empty-message">完了済みタスクはありません</div>';
        }

        var countBadge = document.getElementById('v2-goals-closed-count');
        if (countBadge) countBadge.textContent = String(total);

        updateV2GoalsClosedPagination(total, offset, limit);
        initGoalTree();
      }

      // 進行中ページネーション（2ページ以上の場合のみ表示）
      function updateV2GoalsOpenPagination(total, offset, limit) {
        var paginationEl = document.getElementById('v2-goals-open-pagination');
        if (!paginationEl) return;
        var totalPages = Math.ceil(total / limit);
        var currentPage = Math.floor(offset / limit);
        if (totalPages <= 1) {
          paginationEl.innerHTML = '';
        } else {
          paginationEl.innerHTML =
            '<button class="pagination-btn" onclick="goV2GoalsOpenPage(' + (currentPage - 1) + ')" ' + (currentPage === 0 ? 'disabled' : '') + '>◀</button>' +
            '<span class="pagination-info">' + (currentPage + 1) + '/' + totalPages + '</span>' +
            '<button class="pagination-btn" onclick="goV2GoalsOpenPage(' + (currentPage + 1) + ')" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>';
        }
      }

      // 完了済みページネーション（2ページ以上の場合のみ表示）
      function updateV2GoalsClosedPagination(total, offset, limit) {
        var paginationEl = document.getElementById('v2-goals-closed-pagination');
        if (!paginationEl) return;
        var totalPages = Math.ceil(total / limit);
        var currentPage = Math.floor(offset / limit);
        if (totalPages <= 1) {
          paginationEl.innerHTML = '';
        } else {
          paginationEl.innerHTML =
            '<button class="pagination-btn" onclick="goV2GoalsClosedPage(' + (currentPage - 1) + ')" ' + (currentPage === 0 ? 'disabled' : '') + '>◀</button>' +
            '<span class="pagination-info">' + (currentPage + 1) + '/' + totalPages + '</span>' +
            '<button class="pagination-btn" onclick="goV2GoalsClosedPage(' + (currentPage + 1) + ')" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>';
        }
      }

      window.goV2GoalsOpenPage = function(page) {
        if (page < 0) return;
        var totalPages = Math.ceil(v2GoalsOpenTotal / v2GoalsOpenLimit);
        if (page >= totalPages) return;
        v2GoalsOpenCurrentPage = page;
        refreshGoalsOpen();
      };

      window.goV2GoalsClosedPage = function(page) {
        if (page < 0) return;
        var totalPages = Math.ceil(v2GoalsClosedTotal / v2GoalsClosedLimit);
        if (page >= totalPages) return;
        v2GoalsClosedCurrentPage = page;
        refreshGoalsClosed();
      };

      // Goalツリー初期化（折りたたみ状態を適用）
      function initGoalTree() {
        var collapsedToggles = document.querySelectorAll('.goal-toggle.collapsed');
        collapsedToggles.forEach(function(toggle) {
          var goalItem = toggle.closest('.goal-item');
          if (goalItem) {
            var content = goalItem.querySelector('.goal-content');
            if (content) content.style.display = 'none';
          }
        });
      }

      // チーム状態レンダリング（現行準拠）
      function renderTeamStatus(agents) {
        if (!agents || agents.length === 0) return '<div class="empty-message">チーム情報がありません</div>';

        var statusConfig = {
          working: { icon: '🔧', label: '作業中' },
          completed: { icon: '✅', label: '完了' },
          assigned: { icon: '📋', label: '割当済' },
          blocked: { icon: '⏸', label: 'ブロック' },
          idle: { icon: '💤', label: '待機' },
          unknown: { icon: '❓', label: '不明' }
        };

        // 経過時間フォーマット
        function formatElapsedTime(startedAt) {
          if (!startedAt) return '';
          var start = new Date(startedAt).getTime();
          var now = Date.now();
          var diffMs = now - start;
          var diffMins = Math.floor(diffMs / 60000);
          if (diffMins < 60) return diffMins + 'm';
          var hours = Math.floor(diffMins / 60);
          var mins = diffMins % 60;
          return hours + 'h ' + mins + 'm';
        }

        return '<div class="v2-team-grid">' + agents.map(function(agent) {
          var config = statusConfig[agent.status] || statusConfig.idle;
          var taskId = agent.task_id ? '[#' + agent.task_id.replace('task-', '') + ']' : '';
          var elapsedTime = agent.started_at ? formatElapsedTime(agent.started_at) : '';
          var taskTitle = agent.task_title || '';
          if (taskTitle.length > 30) taskTitle = taskTitle.substring(0, 30) + '...';

          return '<div class="v2-team-card v2-team-card-' + (agent.status || 'idle') + '" data-agent="' + escapeHtml(agent.id) + '" onclick="showAgentDetail(\\'' + escapeHtml(agent.id) + '\\')">' +
            '<div class="v2-team-row1">' +
              '<span class="v2-team-name">' + escapeHtml(agent.id) + '</span>' +
              '<span class="v2-team-icon">' + config.icon + '</span>' +
              (elapsedTime ? '<span class="v2-team-elapsed">' + elapsedTime + '</span>' : '') +
            '</div>' +
            (taskId ? '<div class="v2-team-row2">' +
              '<span class="v2-team-task">' + taskId + '</span>' +
              (taskTitle ? '<span class="v2-team-title">' + escapeHtml(taskTitle) + '</span>' : '') +
            '</div>' : '') +
          '</div>';
        }).join('') + '</div>';
      }

      // レビューキューレンダリング（要対応タスク一覧）
      function renderReviewQueue(items) {
        return items.map(function(item) {
          return '<div class="task-card task-review" onclick="showTaskDetail(\\'' + escapeHtml(item.id) + '\\')">' +
            '<div class="task-header">' +
            '<span class="task-id task-id-clickable">#' + escapeHtml(item.id.replace('task-', '')) + '</span>' +
            '<span class="status status-checkpoint">⚠️ 要対応</span>' +
            '</div>' +
            '<div class="task-title">' + escapeHtml(item.title || '') + '</div>' +
            (item.summary ? '<div class="task-meta">' + escapeHtml(item.summary) + '</div>' : '') +
            '</div>';
        }).join('');
      }

      // ========================================
      // 現行ダッシュボード準拠レンダリング
      // ========================================

      // ステータスアイコン・クラス定義
      var statusIcons = {
        working: '🔵', active: '🔵', assigned: '📋', pending: '⏳', paused: '⏸️',
        checkpoint: '🔶', waiting: '⏳', completed: '✅', archived: '📦'
      };
      var statusClasses = {
        working: 'status-active', active: 'status-active', assigned: 'status-assigned',
        pending: 'status-pending', paused: 'status-paused', checkpoint: 'status-checkpoint',
        waiting: 'status-waiting', completed: 'status-completed', archived: 'status-archived'
      };
      var statusTextJp = {
        pending: '未着手', assigned: '割当済', working: '進行中', active: '進行中',
        checkpoint: '確認待ち', waiting: '待機中', completed: '完了', archived: 'アーカイブ'
      };
      var maidIcons = {
        emma: '☕', sophia: '❄️', lily: '🎀', rose: '🌹',
        alice: '✨', may: '🕊️', flora: '🌿', luna: '🌙'
      };

      // Base64エンコード（タスク詳細ポップアップ用）
      function encodeTaskInfo(info) {
        try {
          return btoa(unescape(encodeURIComponent(JSON.stringify(info))));
        } catch (e) {
          return '';
        }
      }

      // Goalsレンダリング（階層構造）
      function renderGoals(goals) {
        return goals.map(renderGoalItem).join('');
      }

      function renderGoalItem(goal) {
        var id = goal.id || '';
        var title = goal.title || '';
        var effectiveSubstatus = goal.subStatus || 'pending';
        if (goal.mainStatus === 'closed' || goal.subStatus === 'completed') {
          effectiveSubstatus = 'completed';
        }
        var works = goal.works || [];
        var hasChildren = works.length > 0;
        var isCollapsed = collapsedGoals[id] !== false;

        // ステータス
        var statusIcon = goal.displayIcon || statusIcons[effectiveSubstatus] || '❓';
        var statusText = goal.displayStatus || statusTextJp[effectiveSubstatus] || effectiveSubstatus;
        var statusClass = statusClasses[effectiveSubstatus] || '';

        // 担当者HTML
        var assigneesHtml = '';
        if (goal.assignees && goal.assignees.length > 0) {
          var items = goal.assignees.filter(function(a) { return a && a.agentId; }).map(function(a) {
            var icon = maidIcons[a.agentId.toLowerCase()] || '👤';
            return '<span class="assignee-item"><span class="assignee-icon">' + icon + '</span><span class="assignee-name">' + escapeHtml(a.agentId) + '</span></span>';
          }).join(' ');
          if (items) assigneesHtml = '<span class="goal-assignees-inline">' + items + '</span>';
        }
        if (!assigneesHtml) {
          assigneesHtml = '<span class="goal-assignees-inline no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>';
        }

        // 報告書リンク
        var reportLinkClass = goal.hasReport ? 'report-link' : 'report-link report-link-empty';
        var reportLink = '<a href="/report?task=' + encodeURIComponent(id) + '&project=' + encodeURIComponent(projectPath) + '" class="' + reportLinkClass + '" title="統合サマリーを開く" onclick="event.stopPropagation()">📄</a>';

        // タスク詳細データ
        var taskInfoBase64 = encodeTaskInfo({
          id: id, title: title, description: goal.description || '',
          status: statusText,
          assignees: (goal.assignees || []).map(function(a) { return a.agentId; }).join(', ') || '担当なし',
          updatedAt: goal.updatedAt || ''
        });

        // トグルアイコン
        var toggleIcon = hasChildren ? '▼' : '●';
        var toggleClass = hasChildren ? (isCollapsed ? 'collapsed' : '') : 'collapsed no-children';

        // クローズボタン（全Work完了時のみ）
        var closeHtml = '';
        var allWorksCompleted = hasChildren && works.every(function(w) {
          return w.subStatus === 'completed' || w.mainStatus === 'closed';
        });
        if (goal.mainStatus === 'open' && allWorksCompleted) {
          closeHtml = '<button class="close-goal-btn" data-task-id="' + escapeHtml(id) + '" title="Goalを完了にする" onclick="event.stopPropagation();closeGoal(\\'' + escapeHtml(id) + '\\')">✅完了</button>';
        }

        // アーカイブボタン
        var isArchived = goal.archived === true;
        var isCompleted = effectiveSubstatus === 'completed';
        var archiveHtml;
        if (isArchived) {
          archiveHtml = '<button class="archive-btn archived-badge" data-task-id="' + escapeHtml(id) + '" title="アーカイブ済み（クリックで解除）" onclick="event.stopPropagation();toggleArchive(\\'' + escapeHtml(id) + '\\')">📦</button>';
        } else if (isCompleted) {
          archiveHtml = '<button class="archive-btn" data-task-id="' + escapeHtml(id) + '" title="アーカイブする" onclick="event.stopPropagation();toggleArchive(\\'' + escapeHtml(id) + '\\')">📦</button>';
        } else {
          archiveHtml = '<button class="archive-btn archive-btn-disabled" disabled title="完了後にアーカイブ可能" onclick="event.stopPropagation()">📦</button>';
        }

        // Workをレンダリング
        var worksHtml = '';
        if (hasChildren) {
          worksHtml = '<div class="goal-content" style="' + (isCollapsed ? 'display:none;' : '') + '"><div class="phase-tree">' +
            works.map(function(work) { return renderPhaseItem(work); }).join('') +
            '</div></div>';
        }

        return '<div class="goal-item" data-id="' + escapeHtml(id) + '" data-status="' + (goal.mainStatus || 'open') + '" data-substatus="' + (goal.subStatus || 'pending') + '" data-archived="' + (isArchived || goal.subStatus === 'archived') + '" data-updated="' + (goal.updatedAt || '') + '">' +
          '<div class="goal-header" onclick="toggleGoal(\\'' + escapeHtml(id) + '\\')">' +
            '<span class="goal-toggle ' + toggleClass + '">' + toggleIcon + '</span>' +
            '<span class="goal-id task-id-clickable" data-task-info="' + taskInfoBase64 + '" onclick="event.stopPropagation();showTaskDetail(\\'' + escapeHtml(id) + '\\')">#' + escapeHtml(id) + '</span>' +
            '<span class="goal-title">' + escapeHtml(title) + '</span>' +
            '<span class="badge badge-goal">Goal</span>' +
            (goal.size ? '<span class="badge badge-size">' + escapeHtml(goal.size) + '</span>' : '') +
            '<span class="status ' + statusClass + '">' + statusIcon + '<span class="status-text"> ' + escapeHtml(statusText) + '</span></span>' +
            assigneesHtml +
            reportLink +
            closeHtml +
            archiveHtml +
          '</div>' +
          worksHtml +
        '</div>';
      }

      function renderPhaseItem(work) {
        var id = work.id || '';
        var title = work.title || '';
        var status = work.subStatus || work.status || 'pending';
        var steps = work.steps || [];

        var statusIcon = statusIcons[status] || '❓';
        var statusClass = statusClasses[status] || '';
        var statusText = statusTextJp[status] || status;

        // 担当者HTML
        var assigneesHtml = '';
        if (work.assignees && work.assignees.length > 0) {
          var items = work.assignees.filter(function(a) { return a && a.agentId; }).map(function(a) {
            var icon = maidIcons[a.agentId.toLowerCase()] || '👤';
            return '<span class="assignee-item"><span class="assignee-icon">' + icon + '</span><span class="assignee-name">' + escapeHtml(a.agentId) + '</span></span>';
          }).join(' ');
          if (items) assigneesHtml = '<span class="phase-assignees">' + items + '</span>';
        }
        if (!assigneesHtml) {
          assigneesHtml = '<span class="phase-assignees no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>';
        }

        // 報告書リンク
        var reportLinkClass = work.hasReport ? 'report-link' : 'report-link report-link-empty';
        var reportLink = '<a href="/report?task=' + encodeURIComponent(id) + '&project=' + encodeURIComponent(projectPath) + '" class="' + reportLinkClass + '" title="Work報告書を開く" onclick="event.stopPropagation()">📄</a>';

        // タスク詳細データ
        var taskInfoBase64 = encodeTaskInfo({
          id: id, title: title, description: work.description || '',
          status: status,
          assignees: (work.assignees || []).map(function(a) { return a.agentId; }).join(', ') || '担当なし',
          updatedAt: work.updatedAt || ''
        });

        // Stepをレンダリング
        var stepsHtml = '';
        if (steps.length > 0) {
          stepsHtml = '<div class="step-list">' +
            steps.map(function(step, idx, arr) {
              return renderStepItem(step, idx === arr.length - 1);
            }).join('') +
            '</div>';
        }

        return '<div class="phase-item ' + (status === 'working' ? 'highlight' : '') + '" data-id="' + escapeHtml(id) + '">' +
          '<div class="phase-header">' +
            '<span class="phase-id task-id-clickable" data-task-info="' + taskInfoBase64 + '" onclick="showTaskDetail(\\'' + escapeHtml(id) + '\\')">#' + escapeHtml(id) + '</span>' +
            '<span class="phase-name">[' + escapeHtml(title) + '] Work</span>' +
            '<span class="status ' + statusClass + '">' + statusIcon + '<span class="status-text"> ' + statusText + '</span></span>' +
            assigneesHtml +
            reportLink +
          '</div>' +
          stepsHtml +
        '</div>';
      }

      function renderStepItem(step, isLast) {
        var id = step.id || '';
        var title = step.title || '';
        var status = step.subStatus || step.status || 'pending';

        var statusIcon = statusIcons[status] || '⏳';
        var statusText = statusTextJp[status] || status;
        var statusClass = status === 'completed' ? 'completed' : (status === 'working' ? 'current' : '');
        var icon = isLast ? '└' : '├';
        var currentMarker = status === 'working' ? '<span class="current-marker">← 現在ここ</span>' : '';

        // 担当者HTML
        var assigneesHtml = '';
        if (step.assignees && step.assignees.length > 0) {
          var items = step.assignees.filter(function(a) { return a && a.agentId; }).map(function(a) {
            var maidIcon = maidIcons[a.agentId.toLowerCase()] || '👤';
            return '<span class="assignee-item"><span class="assignee-icon">' + maidIcon + '</span><span class="assignee-name">' + escapeHtml(a.agentId) + '</span></span>';
          }).join(' ');
          if (items) assigneesHtml = '<span class="step-assignees">' + items + '</span>';
        }
        if (!assigneesHtml) {
          assigneesHtml = '<span class="step-assignees no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>';
        }

        // 報告書リンク
        var reportLinkClass = step.hasReport ? 'report-link' : 'report-link report-link-empty';
        var reportLink = '<a href="/report?task=' + encodeURIComponent(id) + '&project=' + encodeURIComponent(projectPath) + '" class="' + reportLinkClass + '" title="Step報告書を開く" onclick="event.stopPropagation()">📄</a>';

        // タスク詳細データ
        var taskInfoBase64 = encodeTaskInfo({
          id: id, title: title, description: step.description || '',
          status: status,
          assignees: (step.assignees || []).map(function(a) { return a.agentId; }).join(', ') || '担当なし',
          updatedAt: step.updatedAt || ''
        });

        return '<div class="step-item ' + statusClass + '">' +
          '<span class="step-icon">' + icon + '</span>' +
          '<span class="step-id task-id-clickable" data-task-info="' + taskInfoBase64 + '" onclick="showTaskDetail(\\'' + escapeHtml(id) + '\\')">#' + escapeHtml(id) + '</span>' +
          '<span class="step-title"> ' + escapeHtml(title) + '</span>' +
          '<span class="step-status ' + status + '">' + statusIcon + '<span class="status-text"> ' + statusText + '</span></span>' +
          assigneesHtml +
          reportLink +
          currentMarker +
        '</div>';
      }

      // 成果物レンダリング
      function renderArtifacts(artifacts) {
        return artifacts.map(function(artifact) {
          var icon = artifact.type === 'document' ? '📄' : '📁';
          return '<div class="artifact-item" onclick="openFile(\\'' + escapeHtml(artifact.path) + '\\')">' +
            '<span class="artifact-icon">' + icon + '</span>' +
            '<span class="artifact-name">' + escapeHtml(artifact.name || artifact.path) + '</span>' +
            (artifact.taskId ? '<span class="artifact-task">#' + escapeHtml(artifact.taskId.replace('task-', '')) + '</span>' : '') +
            '</div>';
        }).join('');
      }

      // シンプルリストレンダリング（スキル候補/改善提案）- 現行準拠1行形式
      function renderSimpleList(items, category) {
        if (!items || items.length === 0) return '<div class="empty-message">なし</div>';
        var itemClass = category === 'skill_candidate' ? 'skill-item' : 'improvement-item';
        return items.map(function(item) {
          var taskInfoBase64 = encodeTaskInfo({
            id: item.id,
            title: item.title || '',
            description: item.description || '',
            status: 'pending',
            assignees: '',
            updatedAt: item.updatedAt || ''
          });
          return '<div class="task-item ' + itemClass + '" data-id="' + escapeHtml(item.id) + '">' +
            '<span class="task-id task-id-clickable" data-task-info="' + taskInfoBase64 + '" onclick="showTaskDetail(\\'' + escapeHtml(item.id) + '\\')">#' + escapeHtml(item.id.replace('task-', '')) + '</span>' +
            '<span class="task-title">' + escapeHtml(item.title || '') + '</span>' +
            '</div>';
        }).join('');
      }

      // ========================================
      // ソート（Open/Closed別）
      // ========================================
      function sortGoalsOpen(field) {
        if (v2GoalsOpenSortField === field) {
          v2GoalsOpenSortOrder = v2GoalsOpenSortOrder === 'desc' ? 'asc' : 'desc';
        } else {
          v2GoalsOpenSortField = field;
          v2GoalsOpenSortOrder = 'desc';
        }
        v2GoalsOpenCurrentPage = 0;
        updateGoalsOpenSortButtons();
        refreshGoalsOpen();
      }

      function sortGoalsClosed(field) {
        if (v2GoalsClosedSortField === field) {
          v2GoalsClosedSortOrder = v2GoalsClosedSortOrder === 'desc' ? 'asc' : 'desc';
        } else {
          v2GoalsClosedSortField = field;
          v2GoalsClosedSortOrder = 'desc';
        }
        v2GoalsClosedCurrentPage = 0;
        updateGoalsClosedSortButtons();
        refreshGoalsClosed();
      }

      function updateGoalsOpenSortButtons() {
        var idBtn = document.getElementById('v2-goals-open-sort-id');
        var updBtn = document.getElementById('v2-goals-open-sort-updated');
        if (idBtn) {
          idBtn.classList.toggle('active', v2GoalsOpenSortField === 'id');
          idBtn.textContent = v2GoalsOpenSortField === 'id' && v2GoalsOpenSortOrder === 'asc' ? '#↑' : '#↓';
        }
        if (updBtn) {
          updBtn.classList.toggle('active', v2GoalsOpenSortField === 'updatedAt');
          updBtn.textContent = v2GoalsOpenSortField === 'updatedAt' && v2GoalsOpenSortOrder === 'asc' ? '📅↑' : '📅↓';
        }
      }

      function updateGoalsClosedSortButtons() {
        var idBtn = document.getElementById('v2-goals-closed-sort-id');
        var updBtn = document.getElementById('v2-goals-closed-sort-updated');
        if (idBtn) {
          idBtn.classList.toggle('active', v2GoalsClosedSortField === 'id');
          idBtn.textContent = v2GoalsClosedSortField === 'id' && v2GoalsClosedSortOrder === 'asc' ? '#↑' : '#↓';
        }
        if (updBtn) {
          updBtn.classList.toggle('active', v2GoalsClosedSortField === 'updatedAt');
          updBtn.textContent = v2GoalsClosedSortField === 'updatedAt' && v2GoalsClosedSortOrder === 'asc' ? '📅↑' : '📅↓';
        }
      }

      // ========================================
      // V2.1 フィルタ・ソート・件数制限の初期化
      // ========================================
      function initV2Controls() {
        // 進行中セクションのソートボタン
        var sortOpenIdBtn = document.getElementById('v2-goals-open-sort-id');
        var sortOpenUpdBtn = document.getElementById('v2-goals-open-sort-updated');
        if (sortOpenIdBtn) sortOpenIdBtn.addEventListener('click', function() { sortGoalsOpen('id'); });
        if (sortOpenUpdBtn) sortOpenUpdBtn.addEventListener('click', function() { sortGoalsOpen('updatedAt'); });

        // 進行中セクションの件数制限ボタン
        var limitGroupOpen = document.getElementById('v2-goals-open-limit-group');
        if (limitGroupOpen) {
          limitGroupOpen.addEventListener('click', function(e) {
            var btn = e.target.closest('.v2-toggle-btn');
            if (!btn || btn.classList.contains('active')) return;
            limitGroupOpen.querySelectorAll('.v2-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            v2GoalsOpenLimit = parseInt(btn.dataset.value, 10) || 10;
            v2GoalsOpenCurrentPage = 0;
            refreshGoalsOpen();
          });
        }

        // 完了済みセクションのソートボタン
        var sortClosedIdBtn = document.getElementById('v2-goals-closed-sort-id');
        var sortClosedUpdBtn = document.getElementById('v2-goals-closed-sort-updated');
        if (sortClosedIdBtn) sortClosedIdBtn.addEventListener('click', function() { sortGoalsClosed('id'); });
        if (sortClosedUpdBtn) sortClosedUpdBtn.addEventListener('click', function() { sortGoalsClosed('updatedAt'); });

        // 完了済みセクションの件数制限ボタン
        var limitGroupClosed = document.getElementById('v2-goals-closed-limit-group');
        if (limitGroupClosed) {
          limitGroupClosed.addEventListener('click', function(e) {
            var btn = e.target.closest('.v2-toggle-btn');
            if (!btn || btn.classList.contains('active')) return;
            limitGroupClosed.querySelectorAll('.v2-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            v2GoalsClosedLimit = parseInt(btn.dataset.value, 10) || 10;
            v2GoalsClosedCurrentPage = 0;
            refreshGoalsClosed();
          });
        }

        // アーカイブチェックボックス
        var archivedCheckbox = document.getElementById('v2-goals-show-archived');
        if (archivedCheckbox) {
          archivedCheckbox.addEventListener('change', function() {
            v2GoalsClosedCurrentPage = 0;
            refreshGoalsClosed();
          });
        }

        // 検索・絞り込み
        initSearchFilter();
      }

      function initSearchFilter() {
        var searchBox = document.getElementById('v2-search-box');
        var priorityFilter = document.getElementById('v2-priority-filter');
        var assigneeFilter = document.getElementById('v2-assignee-filter');
        var clearBtn = document.getElementById('v2-filter-clear-btn');

        function executeSearch() {
          v2GoalsOpenCurrentPage = 0;
          v2GoalsClosedCurrentPage = 0;
          refreshGoalsOpen();
          refreshGoalsClosed();
        }

        if (searchBox) {
          searchBox.addEventListener('input', function() {
            v2FilterState.search = searchBox.value.trim();
            if (v2SearchDebounceTimer) clearTimeout(v2SearchDebounceTimer);
            v2SearchDebounceTimer = setTimeout(executeSearch, 300);
          });
          searchBox.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              if (v2SearchDebounceTimer) clearTimeout(v2SearchDebounceTimer);
              v2FilterState.search = searchBox.value.trim();
              executeSearch();
            }
          });
        }

        if (priorityFilter) {
          priorityFilter.addEventListener('change', function() {
            v2FilterState.priority = priorityFilter.value;
            executeSearch();
          });
        }

        if (assigneeFilter) {
          assigneeFilter.addEventListener('change', function() {
            v2FilterState.assignee = assigneeFilter.value;
            executeSearch();
          });
        }

        if (clearBtn) {
          clearBtn.addEventListener('click', function() {
            v2FilterState.search = '';
            v2FilterState.priority = '';
            v2FilterState.assignee = '';
            if (searchBox) searchBox.value = '';
            if (priorityFilter) priorityFilter.value = '';
            if (assigneeFilter) assigneeFilter.value = '';
            executeSearch();
          });
        }
      }

      // ========================================
      // セクション折りたたみ
      // ========================================
      window.toggleSection = function(section) {
        var content = document.getElementById(section.replace('review-queue', 'review-queue') + '-content');
        if (!content) content = document.getElementById(section + '-content');
        if (!content && section === 'team') content = document.getElementById('team-content');
        if (!content) return;

        var isCollapsed = content.style.display === 'none';
        content.style.display = isCollapsed ? '' : 'none';
        collapsedSections[section] = !isCollapsed;
      };

      // ========================================
      // Goal折りたたみ
      // ========================================
      window.toggleGoal = function(goalId) {
        collapsedGoals[goalId] = collapsedGoals[goalId] === false ? true : false;
        var goalItem = document.querySelector('.goal-item[data-id="' + goalId + '"]');
        if (!goalItem) return;
        var toggle = goalItem.querySelector('.goal-toggle');
        var content = goalItem.querySelector('.goal-content');
        if (toggle) toggle.classList.toggle('collapsed');
        if (content) content.style.display = collapsedGoals[goalId] ? 'none' : '';
      };

      // ========================================
      // タスク操作
      // ========================================
      window.toggleArchive = function(taskId) {
        fetchApi('/api/tasks/' + encodeURIComponent(taskId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: true })
        }).then(function() {
          refreshDashboard();
        }).catch(function(err) {
          alert('アーカイブに失敗しました: ' + err.message);
        });
      };

      window.closeGoal = function(taskId) {
        if (!confirm('このGoalを完了としてマークしますか？')) return;
        fetchApi('/dashboard/tasks/' + encodeURIComponent(taskId) + '/close', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' }
        }).then(function() {
          refreshDashboard();
        }).catch(function(err) {
          alert('Goal完了に失敗しました: ' + err.message);
        });
      };

      // ========================================
      // タスク詳細ポップアップ表示（現行準拠）
      // ========================================
      window.showTaskDetail = function(taskId) {
        fetchApi('/api/tasks/' + encodeURIComponent(taskId))
          .then(function(data) {
            if (!data.task) {
              alert('タスクが見つかりません');
              return;
            }
            var task = data.task;
            var taskStatus = task.subStatus || task.status || 'pending';
            var statusText = statusTextJp[taskStatus] || taskStatus;
            var updatedAtText = task.updatedAt ? new Date(task.updatedAt).toLocaleString('ja-JP') : '不明';
            var assigneesText = (task.assignees && task.assignees.length > 0)
              ? task.assignees.map(function(a) { return a.agentId; }).join(', ')
              : '担当なし';

            // 現行準拠: task-detail-overlay形式のポップアップを作成
            var existing = document.querySelector('.task-detail-overlay');
            if (existing) existing.remove();

            var overlay = document.createElement('div');
            overlay.className = 'task-detail-overlay';
            overlay.innerHTML =
              '<div class="task-detail-popup">' +
                '<div class="task-detail-header">' +
                  '<span class="task-detail-title">#' + escapeHtml(task.id) + ' ' + escapeHtml(task.title || '') + '</span>' +
                  '<button class="task-detail-close" title="閉じる">✕</button>' +
                '</div>' +
                '<div class="task-detail-body">' +
                  '<div class="task-detail-row">' +
                    '<div class="task-detail-label">説明</div>' +
                    '<div class="task-detail-value task-detail-description">' + (escapeHtml(task.description || '(なし)')) + '</div>' +
                  '</div>' +
                  '<div class="task-detail-row">' +
                    '<div class="task-detail-label">ステータス</div>' +
                    '<div class="task-detail-value">' + escapeHtml(statusText) + '</div>' +
                  '</div>' +
                  '<div class="task-detail-row">' +
                    '<div class="task-detail-label">担当者</div>' +
                    '<div class="task-detail-value">' + escapeHtml(assigneesText) + '</div>' +
                  '</div>' +
                  '<div class="task-detail-row">' +
                    '<div class="task-detail-label">更新日時</div>' +
                    '<div class="task-detail-value">' + updatedAtText + '</div>' +
                  '</div>' +
                '</div>' +
              '</div>';

            overlay.querySelector('.task-detail-close').addEventListener('click', function() {
              overlay.remove();
            });
            overlay.addEventListener('click', function(e) {
              if (e.target === overlay) overlay.remove();
            });
            document.body.appendChild(overlay);
          })
          .catch(function(err) {
            alert('タスク取得に失敗しました: ' + err.message);
          });
      };

      window.closeTaskDetail = function() {
        document.getElementById('taskDetailModal').classList.remove('show');
      };

      window.showAgentDetail = function(agentId) {
        // チームメンバーの詳細（現在のタスクなど）
        if (!currentData || !currentData.teamStatus) return;
        var agent = currentData.teamStatus.find(function(a) { return a.id === agentId; });
        if (!agent) return;
        if (agent.task_id) {
          showTaskDetail(agent.task_id);
        }
      };

      // ========================================
      // 報告書表示
      // ========================================
      window.openReport = function(taskId) {
        fetchApi('/api/tasks/' + encodeURIComponent(taskId) + '/report')
          .then(function(data) {
            if (!data.reports || data.reports.length === 0) {
              alert('報告書がありません');
              return;
            }
            var html = data.reports.map(function(report) {
              if (report.error) return '<div class="report-error">' + escapeHtml(report.error) + '</div>';
              return report.htmlContent || '<pre>' + escapeHtml(report.content) + '</pre>';
            }).join('<hr>');

            document.getElementById('reportTitle').textContent = '報告書 - #' + taskId.replace('task-', '');
            document.getElementById('reportContent').innerHTML = html;
            document.getElementById('reportOverlay').classList.add('show');
            closeTaskDetail();
          })
          .catch(function(err) {
            alert('報告書の取得に失敗しました: ' + err.message);
          });
      };

      window.closeReportOverlay = function() {
        document.getElementById('reportOverlay').classList.remove('show');
      };

      // ========================================
      // ファイルを開く
      // ========================================
      window.openFile = function(path) {
        window.open('/file?path=' + encodeURIComponent(path) + '&project=' + encodeURIComponent(projectPath), '_blank');
      };

      // ========================================
      // WebSocket
      // ========================================
      function connectWebSocket() {
        try {
          ws = new WebSocket(wsUrl);
          ws.onopen = function() {
            console.log('[SPA] WebSocket connected');
          };
          ws.onmessage = function(event) {
            try {
              var msg = JSON.parse(event.data);
              console.log('[SPA] WebSocket:', msg.type);
              switch (msg.type) {
                case 'taskUpdated':
                case 'taskCreated':
                case 'taskDeleted':
                case 'taskAssigned':
                case 'statusUpdated':
                case 'refresh':
                  refreshDashboard();
                  break;
                case 'ping':
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'pong' }));
                  }
                  break;
                case 'connected':
                  console.log('[SPA] Session ID:', msg.sessionId);
                  break;
                default:
                  console.log('[SPA] Unknown message type:', msg.type);
              }
            } catch (e) {
              console.error('[SPA] WebSocket parse error:', e);
            }
          };
          ws.onclose = function() {
            console.log('[SPA] WebSocket closed');
            scheduleReconnect();
          };
          ws.onerror = function(err) {
            console.error('[SPA] WebSocket error:', err);
          };
        } catch (e) {
          console.error('[SPA] WebSocket connection error:', e);
          scheduleReconnect();
        }
      }

      function scheduleReconnect() {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebSocket, 5000);
      }

      // ========================================
      // 初期化
      // ========================================
      initV2Controls();
      refreshDashboard();
      connectWebSocket();

      // キーボードショートカット
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          closeTaskDetail();
          closeReportOverlay();
        }
      });
    })();
  </script>
</body>
</html>`;
}
