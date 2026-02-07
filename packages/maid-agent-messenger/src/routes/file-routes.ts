/**
 * ファイル表示エンドポイント
 * GET /file - ブラウザでマークダウンを表示
 */

import { Router, Request, Response } from "express";
import path from "path";
import * as fs from "fs/promises";
import { convertMarkdownToHtml, escapeHtml, linkifyProjectPaths } from "../markdown-utils.js";

const router = Router();

router.get("/file", async (req: Request, res: Response) => {
  try {
    let filePath = req.query.path as string;
    // projectPathがあればパスリンク化を適用（ダッシュボードからの遷移時に自動付加）
    const projectPath = req.query.project as string | undefined;
    if (!filePath) {
      res.status(400).send("Missing path parameter");
      return;
    }

    // URLデコード
    filePath = decodeURIComponent(filePath);

    // Windowsパス（C:/...）をWSLパス（/mnt/c/...）に変換
    if (/^[A-Z]:\//i.test(filePath)) {
      const driveLetter = filePath[0].toLowerCase();
      filePath = `/mnt/${driveLetter}/${filePath.slice(3)}`;
    }

    // ファイル読み込み
    const content = await fs.readFile(filePath, "utf-8");
    const fileName = path.basename(filePath);
    const isMarkdown = /\.(md|markdown)$/i.test(fileName);

    // HTML生成
    const markdownHtml = convertMarkdownToHtml(content);
    const htmlContent = isMarkdown
      ? (projectPath ? linkifyProjectPaths(markdownHtml, projectPath) : markdownHtml)
      : `<pre>${escapeHtml(content)}</pre>`;

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
  <style>
    :root {
      --bg-color: #1e1e1e;
      --text-color: #d4d4d4;
      --heading-color: #569cd6;
      --link-color: #4ec9b0;
      --code-bg: #2d2d2d;
      --border-color: #3c3c3c;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg-color);
      color: var(--text-color);
      line-height: 1.6;
      padding: 20px 40px;
      max-width: 900px;
      margin: 0 auto;
    }
    .file-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 15px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
    }
    .file-name { font-size: 1.2rem; color: var(--heading-color); }
    .file-path { font-size: 0.8rem; color: #808080; margin-top: 5px; }
    .back-link { color: var(--link-color); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    h1, h2, h3, h4, h5, h6 { color: var(--heading-color); margin: 1.5em 0 0.5em; }
    h1 { font-size: 1.8rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h3 { font-size: 1.3rem; }
    a { color: var(--link-color); }
    code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: "Consolas", "Monaco", monospace;
      font-size: 0.9em;
    }
    pre {
      background: var(--code-bg);
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      border: 1px solid var(--border-color);
    }
    pre code { background: none; padding: 0; }
    ul { padding-left: 25px; }
    li { margin: 5px 0; }
    hr { border: none; border-top: 1px solid var(--border-color); margin: 20px 0; }
    p { margin: 1em 0; }
    strong { color: #dcdcaa; }
    .path-link { color: #4ec9b0; text-decoration: none; border-bottom: 1px dotted #4ec9b0; cursor: pointer; }
    .path-link:hover { text-decoration: underline; background: rgba(86, 156, 214, 0.1); }
  </style>
</head>
<body>
  <div class="file-header">
    <div>
      <div class="file-name">📄 ${escapeHtml(fileName)}</div>
      <div class="file-path">${escapeHtml(filePath)}</div>
    </div>
    <a href="javascript:history.back()" class="back-link">← 戻る</a>
  </div>
  <div class="content">
    ${htmlContent}
  </div>
  <script>
    // linkifyProjectPaths() が生成するonclickハンドラ用フォールバック
    // ファイルビューアではVSCode APIが使えないため、デフォルトリンク動作に委譲
    // falseを返すとリンク遷移がブロックされるので、何も返さない（undefined → デフォルト動作）
    if (typeof openFile === "undefined") { window.openFile = function() {}; }
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>File Not Found</title>
      <style>body{font-family:sans-serif;background:#1e1e1e;color:#ccc;padding:40px;text-align:center;}
      .error{color:#f14c4c;font-size:1.5rem;}</style></head>
      <body><div class="error">⚠️ ファイルが見つかりません</div><p>${escapeHtml(message)}</p>
      <a href="javascript:history.back()" style="color:#4ec9b0;">← 戻る</a></body></html>
    `);
  }
});

export default router;
