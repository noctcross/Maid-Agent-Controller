/**
 * Dashboard HTMLテンプレート生成
 *
 * dashboard-html.ts から抽出したHTMLボディテンプレートを生成する関数群。
 * 統計、チーム状態、タスクリスト等のHTML構造を定義。
 *
 * @module dashboard-template
 */

import { escapeHtml } from "../markdown-utils.js";

/**
 * ダッシュボードボディテンプレートのパラメータ
 */
export interface DashboardBodyParams {
  /** プロジェクトパス */
  projectPath: string;
  /** タイムスタンプ（更新時刻） */
  timestamp: string;
  /** 統計情報 */
  stats: {
    pendingCount: number;
    workingCount: number;
    masterWaitingCount: number;
    completedTodayCount: number;
  };
  /** チームステータスHTML */
  teamStatusHtml: string;
  /** 対応待ちセクション件数 */
  masterWaitingCount: number;
  /** 対応待ちセクションHTML */
  masterWaitingSectionHtml: string;
  /** 待機中タスク件数 */
  filteredPendingCount: number;
  /** 待機中タスクHTML */
  pendingHtml: string;
  /** 進行中タスク件数 */
  workingCount: number;
  /** 進行中タスクHTML */
  workingHtml: string;
  /** 完了タスク総数 */
  completedTotal: number;
  /** 完了タスクHTML */
  completedHtml: string;
  /** スキル候補件数 */
  skillCandidatesCount: number;
  /** スキル候補HTML */
  skillCandidatesHtml: string;
  /** 改善提案件数 */
  improvementsCount: number;
  /** 改善提案HTML */
  improvementsHtml: string;
}

/**
 * ダッシュボードのボディテンプレートを生成
 *
 * @param params - テンプレートパラメータ
 * @returns `<body>` タグを含むHTMLボディ文字列（閉じタグなし）
 */
export function getDashboardBodyTemplate(params: DashboardBodyParams): string {
  const {
    projectPath,
    timestamp,
    stats,
    teamStatusHtml,
    masterWaitingCount,
    masterWaitingSectionHtml,
    filteredPendingCount,
    pendingHtml,
    workingCount,
    workingHtml,
    completedTotal,
    completedHtml,
    skillCandidatesCount,
    skillCandidatesHtml,
    improvementsCount,
    improvementsHtml,
  } = params;

  return `
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
        <span class="count-badge count-badge-alert">${masterWaitingCount}</span>
      </div>
      <div class="collapsible-content">
        ${masterWaitingSectionHtml}
      </div>
    </div>

    <div class="card" data-section="pending">
      <div class="card-header">
        <span class="card-title">⏳ 待機中</span>
        <span class="card-count">${filteredPendingCount}</span>
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
        <span class="card-count">${workingCount}</span>
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
        <span class="count-badge count-badge-purple">${skillCandidatesCount}</span>
      </div>
      <div class="collapsible-content">
        ${skillCandidatesHtml}
      </div>
    </div>

    <div class="card card-improvement" data-section="improvements">
      <div class="card-header collapsible-header">
        <span class="card-title">💡 改善提案</span>
        <span class="count-badge count-badge-orange">${improvementsCount}</span>
      </div>
      <div class="collapsible-content">
        ${improvementsHtml}
      </div>
    </div>
  </div>
`;
}

/**
 * レポートオーバーレイのHTMLを生成
 *
 * @returns レポートオーバーレイのHTML文字列
 */
export function getReportOverlayHtml(): string {
  return `
  <!-- レポートオーバーレイ（VSCode Webview内でレポートを表示） -->
  <div id="reportOverlay" class="report-overlay">
    <div class="report-overlay-header">
      <h2 id="reportTitle">📄 Report</h2>
      <button class="report-close-btn">✕ 閉じる</button>
    </div>
    <div id="reportContent" class="report-overlay-content"></div>
  </div>`;
}
