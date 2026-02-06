// =============================================================================
// Markdown to HTML 変換
// =============================================================================

/**
 * シンプルなMarkdown→HTML変換関数
 * dashboard.mdのレンダリング用
 */
export function simpleMarkdownToHtml(markdown: string): string {
    // 改行コードを統一（Windows対応）
    let html = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // HTMLエスケープ（まず最初に）
    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // コードブロック（```...```）- 先に処理
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
    });

    // インラインコード（`...`）
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    // テーブル（より正確なパース）- 見出しより先に処理
    // Markdownテーブル形式:
    // | Header1 | Header2 |
    // |---------|---------|
    // | Data1   | Data2   |
    const tableRegex = /(?:^[ \t]*\|.+\|[ \t]*$\n?)+/gm;
    html = html.replace(tableRegex, (tableBlock) => {
        const rows = tableBlock.trim().split('\n').filter(row => row.trim());
        if (rows.length < 2) return tableBlock; // 最低2行必要（ヘッダー+セパレータ）

        let tableHtml = '<table class="md-table">';
        let isHeaderDone = false;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i].trim();
            // セル内容を抽出（先頭と末尾の | を除去）
            const cellContent = row.replace(/^\||\|$/g, '');
            const cells = cellContent.split('|').map(cell => cell.trim());

            // セパレータ行（|---|---|）をスキップ
            if (cells.every(cell => /^[-:]+$/.test(cell))) {
                isHeaderDone = true;
                continue;
            }

            // ヘッダー行（セパレータの前の行）
            if (!isHeaderDone) {
                tableHtml += '<thead><tr>';
                cells.forEach(cell => {
                    tableHtml += `<th>${cell}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';
            } else {
                // データ行
                tableHtml += '<tr>';
                cells.forEach(cell => {
                    tableHtml += `<td>${cell}</td>`;
                });
                tableHtml += '</tr>';
            }
        }

        tableHtml += '</tbody></table>';
        return tableHtml;
    });

    // 見出し（### ## #）
    html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

    // 水平線（---）
    html = html.replace(/^---$/gm, '<hr class="md-hr">');

    // チェックボックス
    html = html.replace(/^- \[x\] (.+)$/gm, '<div class="md-checkbox checked">☑ $1</div>');
    html = html.replace(/^- \[ \] (.+)$/gm, '<div class="md-checkbox">☐ $1</div>');

    // リスト（- item）
    html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
    // 連続するliをulで囲む
    html = html.replace(/(<li class="md-li">.*?<\/li>\n?)+/g, (match) => {
        return `<ul class="md-ul">${match}</ul>`;
    });

    // 太字（**...**）
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体（*...*）- 太字の後に処理
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // リンク [text](url) - 外部リンクは無効化
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">$1</span>');

    // 段落（空行で区切られたテキスト）
    html = html.replace(/\n\n+/g, '</p><p class="md-p">');
    html = `<p class="md-p">${html}</p>`;

    // 空のpタグを削除
    html = html.replace(/<p class="md-p"><\/p>/g, '');
    html = html.replace(/<p class="md-p">(\s*<(?:h[1-3]|ul|table|pre|hr|div))/g, '$1');
    html = html.replace(/(<\/(?:h[1-3]|ul|table|pre|hr|div)>\s*)<\/p>/g, '$1');

    return html;
}
