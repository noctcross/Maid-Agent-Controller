/**
 * 共通CSSスタイル定義
 *
 * Web版/IDE版ダッシュボードで共通利用するCSS変数・基本スタイル。
 * dashboard-styles.ts, web-dashboard.ts から参照される。
 */
/**
 * カラーパレット定数（TypeScript用）
 * CSS変数と同期して使用
 */
export const COLORS = {
    // 背景色
    BG_PRIMARY: '#1a1a2e',
    BG_SECONDARY: '#16213e',
    BG_CARD: '#0f3460',
    BG_CARD_ALT: '#1e2a4a',
    BG_CODE: '#0a0a0a',
    BG_DARK: '#1e1e1e',
    BG_CARD_DARK: '#252526',
    // アクセントカラー
    ACCENT_CORAL: '#e94560',
    ACCENT_CORAL_HOVER: '#d63050',
    ACCENT_BLUE: '#4a90d9',
    ACCENT_BLUE_LIGHT: '#569cd6',
    ACCENT_GREEN: '#4caf50',
    ACCENT_GREEN_LIGHT: '#81c784',
    ACCENT_YELLOW: '#ffc107',
    ACCENT_ORANGE: '#ff9800',
    ACCENT_RED: '#f44336',
    ACCENT_RED_LIGHT: '#f14c4c',
    ACCENT_PURPLE: '#9c27b0',
    ACCENT_TEAL: '#4ec9b0',
    // テキスト色
    TEXT_PRIMARY: '#e0e0e0',
    TEXT_SECONDARY: '#a0a0a0',
    TEXT_MUTED: '#808080',
    TEXT_LIGHT: '#cccccc',
    // リンク色
    LINK_CYAN: '#4fc3f7',
    LINK_TEAL: '#4ec9b0',
    LINK_LIGHT_BLUE: '#7fdbff',
    // ボーダー色
    BORDER_PRIMARY: '#2a3f5f',
    BORDER_DARK: '#3c3c3c',
    BORDER_SUBTLE: '#444',
    // ステータス色
    STATUS_WORKING: '#ffc107',
    STATUS_COMPLETED: '#4caf50',
    STATUS_BLOCKED: '#ff6b6b',
    STATUS_SKILL: '#9b59b6',
    STATUS_IMPROVEMENT: '#f39c12',
};
/**
 * ダッシュボード共通CSS変数
 */
export function getSharedCssVariables() {
    return `
    :root {
      --bg-color: ${COLORS.BG_DARK};
      --card-bg: ${COLORS.BG_CARD_DARK};
      --border-color: ${COLORS.BORDER_DARK};
      --text-color: ${COLORS.TEXT_LIGHT};
      --text-muted: ${COLORS.TEXT_MUTED};
      --accent-color: ${COLORS.ACCENT_BLUE_LIGHT};
      --success-color: ${COLORS.ACCENT_TEAL};
      --warning-color: #dcdcaa;
      --error-color: ${COLORS.ACCENT_RED_LIGHT};

      /* V2.1: ダッシュボード用CSS変数 */
      --v2-bg-primary: ${COLORS.BG_PRIMARY};
      --v2-bg-secondary: ${COLORS.BG_SECONDARY};
      --v2-bg-card: ${COLORS.BG_CARD};
      --v2-bg-code: ${COLORS.BG_CODE};
      --v2-text-primary: #eee;
      --v2-text-secondary: #aaa;

      /* アクセントカラー */
      --v2-accent-coral: ${COLORS.ACCENT_CORAL};
      --v2-accent-coral-hover: ${COLORS.ACCENT_CORAL_HOVER};
      --v2-accent-blue: ${COLORS.ACCENT_BLUE};
      --v2-accent-green: ${COLORS.ACCENT_GREEN};
      --v2-accent-green-light: ${COLORS.ACCENT_GREEN_LIGHT};
      --v2-accent-yellow: ${COLORS.ACCENT_YELLOW};
      --v2-accent-orange: ${COLORS.ACCENT_ORANGE};
      --v2-accent-red: ${COLORS.ACCENT_RED};
      --v2-accent-purple: ${COLORS.ACCENT_PURPLE};

      /* リンク・テキスト */
      --v2-link-color: ${COLORS.LINK_CYAN};
      --v2-link-teal: ${COLORS.LINK_TEAL};

      /* ボーダー */
      --v2-border-color: ${COLORS.BORDER_PRIMARY};
      --v2-border-subtle: ${COLORS.BORDER_SUBTLE};

      /* ステータス色 */
      --v2-status-active: ${COLORS.ACCENT_BLUE};
      --v2-status-paused: #888;
      --v2-status-checkpoint: ${COLORS.STATUS_WORKING};
      --v2-status-waiting: ${COLORS.ACCENT_ORANGE};
      --v2-status-completed: ${COLORS.STATUS_COMPLETED};
      --v2-status-archived: #666;
      --v2-status-blocked: ${COLORS.STATUS_BLOCKED};
      --v2-status-skill: ${COLORS.STATUS_SKILL};
      --v2-status-improvement: ${COLORS.STATUS_IMPROVEMENT};

      /* レビュー状態 */
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
export function getBaseResetStyles() {
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
export function getCardStyles() {
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
