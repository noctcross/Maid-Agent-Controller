/**
 * ダッシュボードCSS定義
 * dashboard-html.ts から分離
 *
 * 共通スタイルは shared-styles.ts, markdown-styles.ts から取得。
 */
import { getSharedCssVariables, getBaseResetStyles, getCardStyles } from "./shared-styles.js";
import { getScopedMarkdownStyles } from "./markdown-styles.js";
/**
 * V2.1 ダッシュボード用CSS
 * モックアップ dashboard-v2.1.html から抽出
 */
export function getV2DashboardStyles() {
    return `
    /* ========================================
     * V2.1 Dashboard Styles
     * ======================================== */

    /* V2.1 Container */
    .v2-sections {
      margin-top: 1rem;
    }

    /* V2.1 Grid Layout */
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
    }

    .grid-main {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .grid-full {
      grid-template-columns: 1fr;
    }

    /* V2.1 Stats Cards - Compact */
    .stat-card {
      background: var(--v2-bg-card);
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }

    .stat-card .number {
      font-size: 1.4rem;
      font-weight: bold;
      color: var(--v2-accent-blue);
      line-height: 1.2;
    }

    .stat-card .label {
      font-size: 0.65rem;
      color: var(--v2-text-secondary);
      margin-top: 2px;
      line-height: 1.2;
    }

    .stat-card.warning .number {
      color: var(--v2-accent-orange);
    }

    .stat-card.success .number {
      color: var(--v2-accent-green);
    }

    .stat-card.info .number {
      color: var(--v2-accent-purple);
    }

    /* V2.1 Filter Controls */
    .v2-filter-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: auto;
    }

    .v2-filter-select {
      padding: 4px 8px;
      border: 1px solid var(--border-color, #555);
      border-radius: 4px;
      background: var(--v2-bg-card, #2d2d2d);
      color: var(--v2-text-primary, #fff);
      font-size: 0.85rem;
      cursor: pointer;
    }

    .v2-filter-select:hover {
      border-color: var(--v2-accent-blue, #4a9eff);
    }

    .v2-filter-checkbox {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.85rem;
      color: var(--v2-text-secondary, #aaa);
      cursor: pointer;
    }

    .v2-filter-checkbox input[type="checkbox"] {
      cursor: pointer;
    }

    .v2-filter-checkbox:hover {
      color: var(--v2-text-primary, #fff);
    }

    /* V2.1 Goal Tree */
    .goal-tree-container {
      max-height: 500px;
      overflow-y: auto;
    }

    /* V2.1 archived タスクのスタイル */
    .goal-item[data-archived="true"],
    .phase-item[data-archived="true"],
    .action-item[data-archived="true"] {
      opacity: 0.5;
      background: var(--v2-bg-archived, rgba(100, 100, 100, 0.3));
    }

    .goal-item[data-archived="true"] .goal-header::after,
    .phase-item[data-archived="true"]::after {
      content: "📦";
      margin-left: auto;
      font-size: 0.75rem;
    }

    .goal-item {
      background: var(--v2-bg-card);
      border-radius: 6px;
      margin-bottom: 6px;
      overflow: hidden;
    }

    .goal-item[data-status="closed"] {
      opacity: 0.7;
    }

    .goal-header {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      cursor: pointer;
      gap: 8px;
      font-size: 0.85rem;
      flex-wrap: wrap;
    }

    .goal-header:hover {
      background: rgba(255,255,255,0.05);
    }

    .goal-toggle, .phase-toggle {
      font-size: 0.8rem;
      transition: transform 0.2s;
      cursor: pointer;
      flex-shrink: 0;
      width: 16px;
    }

    .goal-toggle.collapsed, .phase-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .phase-header {
      cursor: pointer;
    }

    .phase-header:hover {
      background: rgba(255,255,255,0.05);
    }

    .goal-title {
      flex: 1;
      font-weight: 500;
      min-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .goal-id {
      color: var(--v2-accent-blue);
      min-width: 55px;
      flex-shrink: 0;
    }

    .goal-content {
      padding: 0 10px 8px 25px;
    }

    .goal-summary {
      font-size: 0.8rem;
      color: var(--v2-text-secondary);
      margin-bottom: 8px;
      padding: 5px 8px;
      background: rgba(0,0,0,0.2);
      border-radius: 4px;
    }

    .goal-assignees {
      margin-top: 5px;
      font-size: 0.75rem;
      color: var(--v2-text-secondary);
    }

    .goal-assignees-inline {
      font-size: 0.7rem;
      color: var(--v2-text-secondary);
      background: rgba(255,255,255,0.05);
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
      flex-shrink: 0;
      min-width: 70px;
    }

    .phase-assignees,
    .action-assignees {
      font-size: 0.7rem;
      color: var(--v2-text-secondary);
      min-width: 60px;
      flex-shrink: 0;
      opacity: 0.8;
    }

    /* 担当者表示: アイコンとメイド名を分離 */
    .assignee-item {
      white-space: nowrap;
    }
    .assignee-icon {
      margin-right: 1px;
    }
    .assignee-name {
      /* デフォルトは表示 */
    }

    /* V2.1 Badges - Compact */
    .badge {
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.7rem;
      margin-left: 4px;
    }

    .badge-goal {
      background: var(--v2-accent-purple);
      color: white;
    }

    .badge-phase {
      background: var(--v2-accent-blue);
      color: white;
    }

    .badge-action {
      background: var(--v2-text-secondary);
      color: white;
    }

    .badge-size {
      background: rgba(255,255,255,0.1);
      color: var(--v2-text-secondary);
    }

    /* V2.1 Status */
    .status {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 0.75rem;
      min-width: 70px;
      flex-shrink: 0;
    }

    .status-active {
      background: rgba(74, 144, 217, 0.2);
      color: var(--v2-status-active);
    }

    .status-paused {
      background: rgba(136, 136, 136, 0.2);
      color: var(--v2-status-paused);
    }

    .status-checkpoint {
      background: rgba(255, 193, 7, 0.2);
      color: var(--v2-status-checkpoint);
    }

    .status-waiting {
      background: rgba(255, 152, 0, 0.2);
      color: var(--v2-status-waiting);
    }

    .status-completed {
      background: rgba(76, 175, 80, 0.2);
      color: var(--v2-status-completed);
    }

    .status-archived {
      background: rgba(102, 102, 102, 0.2);
      color: var(--v2-status-archived);
    }

    .status-pending {
      background: rgba(255, 193, 7, 0.2);
      color: var(--v2-status-checkpoint);
    }

    /* V2.1 Phase Tree - Compact */
    .phase-tree {
      border-left: 2px solid var(--v2-border-color);
      padding-left: 12px;
      margin-left: 4px;
    }

    .phase-item {
      position: relative;
      padding: 4px 0;
      font-size: 0.85rem;
    }

    .phase-item::before {
      content: '';
      position: absolute;
      left: -14px;
      top: 10px;
      width: 10px;
      height: 2px;
      background: var(--v2-border-color);
    }

    .phase-item.highlight {
      background: rgba(255, 193, 7, 0.1);
      border-radius: 4px;
      padding-left: 8px;
      margin-left: -8px;
    }

    .phase-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .phase-id {
      color: var(--v2-accent-blue);
      font-size: 0.85rem;
      min-width: 70px;
      flex-shrink: 0;
    }

    .phase-name {
      font-weight: 500;
      flex: 1;
      min-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .phase-status {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .phase-status.completed {
      background: rgba(76, 175, 80, 0.2);
      color: var(--v2-status-completed);
    }

    .phase-status.active {
      background: rgba(74, 144, 217, 0.2);
      color: var(--v2-status-active);
    }

    .phase-status.pending {
      background: rgba(136, 136, 136, 0.2);
      color: var(--v2-status-paused);
    }

    /* V2.1 Action List - Compact */
    .action-list {
      margin-top: 4px;
      padding-left: 15px;
      font-size: 0.8rem;
      color: var(--v2-text-secondary);
    }

    .v2-sections .action-item {
      display: flex;
      align-items: center;
      padding: 2px 0;
      gap: 6px;
    }

    .action-icon {
      color: var(--v2-text-secondary);
    }

    .action-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .v2-sections .action-item.completed .action-name {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .v2-sections .action-item.current {
      color: var(--v2-accent-blue);
      font-weight: 500;
    }

    .action-status {
      font-size: 0.75rem;
      padding: 1px 6px;
      border-radius: 3px;
      min-width: 60px;
      flex-shrink: 0;
    }

    .action-status.completed {
      background: rgba(76, 175, 80, 0.2);
      color: var(--v2-status-completed);
    }

    .action-status.active {
      background: rgba(74, 144, 217, 0.2);
      color: var(--v2-status-active);
    }

    .current-marker {
      color: var(--v2-accent-blue);
      font-size: 0.75rem;
      margin-left: 8px;
    }

    .action-content {
      flex: 1;
    }

    .action-title {
      font-weight: 500;
      margin-bottom: 2px;
    }

    .action-meta {
      font-size: 0.8rem;
      color: var(--v2-text-secondary);
    }

    .action-time {
      font-size: 0.8rem;
      color: var(--v2-text-secondary);
    }

    /* V2.1 Review Status */
    .review-status {
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.7rem;
    }

    .review-pending {
      background: var(--v2-review-pending);
      color: #f57f17;
    }

    .review-approved {
      background: var(--v2-review-approved);
      color: #2e7d32;
    }

    .review-rejected {
      background: var(--v2-review-rejected);
      color: #c62828;
    }

    /* V2.1 Report Link */
    .v2-sections .report-link {
      opacity: 0.6;
      text-decoration: none;
      cursor: pointer;
      background: transparent;
      flex-shrink: 0;
    }

    .v2-sections .report-link:hover {
      opacity: 1.0;
    }

    /* V2.1 担当なし表示 */
    .no-assignee {
      opacity: 0.5;
    }

    /* V2.1 Review Queue */
    .review-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      background: var(--v2-bg-card);
      border-radius: 8px;
      margin-bottom: 8px;
      gap: 10px;
    }

    .review-priority {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
    }

    .review-priority.high {
      background: var(--v2-accent-red);
      color: white;
    }

    .review-priority.normal {
      background: var(--v2-accent-blue);
      color: white;
    }

    .review-priority.low {
      background: var(--v2-text-secondary);
      color: white;
    }

    /* V2.1 Artifacts */
    .artifact-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      background: var(--v2-bg-card);
      border-radius: 8px;
      margin-bottom: 8px;
      gap: 10px;
    }

    .artifact-icon {
      font-size: 1.2rem;
    }

    .artifact-path {
      flex: 1;
      font-family: monospace;
      font-size: 0.85rem;
      color: var(--v2-accent-blue);
      text-decoration: none;
    }

    .artifact-path:hover {
      text-decoration: underline;
    }

    .artifact-retention {
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.7rem;
      background: rgba(255,255,255,0.1);
      color: var(--v2-text-secondary);
    }

    .artifact-source {
      font-size: 0.75rem;
      color: var(--v2-text-secondary);
    }

    /* V2.1 Proposals */
    .proposal-section {
      margin-bottom: 15px;
    }

    .proposal-section:last-child {
      margin-bottom: 0;
    }

    .proposal-section-title {
      font-size: 0.85rem;
      color: var(--v2-text-secondary);
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--v2-border-color);
    }

    .proposal-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      background: var(--v2-bg-card);
      border-radius: 8px;
      margin-bottom: 6px;
      gap: 10px;
    }

    .proposal-icon {
      font-size: 1.1rem;
    }

    .proposal-name {
      flex: 1;
      font-weight: 500;
    }

    .proposal-source {
      font-size: 0.75rem;
      color: var(--v2-text-secondary);
    }

    .proposal-status {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .proposal-status.pending {
      background: rgba(255, 193, 7, 0.2);
      color: var(--v2-accent-yellow);
    }

    .proposal-status.reviewing {
      background: rgba(74, 144, 217, 0.2);
      color: var(--v2-accent-blue);
    }

    /* V2.1 Team Grid (8 columns for 8 maids) */
    .v2-sections .team-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 10px;
    }

    .team-member {
      text-align: center;
      padding: 12px 8px;
      background: var(--v2-bg-card);
      border-radius: 8px;
    }

    .team-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--v2-bg-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 8px;
      font-size: 1.2rem;
    }

    .team-avatar.active {
      border: 2px solid var(--v2-accent-blue);
      box-shadow: 0 0 10px rgba(74, 144, 217, 0.5);
    }

    .team-avatar.idle {
      opacity: 0.5;
    }

    .team-name {
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .team-task {
      font-size: 0.75rem;
      color: var(--v2-text-secondary);
    }

    .team-task.working {
      color: var(--v2-accent-blue);
    }

    /* V2.1 Buttons */
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: opacity 0.2s;
    }

    .btn:hover {
      opacity: 0.8;
    }

    .btn-primary {
      background: var(--v2-accent-blue);
      color: white;
    }

    .btn-secondary {
      background: var(--v2-bg-card);
      color: var(--v2-text-primary);
    }

    /* V2.1 Section Styles */
    .v2-stats-section {
      margin-bottom: 20px;
    }

    .v2-goals-section,
    .v2-review-section,
    .v2-artifacts-section {
      margin-bottom: 15px;
    }

    .v2-goals-header-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .v2-goals-controls {
      display: flex;
      gap: 4px;
      margin-left: auto;
    }

    .v2-goals-controls .filter-toggle-btn {
      padding: 2px 8px;
      font-size: 0.7rem;
    }

    #v2GoalsPagination {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* V2.1 Responsive */
    @media (max-width: 1200px) {
      .grid-stats {
        grid-template-columns: repeat(4, 1fr);
      }

      .v2-sections .team-grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    @media (max-width: 768px) {
      .grid-main {
        grid-template-columns: 1fr;
      }

      .grid-stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .v2-sections .team-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      /* フィルタコントロールを縦並びに */
      .v2-filter-controls {
        flex-wrap: wrap;
        gap: 6px;
      }

      /* Goal/Phase ヘッダーをコンパクトに */
      .goal-header {
        flex-wrap: wrap;
        padding: 4px 8px;
      }
      .goal-header .status {
        font-size: 0.7rem;
        padding: 1px 4px;
      }
      .phase-header {
        flex-wrap: wrap;
      }
      .phase-header .status {
        font-size: 0.7rem;
        padding: 1px 4px;
      }
    }

    /* V2.1 Sort Controls */
    .v2-sort-controls {
      display: flex;
      gap: 4px;
      margin-left: 8px;
    }
    .v2-sort-controls .sort-toggle-btn {
      padding: 2px 8px;
      font-size: 0.75rem;
    }

    /* V2.1 スマホ対応: 500px以下 */
    @media (max-width: 500px) {
      /* V2.1 統計カード */
      .grid-stats {
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
      }
      .stat-card {
        padding: 10px 8px;
      }
      .stat-card .number {
        font-size: 1.5rem;
      }
      .stat-card .label {
        font-size: 0.75rem;
      }

      /* V2.1 Goal階層 */
      .goal-item {
        margin-bottom: 8px;
      }
      .goal-header {
        padding: 10px 12px;
        font-size: 0.9rem;
        gap: 6px;
      }
      .goal-toggle {
        font-size: 0.9rem;
      }
      .goal-title {
        font-size: 0.9rem;
        flex: 1;
        min-width: 0;
      }
      .goal-id {
        font-size: 0.85rem;
      }
      /* V2.1 スマホ: バッジ類を非表示にしてタイトルを優先表示 */
      .goal-header .badge-goal,
      .goal-header .badge-size {
        display: none;
      }
      .goal-header .status {
        font-size: 0.7rem;
        padding: 1px 4px;
        white-space: nowrap;
      }
      .goal-header .report-link {
        font-size: 0.8rem;
      }
      /* V2.1 スマホ: ステータスはアイコンのみ表示（テキスト非表示） */
      .goal-header .status-text,
      .phase-header .status-text,
      .action-item .status-text {
        display: none;
      }
      /* V2.1 スマホ: ステータス要素のmin-widthを解除、背景色なしに統一 */
      .goal-header .status,
      .phase-header .status,
      .action-item .action-status {
        min-width: auto;
        padding: 1px 4px;
        gap: 0;
        background: transparent;
      }
      /* V2.1 スマホ: 担当者メイド名を非表示（アイコンのみ表示） */
      .assignee-name {
        display: none;
      }
      /* V2.1 スマホ: 担当者エリアに固定幅を設定して縦揃え、背景色なし */
      .goal-assignees-inline,
      .phase-assignees,
      .action-assignees {
        min-width: 20px;
        background: transparent;
        padding: 0;
      }
      /* V2.1 スマホ: 報告書アイコンの間隔を統一（gapに任せる） */
      .goal-header .report-link,
      .phase-header .report-link {
        margin-left: 0;
      }
      /* V2.1 スマホ: Phase階層も同様にバッジを縮小 */
      .phase-header .badge {
        display: none;
      }
      .goal-content {
        padding: 0 10px 10px 24px;
      }
      .goal-summary {
        font-size: 0.85rem;
        padding: 8px 10px;
      }
      .goal-assignees {
        font-size: 0.8rem;
      }

      /* V2.1 バッジ */
      .badge {
        font-size: 0.75rem;
        padding: 2px 6px;
      }

      /* V2.1 ステータス */
      .status {
        font-size: 0.8rem;
        padding: 3px 8px;
        gap: 4px;
      }

      /* V2.1 Phase */
      .phase-tree {
        padding-left: 12px;
      }
      .phase-item {
        font-size: 0.9rem;
        padding: 6px 0;
      }
      .phase-header {
        gap: 6px;
      }
      .phase-id {
        font-size: 0.85rem;
      }
      .phase-name {
        font-size: 0.9rem;
      }
      .phase-status {
        font-size: 0.8rem;
        padding: 2px 8px;
      }

      /* V2.1 アクションリスト */
      .action-list {
        font-size: 0.85rem;
        padding-left: 14px;
      }
      .v2-sections .action-item {
        padding: 4px 0;
        gap: 6px;
      }
      .action-status {
        font-size: 0.8rem;
        padding: 2px 6px;
      }

      /* V2.1 レビューステータス */
      .review-status {
        font-size: 0.8rem;
        padding: 2px 8px;
      }

      /* V2.1 レビューキュー */
      .review-item {
        padding: 10px;
        gap: 8px;
        flex-wrap: wrap;
      }
      .review-priority {
        font-size: 0.8rem;
        padding: 3px 8px;
      }

      /* V2.1 成果物 */
      .artifact-item {
        padding: 10px;
        gap: 8px;
        flex-wrap: wrap;
      }
      .artifact-icon {
        font-size: 1.1rem;
      }
      .artifact-path {
        font-size: 0.8rem;
        word-break: break-all;
      }
      .artifact-retention {
        font-size: 0.75rem;
      }
      .artifact-source {
        font-size: 0.8rem;
      }

      /* V2.1 提案 */
      .proposal-item {
        padding: 10px;
        gap: 8px;
        flex-wrap: wrap;
      }
      .proposal-name {
        font-size: 0.9rem;
      }
      .proposal-source {
        font-size: 0.8rem;
      }
      .proposal-status {
        font-size: 0.8rem;
      }

      /* V2.1 チームメンバー */
      .v2-sections .team-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
      .team-member {
        padding: 10px 8px;
      }
      .team-avatar {
        width: 38px;
        height: 38px;
        font-size: 1.1rem;
        margin-bottom: 6px;
      }
      .team-name {
        font-size: 0.85rem;
      }
      .team-task {
        font-size: 0.8rem;
      }

      /* V2.1 フィルタコントロール */
      .v2-filter-controls {
        flex-wrap: wrap;
        gap: 8px;
      }
      .v2-filter-select {
        font-size: 0.85rem;
        padding: 5px 8px;
      }
      .v2-filter-checkbox {
        font-size: 0.85rem;
      }

      /* V2.1 ボタン */
      .btn {
        font-size: 0.9rem;
        padding: 10px 16px;
      }
    }
  `;
}
export function getDashboardStyles() {
    return `
    ${getSharedCssVariables()}
    ${getBaseResetStyles()}
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
    ${getCardStyles()}
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
    /* モバイル対応: 500px以下でスマホ表示を改善 */
    @media (max-width: 500px) {
      /* ヘッダー: 縦並びに変更 */
      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }
      .header h1 {
        font-size: 1.1rem;
      }
      .header .timestamp {
        font-size: 0.75rem;
      }
      .project-path {
        font-size: 0.65rem;
        word-break: break-all;
      }

      /* カード: パディング調整 */
      .card {
        padding: 8px;
      }
      .card-header {
        flex-wrap: wrap;
        gap: 6px;
      }
      .card-title {
        font-size: 0.9rem;
      }

      /* タスクアイテム: タッチしやすく */
      .task-item {
        padding: 8px 10px;
        font-size: 0.9rem;
        gap: 6px;
      }
      .task-id {
        font-size: 0.85rem;
        min-width: 40px;
      }
      .task-title {
        font-size: 0.85rem;
      }
      .task-priority,
      .task-assignee,
      .task-status,
      .task-date {
        font-size: 0.75rem;
      }
      .task-action-btn {
        font-size: 1rem;
        padding: 4px 6px;
      }

      /* チームグリッド: アイコン・名前を見やすく */
      .team-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
      }
      .agent-status {
        padding: 6px 8px;
        font-size: 0.85rem;
      }
      .agent-icon {
        font-size: 1rem;
      }
      .agent-name {
        font-size: 0.85rem;
      }
      .agent-row-mid {
        font-size: 0.75rem;
      }
      .agent-elapsed,
      .agent-substatus,
      .agent-task-desc {
        font-size: 0.7rem;
      }

      /* ステータスバッジ: 読みやすく */
      .count-badge {
        font-size: 0.8rem;
        padding: 2px 8px;
      }
      .task-substatus-inline {
        font-size: 0.8rem;
      }

      /* 統計セクション */
      .stats-grid {
        gap: 6px;
      }
      .stat-item {
        min-width: 70px;
        padding: 6px 8px;
      }
      .stat-value {
        font-size: 1.2rem;
      }
      .stat-label {
        font-size: 0.7rem;
      }

      /* フィルタ関連 */
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

      /* ソート・フィルタボタン */
      .sort-toggle-btn {
        font-size: 0.72rem;
        padding: 2px 8px;
      }
      .filter-toggle-btn {
        font-size: 0.75rem;
        padding: 3px 8px;
      }
      .pagination-btn {
        font-size: 0.8rem;
        padding: 4px 10px;
      }
    }
    .card-action-required { border-left: 3px solid var(--error-color); }
    .card-blocked { border-left: 3px solid #ff6b6b; }
    .card-skill { border-left: 3px solid #9b59b6; }
    .card-improvement { border-left: 3px solid #f39c12; }
    .action-required-item { border-left: 3px solid var(--error-color); }
    .blocked-item { border-left: 3px solid #ff6b6b; background: rgba(241, 76, 76, 0.15); }
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
    ${getScopedMarkdownStyles(".report-overlay-content")}
    /* ========================================
     * Toast Notification Styles (Phase6)
     * ======================================== */
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    }
    .toast {
      background: var(--card-bg, #1e1e3f);
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      animation: toastSlideIn 0.3s ease-out;
      border-left: 4px solid #6c757d;
    }
    .toast.severity-low { border-left-color: #17a2b8; }
    .toast.severity-medium { border-left-color: #ffc107; }
    .toast.severity-high { border-left-color: #fd7e14; }
    .toast.severity-critical {
      border-left-color: #dc3545;
      background: linear-gradient(135deg, #2d1f1f 0%, #1e1e3f 100%);
    }
    .toast-icon {
      font-size: 1.5em;
      flex-shrink: 0;
    }
    .toast-content {
      flex: 1;
      min-width: 0;
    }
    .toast-title {
      font-weight: bold;
      margin-bottom: 4px;
      color: var(--text-color, #fff);
    }
    .toast-message {
      font-size: 0.9em;
      color: var(--text-secondary, #aaa);
      word-break: break-word;
    }
    .toast-meta {
      font-size: 0.75em;
      color: var(--text-secondary, #888);
      margin-top: 6px;
    }
    .toast-close {
      background: transparent;
      border: none;
      color: var(--text-secondary, #888);
      cursor: pointer;
      font-size: 1.2em;
      padding: 0;
      line-height: 1;
      flex-shrink: 0;
    }
    .toast-close:hover { color: var(--text-color, #fff); }
    .toast.hiding {
      animation: toastSlideOut 0.3s ease-in forwards;
    }
    @keyframes toastSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes toastSlideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    ${getV2DashboardStyles()}
  `;
}
