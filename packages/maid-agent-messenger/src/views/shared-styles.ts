/**
 * 共通CSSスタイル定義
 *
 * Web版/IDE版ダッシュボードで共通利用するCSS変数・基本スタイル。
 * dashboard-styles.ts, web-dashboard.ts から参照される。
 */

/**
 * ダッシュボード共通CSS変数
 */
export function getSharedCssVariables(): string {
  return `
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

      /* V2.1: ダッシュボード用CSS変数（22個） */
      --v2-bg-primary: #1a1a2e;
      --v2-bg-secondary: #16213e;
      --v2-bg-card: #0f3460;
      --v2-text-primary: #eee;
      --v2-text-secondary: #aaa;
      --v2-accent-blue: #4a90d9;
      --v2-accent-green: #4caf50;
      --v2-accent-yellow: #ffc107;
      --v2-accent-orange: #ff9800;
      --v2-accent-red: #f44336;
      --v2-accent-purple: #9c27b0;
      --v2-border-color: #2a3f5f;
      --v2-status-active: #4a90d9;
      --v2-status-paused: #888;
      --v2-status-checkpoint: #ffc107;
      --v2-status-waiting: #ff9800;
      --v2-status-completed: #4caf50;
      --v2-status-archived: #666;
      --v2-review-pending: #fffde7;
      --v2-review-inprogress: #e3f2fd;
      --v2-review-approved: #e8f5e9;
      --v2-review-rejected: #ffebee;
    }
  `;
}

/**
 * 基本リセットスタイル
 */
export function getBaseResetStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      background: var(--bg-color);
      color: var(--text-color);
      padding: 20px;
      min-height: 100vh;
    }
  `;
}

/**
 * カード共通スタイル
 */
export function getCardStyles(): string {
  return `
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
  `;
}
