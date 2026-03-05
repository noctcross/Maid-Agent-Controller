/**
 * マークダウン→HTML変換ユーティリティ
 *
 * central-server.ts から抽出。テスト可能にするため独立モジュール化。
 */
import path from "path";
/**
 * HTML特殊文字をエスケープ（XSS防止）
 *
 * 注意: この実装は src/utils/html-escape.ts の escapeHtml() と同一である必要があります。
 * 変更時は両方を更新してください。
 * @see src/utils/html-escape.ts (IDE版)
 */
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
    // 後方互換: 旧形式（\\n）で保存されたデータ用のフォールバック
    // YAML ダブルクォート文字列内の改行が \\n として保存されていたため、
    // 実際の改行文字に変換する。#219-3 で根本修正（リテラルブロック形式）済みだが、
    // 外部データや古いデータの読み込みに対応するため削除しない。
    // @see docs/plans/task-219-1-yaml-newline-fix.md
    let html = markdown.replace(/\\n/g, '\n');
    // 改行コードを統一（Windows CRLF対応）
    html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    html = escapeHtml(html);
    // コードブロック（```）
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });
    // インラインコード（`）
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // テーブル（| Header | ... | 形式）- 見出しより先に処理
    const tableRegex = /(?:^[ \t]*\|.+\|[ \t]*$\n?)+/gm;
    html = html.replace(tableRegex, (tableBlock) => {
        const rows = tableBlock.trim().split('\n').filter(row => row.trim());
        if (rows.length < 2)
            return tableBlock;
        let tableHtml = '<table>';
        let isHeaderDone = false;
        for (const row of rows) {
            const cellContent = row.trim().replace(/^\||\|$/g, '');
            const cells = cellContent.split('|').map(cell => cell.trim());
            // セパレータ行（|---|---|）をスキップ
            if (cells.every(cell => /^[-:]+$/.test(cell))) {
                isHeaderDone = true;
                continue;
            }
            if (!isHeaderDone) {
                tableHtml += '<thead><tr>';
                cells.forEach(cell => { tableHtml += `<th>${cell}</th>`; });
                tableHtml += '</tr></thead><tbody>';
            }
            else {
                tableHtml += '<tr>';
                cells.forEach(cell => { tableHtml += `<td>${cell}</td>`; });
                tableHtml += '</tr>';
            }
        }
        tableHtml += '</tbody></table>';
        return tableHtml;
    });
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
    // チェックボックス（- [x] / - [ ]）- 通常リストより先に処理
    html = html.replace(/^[-*]\s+\[x\]\s+(.+)$/gm, '<div class="checkbox checked">&#x2611; $1</div>');
    html = html.replace(/^[-*]\s+\[ \]\s+(.+)$/gm, '<div class="checkbox">&#x2610; $1</div>');
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
    html = html.replace(/<p>(<table>)/g, '$1');
    html = html.replace(/(<\/table>)<\/p>/g, '$1');
    html = html.replace(/<p>(<div class="checkbox)/g, '$1');
    html = html.replace(/(<\/div>)<\/p>/g, '$1');
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
 * パス終端判定に使用するファイル拡張子
 * これらの拡張子で終わる位置をパスの終端とみなす
 */
export const FILE_EXTENSIONS = [
    // ドキュメント
    "md", "txt", "html", "htm",
    // JavaScript/TypeScript
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    // 設定ファイル
    "json", "yaml", "yml", "toml", "ini", "conf",
    // スタイル
    "css", "scss", "sass", "less",
    // プログラミング言語
    "py", "rb", "php", "go", "rs", "java", "kt", "scala",
    "c", "cpp", "h", "hpp", "cs", "swift", "m",
    // フロントエンド
    "vue", "svelte", "astro",
    // シェル
    "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
    // その他
    "xml", "svg", "log",
];
/**
 * 後処理用: 最後の拡張子を検出
 * (?=...) で「拡張子の後に終端文字が続く」条件を追加
 */
const EXT_PATTERN = new RegExp(`\\.(${FILE_EXTENSIONS.join("|")})(?=[\\s)<>」』\\]\\n]|$)`, "gi");
/**
 * 相対パスを絶対パスに変換
 * WSLパスはWSLパスのまま、Windowsパスはそのまま返す
 * （WSL→Windows変換はしない: VSCode拡張がWSL上で動作するため、
 *   Windowsパスに変換するとisPathWithinRootでブロックされる）
 */
export function resolveToAbsolutePath(relativePath, projectPath) {
    return path.join(projectPath, relativePath);
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
    // <pre>...</pre>, <a ...>...</a> の中身を保護
    // インライン<code>は保護しない（報告書でパスをバッククォートで囲む慣習に対応）
    // <pre><code>...</code></pre> は <pre> の保護で内部の <code> も保護される
    const placeholders = [];
    let result = html.replace(/<(pre|a)(\s[^>]*)?>[\s\S]*?<\/\1>/gi, (match) => {
        placeholders.push(match);
        return `\x00PLACEHOLDER_${placeholders.length - 1}\x00`;
    });
    // Step 2: パス検出と置換
    // #249: 拡張子を必須に変更、終端文字も含める（後処理で切り取り）
    const pathRegex = new RegExp(`(?:${pathPrefixes.join("|")})` +
        `(?:/[\\w\\-.#()\\u3000-\\u9FFF\\uFF08\\uFF09]+)+` +
        `\\.(?:${FILE_EXTENSIONS.join("|")})` +
        `[)」』\\]\\s]*`, // 終端に続く可能性のある文字
    "gi");
    result = result.replace(pathRegex, (match) => {
        // 後処理: 最後の有効な拡張子位置を見つける
        let lastValidEnd = match.length;
        let m;
        EXT_PATTERN.lastIndex = 0;
        while ((m = EXT_PATTERN.exec(match)) !== null) {
            lastValidEnd = m.index + m[0].length;
        }
        // 最後の拡張子で切り取り
        const trimmedPath = match.substring(0, lastValidEnd);
        const remainder = match.substring(lastValidEnd);
        const absolutePath = resolveToAbsolutePath(trimmedPath, projectPath);
        const fileViewUrl = `/file?path=${encodeURIComponent(absolutePath)}&project=${encodeURIComponent(projectPath)}`;
        // data-path属性: addEventListenerで使用（CSP対応）
        const escapedPath = absolutePath.replace(/"/g, "&quot;");
        return `<a href="${fileViewUrl}" class="path-link" data-path="${escapedPath}" title="${trimmedPath}">${trimmedPath}</a>${remainder}`;
    });
    // Step 3: プレースホルダーを復元
    result = result.replace(/\x00PLACEHOLDER_(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);
    return result;
}
