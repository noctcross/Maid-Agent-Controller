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
export declare const COLORS: {
    readonly BG_PRIMARY: "#1a1a2e";
    readonly BG_SECONDARY: "#16213e";
    readonly BG_CARD: "#0f3460";
    readonly BG_CARD_ALT: "#1e2a4a";
    readonly BG_CODE: "#0a0a0a";
    readonly BG_DARK: "#1e1e1e";
    readonly BG_CARD_DARK: "#252526";
    readonly ACCENT_CORAL: "#e94560";
    readonly ACCENT_CORAL_HOVER: "#d63050";
    readonly ACCENT_BLUE: "#4a90d9";
    readonly ACCENT_BLUE_LIGHT: "#569cd6";
    readonly ACCENT_GREEN: "#4caf50";
    readonly ACCENT_GREEN_LIGHT: "#81c784";
    readonly ACCENT_YELLOW: "#ffc107";
    readonly ACCENT_ORANGE: "#ff9800";
    readonly ACCENT_RED: "#f44336";
    readonly ACCENT_RED_LIGHT: "#f14c4c";
    readonly ACCENT_PURPLE: "#9c27b0";
    readonly ACCENT_TEAL: "#4ec9b0";
    readonly TEXT_PRIMARY: "#e0e0e0";
    readonly TEXT_SECONDARY: "#a0a0a0";
    readonly TEXT_MUTED: "#808080";
    readonly TEXT_LIGHT: "#cccccc";
    readonly LINK_CYAN: "#4fc3f7";
    readonly LINK_TEAL: "#4ec9b0";
    readonly LINK_LIGHT_BLUE: "#7fdbff";
    readonly BORDER_PRIMARY: "#2a3f5f";
    readonly BORDER_DARK: "#3c3c3c";
    readonly BORDER_SUBTLE: "#444";
    readonly STATUS_WORKING: "#ffc107";
    readonly STATUS_COMPLETED: "#4caf50";
    readonly STATUS_BLOCKED: "#ff6b6b";
    readonly STATUS_SKILL: "#9b59b6";
    readonly STATUS_IMPROVEMENT: "#f39c12";
};
/**
 * ダッシュボード共通CSS変数
 */
export declare function getSharedCssVariables(): string;
/**
 * 基本リセットスタイル
 */
export declare function getBaseResetStyles(): string;
/**
 * カード共通スタイル
 */
export declare function getCardStyles(): string;
