/**
 * Markdownレンダリング用CSSスタイル定義
 *
 * レポートビューア、レポートオーバーレイで共通利用。
 * dashboard-styles.ts, web-dashboard.ts から参照される。
 */

/**
 * Markdownコンテンツ表示用スタイル
 */
export function getMarkdownStyles(): string {
  return `
    .md-h1 { font-size: 1.4em; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; margin: 16px 0 12px 0; }
    .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
    .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
    .md-p { margin: 8px 0; }
    .md-ul { margin: 6px 0; padding-left: 25px; }
    .md-li { margin: 4px 0; list-style-type: disc; }
    .md-checkbox { padding: 4px 0; }
    .md-checkbox.checked { color: #81c784; }
    .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    .md-table th, .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
    .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
    .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
    .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
    .md-hr { border: none; border-top: 1px solid #444; margin: 16px 0; }
    .md-link { color: #4fc3f7; }
    strong { color: #ffc107; }
    em { font-style: italic; color: #aaa; }
  `;
}

/**
 * 親セレクタでスコープされたMarkdownスタイル
 *
 * .report-overlay-content 等、特定のコンテナ内でのみ適用する場合に使用。
 * @param parentSelector - 親セレクタ（例: ".report-overlay-content"）
 */
export function getScopedMarkdownStyles(parentSelector: string): string {
  return `
    ${parentSelector} .md-h1 { font-size: 1.4em; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; margin: 16px 0 12px 0; }
    ${parentSelector} .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
    ${parentSelector} .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
    ${parentSelector} .md-p { margin: 8px 0; }
    ${parentSelector} .md-ul { margin: 6px 0; padding-left: 25px; }
    ${parentSelector} .md-li { margin: 4px 0; list-style-type: disc; }
    ${parentSelector} .md-checkbox { padding: 4px 0; }
    ${parentSelector} .md-checkbox.checked { color: #81c784; }
    ${parentSelector} .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    ${parentSelector} .md-table th, ${parentSelector} .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
    ${parentSelector} .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
    ${parentSelector} .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
    ${parentSelector} .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
    ${parentSelector} .md-hr { border: none; border-top: 1px solid #444; margin: 16px 0; }
    ${parentSelector} .md-link { color: #4fc3f7; }
    ${parentSelector} strong { color: #ffc107; }
    ${parentSelector} em { font-style: italic; color: #aaa; }
  `;
}
