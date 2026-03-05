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
export function getMarkdownStyles(): string {
  return `
    h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em; }
    h1 { font-size: 1.4em; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; }
    h2 { font-size: 1.15em; color: var(--v2-accent-yellow); border-bottom: 1px solid var(--v2-border-subtle); padding-bottom: 4px; }
    h3 { font-size: 1.05em; color: var(--v2-accent-green-light); }
    h4, h5, h6 { color: var(--v2-accent-green-light); }
    p { margin: 8px 0; }
    ul { margin: 6px 0; padding-left: 25px; }
    li { margin: 4px 0; list-style-type: disc; }
    ol { margin: 6px 0; padding-left: 25px; }
    ol li { list-style-type: decimal; }
    .checkbox { padding: 4px 0; }
    .checkbox.checked { color: var(--v2-accent-green-light); }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid var(--v2-border-subtle); padding: 6px 10px; text-align: left; }
    th { background: rgba(255,255,255,0.1); color: var(--v2-accent-yellow); }
    pre { background: var(--v2-bg-code); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
    pre code { background: none; padding: 0; }
    code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', 'Monaco', monospace; font-size: 0.9em; }
    hr { border: none; border-top: 1px solid var(--v2-border-subtle); margin: 16px 0; }
    a { color: var(--v2-link-color); }
    strong { color: var(--v2-accent-yellow); }
    em { font-style: italic; color: #aaa; }
  `;
}

/**
 * 親セレクタでスコープされたMarkdownスタイル
 *
 * .report-overlay-content 等、特定のコンテナ内でのみ適用する場合に使用。
 * convertMarkdownToHtml() が生成するHTMLタグに合わせてタグセレクタを使用。
 * @param parentSelector - 親セレクタ（例: ".report-overlay-content"）
 */
export function getScopedMarkdownStyles(parentSelector: string): string {
  return `
    ${parentSelector} h1, ${parentSelector} h2, ${parentSelector} h3,
    ${parentSelector} h4, ${parentSelector} h5, ${parentSelector} h6 { margin: 1.5em 0 0.5em; }
    ${parentSelector} h1 { font-size: 1.4em; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; }
    ${parentSelector} h2 { font-size: 1.15em; color: var(--v2-accent-yellow); border-bottom: 1px solid var(--v2-border-subtle); padding-bottom: 4px; }
    ${parentSelector} h3 { font-size: 1.05em; color: var(--v2-accent-green-light); }
    ${parentSelector} h4, ${parentSelector} h5, ${parentSelector} h6 { color: var(--v2-accent-green-light); }
    ${parentSelector} p { margin: 8px 0; }
    ${parentSelector} ul { margin: 6px 0; padding-left: 25px; }
    ${parentSelector} li { margin: 4px 0; list-style-type: disc; }
    ${parentSelector} ol { margin: 6px 0; padding-left: 25px; }
    ${parentSelector} ol li { list-style-type: decimal; }
    ${parentSelector} .checkbox { padding: 4px 0; }
    ${parentSelector} .checkbox.checked { color: var(--v2-accent-green-light); }
    ${parentSelector} table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    ${parentSelector} th, ${parentSelector} td { border: 1px solid var(--v2-border-subtle); padding: 6px 10px; text-align: left; }
    ${parentSelector} th { background: rgba(255,255,255,0.1); color: var(--v2-accent-yellow); }
    ${parentSelector} pre { background: var(--v2-bg-code); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
    ${parentSelector} pre code { background: none; padding: 0; }
    ${parentSelector} code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', 'Monaco', monospace; font-size: 0.9em; }
    ${parentSelector} hr { border: none; border-top: 1px solid var(--v2-border-subtle); margin: 16px 0; }
    ${parentSelector} a { color: var(--v2-link-color); }
    ${parentSelector} strong { color: var(--v2-accent-yellow); }
    ${parentSelector} em { font-style: italic; color: #aaa; }
  `;
}
