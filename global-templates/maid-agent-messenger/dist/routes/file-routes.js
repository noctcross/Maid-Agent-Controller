/**
 * ファイル表示エンドポイント
 * GET /file - ブラウザでマークダウンを表示
 */
import { Router } from "express";
import path from "path";
import * as fs from "fs/promises";
import { convertMarkdownToHtml, escapeHtml, linkifyProjectPaths } from "../markdown-utils.js";
import { extractAgentIdFromPath, generateAgentBackgroundSnippet } from "../utils/agent-image.js";
const router = Router();
router.get("/file", async (req, res) => {
    try {
        let filePath = req.query.path;
        // projectPathがあればパスリンク化を適用（ダッシュボードからの遷移時に自動付加）
        const projectPath = req.query.project;
        if (!filePath) {
            res.status(400).send("Missing path parameter");
            return;
        }
        // URLデコード
        filePath = decodeURIComponent(filePath);
        // 相対パスの場合はprojectPathと結合して絶対パスに変換
        if (projectPath && !path.isAbsolute(filePath)) {
            filePath = path.join(projectPath, filePath);
        }
        // WSL環境でのみWindowsパス（C:/...）をWSLパス（/mnt/c/...）に変換
        // Mac/Linuxでは変換不要
        const isWslEnvironment = process.platform === 'linux' && process.env.WSL_DISTRO_NAME;
        if (isWslEnvironment && /^[A-Z]:\//i.test(filePath)) {
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
        // エージェント背景イラスト
        const agentId = extractAgentIdFromPath(filePath);
        let agentBgCss = "";
        let agentBgHtml = "";
        if (agentId && projectPath) {
            const imageUrl = `/agent-image?agent=${encodeURIComponent(agentId)}&project=${encodeURIComponent(projectPath)}`;
            const snippet = generateAgentBackgroundSnippet(imageUrl);
            agentBgCss = snippet.css;
            agentBgHtml = snippet.bodyHtml;
        }
        const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
  <style>
    :root {
      --bg-start: #1a1a2e;
      --bg-end: #16213e;
      --text-color: #eee;
      --h1-color: #e94560;
      --h2-color: #ffc107;
      --h3-color: #81c784;
      --link-color: #4ec9b0;
      --code-bg: #0a0a0a;
      --border-color: #444;
      --accent-color: #e94560;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Hiragino Sans", -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, var(--bg-start) 0%, var(--bg-end) 100%);
      color: var(--text-color);
      line-height: 1.6;
      padding: 16px 40px;
      max-width: 900px;
      margin: 0 auto;
      min-height: 100vh;
      font-size: 13px;
    }
    .file-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      margin-bottom: 16px;
      border-bottom: 2px solid var(--accent-color);
    }
    .file-name { font-size: 1.2rem; color: var(--accent-color); }
    .file-path { font-size: 0.8rem; color: #808080; margin-top: 5px; }
    .back-link { color: var(--link-color); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .content { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 16px; }
    h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em; }
    h1 { font-size: 1.4em; color: var(--h1-color); border-bottom: 2px solid var(--h1-color); padding-bottom: 6px; }
    h2 { font-size: 1.15em; color: var(--h2-color); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
    h3 { font-size: 1.05em; color: var(--h3-color); }
    h4, h5, h6 { color: var(--h3-color); }
    a { color: var(--link-color); }
    code {
      background: rgba(255,255,255,0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: "Consolas", "Monaco", monospace;
      font-size: 0.9em;
    }
    pre {
      background: var(--code-bg);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid var(--border-color); padding: 6px 10px; text-align: left; }
    th { background: rgba(255,255,255,0.1); color: var(--h2-color); }
    ul { padding-left: 25px; }
    li { margin: 4px 0; }
    .checkbox { padding: 4px 0; }
    .checkbox.checked { color: var(--h3-color); }
    hr { border: none; border-top: 1px solid var(--border-color); margin: 16px 0; }
    p { margin: 8px 0; }
    strong { color: var(--h2-color); }
    em { font-style: italic; color: #aaa; }
    .path-link { color: var(--link-color); text-decoration: none; border-bottom: 1px dotted var(--link-color); cursor: pointer; }
    .path-link:hover { text-decoration: underline; background: rgba(86, 156, 214, 0.1); }
    ${agentBgCss}
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
  ${agentBgHtml}
  <script>
    // path-link のクリックハンドラ（addEventListenerパターン、CSP対応）
    // ファイルビューアではVSCode APIが使えないため、デフォルトリンク動作（href遷移）に委譲
    document.querySelectorAll('.path-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        // ブラウザ環境: デフォルトのhref遷移をそのまま使用（何もしない）
      });
    });
  </script>
</body>
</html>`;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    }
    catch (error) {
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
