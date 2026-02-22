/**
 * Goal詳細画面CSS定義
 * goal-detail-v2.1.html モックアップから抽出
 *
 * V2.1 Dashboard用のGoal詳細画面スタイルを定義。
 * 共通CSS変数はshared-styles.tsから継承。
 */

/**
 * Goal詳細画面用スタイルを取得
 */
export function getGoalDetailStyles(): string {
  return `
    /* ========================================
     * Goal Detail V2.1 Styles
     * ======================================== */

    /* Container */
    .goal-detail-container {
      max-width: 1000px;
      margin: 0 auto;
    }

    /* Detail Header */
    .detail-header {
      background: var(--v2-bg-secondary);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .detail-header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
    }

    .detail-title {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .detail-id {
      font-size: 1.5rem;
      color: var(--v2-accent-blue);
      font-weight: bold;
    }

    .detail-name {
      font-size: 1.5rem;
      font-weight: bold;
    }

    .back-btn {
      padding: 8px 16px;
      background: var(--v2-bg-card);
      border: none;
      border-radius: 5px;
      color: var(--v2-text-primary);
      cursor: pointer;
      font-size: 0.9rem;
    }

    .back-btn:hover {
      background: var(--v2-border-color);
    }

    /* Summary Box */
    .summary-box {
      background: var(--v2-bg-card);
      border-radius: 8px;
      padding: 15px;
      line-height: 1.6;
    }

    /* Review History Table */
    .review-table {
      width: 100%;
      border-collapse: collapse;
    }

    .review-table th,
    .review-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--v2-border-color);
    }

    .review-table th {
      background: var(--v2-bg-card);
      font-weight: 500;
      color: var(--v2-text-secondary);
      font-size: 0.85rem;
    }

    .review-table tr:last-child td {
      border-bottom: none;
    }

    .review-table tr:hover td {
      background: rgba(255,255,255,0.03);
    }

    /* Artifacts Table */
    .artifacts-table {
      width: 100%;
      border-collapse: collapse;
    }

    .artifacts-table th,
    .artifacts-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--v2-border-color);
    }

    .artifacts-table th {
      background: var(--v2-bg-card);
      font-weight: 500;
      color: var(--v2-text-secondary);
      font-size: 0.85rem;
    }

    .artifacts-table tr:last-child td {
      border-bottom: none;
    }

    .artifact-link {
      color: var(--v2-accent-blue);
      text-decoration: none;
      font-family: monospace;
      font-size: 0.9rem;
    }

    .artifact-link:hover {
      text-decoration: underline;
    }

    .artifact-status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .artifact-status.active {
      color: var(--v2-accent-blue);
    }

    .artifact-status.done {
      color: var(--v2-accent-green);
    }

    /* Goal Detail Phase Tree (extends base phase-tree) */
    .goal-detail-container .phase-tree {
      background: var(--v2-bg-card);
      border-radius: 8px;
      padding: 15px;
      border-left: none;
    }

    .goal-detail-container .phase-item {
      position: relative;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 8px;
      border-left: 4px solid var(--v2-border-color);
    }

    .goal-detail-container .phase-item:last-child {
      margin-bottom: 0;
    }

    .goal-detail-container .phase-item::before {
      display: none;
    }

    .goal-detail-container .phase-item.completed {
      border-left-color: var(--v2-accent-green);
      background: rgba(76, 175, 80, 0.05);
    }

    .goal-detail-container .phase-item.active {
      border-left-color: var(--v2-accent-blue);
      background: rgba(74, 144, 217, 0.1);
    }

    .goal-detail-container .phase-item.pending {
      border-left-color: var(--v2-text-secondary);
      opacity: 0.7;
    }

    .goal-detail-container .phase-item.highlight {
      background: rgba(255, 253, 231, 0.15);
      border-left-color: var(--v2-accent-yellow);
    }

    .goal-detail-container .phase-header {
      margin-bottom: 8px;
    }

    .goal-detail-container .phase-name {
      font-weight: 600;
      font-size: 1rem;
    }

    /* Review Badge in Detail */
    .goal-detail-container .review-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    /* Current Action Marker */
    .goal-detail-container .current-marker {
      color: var(--v2-accent-yellow);
      font-weight: bold;
    }

    /* Info Grid */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }

    .info-item {
      background: var(--v2-bg-card);
      padding: 15px;
      border-radius: 8px;
    }

    .info-label {
      font-size: 0.8rem;
      color: var(--v2-text-secondary);
      margin-bottom: 5px;
    }

    .info-value {
      font-size: 1rem;
    }

    /* Assignee List */
    .assignee-list {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .assignee {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: var(--v2-bg-secondary);
      border-radius: 20px;
      font-size: 0.85rem;
    }

    /* Goal Detail Card Override */
    .goal-detail-container .card {
      background: var(--v2-bg-secondary);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      border: 1px solid var(--v2-border-color);
    }

    .goal-detail-container .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--v2-border-color);
    }

    .goal-detail-container .card-header h2 {
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    /* Goal Detail Responsive */
    @media (max-width: 768px) {
      .info-grid {
        grid-template-columns: 1fr;
      }

      .detail-header-top {
        flex-direction: column;
        gap: 15px;
      }
    }
  `;
}
