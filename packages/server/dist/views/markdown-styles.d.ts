/**
 * Markdownレンダリング用CSSスタイル定義
 *
 * レポートビューア、レポートオーバーレイで共通利用。
 * dashboard-styles.ts, web-dashboard.ts から参照される。
 *
 * 注: CSS変数は shared-styles.ts で定義。
 * 注: convertMarkdownToHtml() はクラスなしのHTMLタグを生成するため、
 *     タグセレクタでスタイルを定義する（file-routes.ts と同じ方式）。
 */
/**
 * Markdownコンテンツ表示用スタイル（グローバル）
 * @deprecated getScopedMarkdownStyles() を使用してください
 */
export declare function getMarkdownStyles(): string;
/**
 * 親セレクタでスコープされたMarkdownスタイル
 *
 * .report-overlay-content 等、特定のコンテナ内でのみ適用する場合に使用。
 * convertMarkdownToHtml() が生成するHTMLタグに合わせてタグセレクタを使用。
 * @param parentSelector - 親セレクタ（例: ".report-overlay-content"）
 */
export declare function getScopedMarkdownStyles(parentSelector: string): string;
//# sourceMappingURL=markdown-styles.d.ts.map