/**
 * Markdownレンダリング用CSSスタイル定義
 *
 * レポートビューア、レポートオーバーレイで共通利用。
 * dashboard-styles.ts, web-dashboard.ts から参照される。
 */
/**
 * Markdownコンテンツ表示用スタイル
 */
export declare function getMarkdownStyles(): string;
/**
 * 親セレクタでスコープされたMarkdownスタイル
 *
 * .report-overlay-content 等、特定のコンテナ内でのみ適用する場合に使用。
 * @param parentSelector - 親セレクタ（例: ".report-overlay-content"）
 */
export declare function getScopedMarkdownStyles(parentSelector: string): string;
