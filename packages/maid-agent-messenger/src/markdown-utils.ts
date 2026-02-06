/**
 * マークダウン→HTML変換ユーティリティ
 *
 * central-server.ts から抽出。テスト可能にするため独立モジュール化。
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 簡易マークダウン→HTML変換
 */
export function convertMarkdownToHtml(markdown: string): string {
  let html = escapeHtml(markdown);

  // コードブロック（```）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // インラインコード（`）
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 見出し（# ～ ######）
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 太字と斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 箇条書きリスト（- または *）- 番号付きリストより先に処理
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // 番号付きリスト（1. 2. 3. ...）- 箇条書き処理後に実行
  html = html.replace(/(^\d+\.\s+.+$\n?)+/gm, (match) => {
    const endsWithNewline = match.endsWith('\n');
    const items = match.trim().split('\n').map(line => {
      const m = line.match(/^\d+\.\s+(.+)$/);
      return m ? `<li>${m[1]}</li>` : line;
    }).join('\n');
    return `<ol>\n${items}\n</ol>${endsWithNewline ? '\n' : ''}`;
  });

  // 水平線
  html = html.replace(/^---+$/gm, '<hr>');

  // リンク
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // 段落（空行で区切られたテキスト）
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  // 単一改行をbrに変換（ブロック要素の境界以外）
  // pre内の改行を保護
  html = html.replace(/<pre[\s\S]*?<\/pre>/g, (match) => match.replace(/\n/g, '\x00'));
  // タグ直後以外の改行をbrに変換
  html = html.replace(/([^>])\n/g, '$1<br>\n');
  // 保護した改行を復元
  html = html.replace(/\x00/g, '\n');

  // 空の段落を削除
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ol>)/g, '$1');
  html = html.replace(/(<\/ol>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)<\/p>/g, '$1');

  return html;
}
