/**
 * マークダウン→HTML変換ユーティリティ
 *
 * central-server.ts から抽出。テスト可能にするため独立モジュール化。
 */
import path from "path";
export function escapeHtml(str) {
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
export function convertMarkdownToHtml(markdown) {
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
/**
 * パスリンク化で検出するプレフィクスのデフォルト値
 * プロジェクト固有のプレフィクス（例: "VSCode拡張"）は
 * linkifyProjectPaths() の第3引数で追加可能
 */
export const DEFAULT_PATH_PREFIXES = [
    "docs",
    "\\.maid-agent",
    "src",
    "packages",
    "tests?",
    "scripts",
    "\\.github",
    "config",
];
/**
 * 相対パスをWindows絶対パスに変換（WSL環境対応）
 * 既存のreportPathsリンク生成ロジック（dashboard-html.ts 142-158行目）を関数化
 */
export function resolveToWindowsPath(relativePath, projectPath) {
    // 絶対パスに変換
    let absolutePath = path.join(projectPath, relativePath);
    // WSLパス(/mnt/c/...)をWindowsパス(C:/...)に変換
    if (absolutePath.startsWith("/mnt/")) {
        const match = absolutePath.match(/^\/mnt\/([a-z])\/(.*)/);
        if (match) {
            absolutePath = `${match[1].toUpperCase()}:/${match[2]}`;
        }
    }
    // ドライブレターを大文字に正規化
    absolutePath = absolutePath.replace(/^([a-z]):/, (_, letter) => `${letter.toUpperCase()}:`);
    return absolutePath;
}
/**
 * HTML内のプロジェクト相対パスをクリック可能なリンクに変換
 *
 * 処理手順:
 * 1. <pre>, <code>, <a> タグ内のテキストをプレースホルダーに置換（保護）
 * 2. 残りのテキスト部分で正規表現によるパス検出
 * 3. マッチしたパスを <a> タグに変換
 * 4. プレースホルダーを復元
 *
 * @param html - convertMarkdownToHtml() で変換済みのHTML文字列
 * @param projectPath - プロジェクトルートの絶対パス（WSLパスまたはWindowsパス）
 * @param pathPrefixes - 検出するパスプレフィクス（省略時はDEFAULT_PATH_PREFIXES）
 * @returns リンク化されたHTML文字列
 */
export function linkifyProjectPaths(html, projectPath, pathPrefixes = DEFAULT_PATH_PREFIXES) {
    // Step 1: 保護対象タグの内容をプレースホルダーに置換
    // <pre>...</pre>, <code ...>...</code>, <a ...>...</a> の中身を保護
    // 属性付きタグ（<code class="...">等）にも対応
    const placeholders = [];
    let result = html.replace(/<(pre|code|a)(\s[^>]*)?>[\s\S]*?<\/\1>/gi, (match) => {
        placeholders.push(match);
        return `\x00PLACEHOLDER_${placeholders.length - 1}\x00`;
    });
    // Step 2: パス検出と置換
    const pathRegex = new RegExp(`(?:${pathPrefixes.join("|")})(?:/[\\w\\-.\\u3000-\\u9FFF]+)+(?:\\.\\w+)?`, "g");
    result = result.replace(pathRegex, (match) => {
        const windowsPath = resolveToWindowsPath(match, projectPath);
        const fileViewUrl = `/file?path=${encodeURIComponent(windowsPath)}&project=${encodeURIComponent(projectPath)}`;
        // onclick: VSCode Webviewでは openFile() でpostMessage、ブラウザではデフォルトリンク動作
        // シングルクォートのエスケープ
        const escapedWindowsPath = windowsPath.replace(/'/g, "\\'");
        return `<a href="${fileViewUrl}" class="path-link" onclick="return openFile(this, '${escapedWindowsPath}')" title="${match}">${match}</a>`;
    });
    // Step 3: プレースホルダーを復元
    result = result.replace(/\x00PLACEHOLDER_(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);
    return result;
}
