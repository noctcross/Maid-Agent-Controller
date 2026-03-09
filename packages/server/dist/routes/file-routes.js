/**
 * ファイル表示エンドポイント
 * GET /file - SPA: 静的HTMLシェル + クライアントJSでAPI呼び出し
 */
import { Router } from "express";
const router = Router();
/**
 * ファイル表示用の静的HTMLシェルを生成
 * クライアントJSが /api/files/content を呼び出してコンテンツを取得・表示
 */
function generateFileViewerHtml(filePath, projectPath) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ファイル - 読み込み中...</title>
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
    .loading { text-align: center; padding: 40px; color: #888; }
    .error { color: #f14c4c; text-align: center; padding: 40px; }
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
    /* エージェント背景イラスト */
    .agent-background {
      position: fixed;
      bottom: 0;
      right: 0;
      width: 300px;
      height: 400px;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: bottom right;
      opacity: 0.15;
      pointer-events: none;
      z-index: -1;
    }
  </style>
</head>
<body>
  <div class="file-header">
    <div>
      <div class="file-name" id="file-name">📄 読み込み中...</div>
      <div class="file-path" id="file-path"></div>
    </div>
    <a href="javascript:history.back()" class="back-link">← 戻る</a>
  </div>
  <div class="content" id="content">
    <div class="loading">📂 ファイルを読み込み中...</div>
  </div>
  <div class="agent-background" id="agent-bg"></div>

  <script>
    (function() {
      var filePath = ${JSON.stringify(filePath)};
      var projectPath = ${JSON.stringify(projectPath)};

      // APIからファイル内容を取得
      var apiUrl = '/api/files/content?path=' + encodeURIComponent(filePath) + '&project=' + encodeURIComponent(projectPath);

      fetch(apiUrl)
        .then(function(response) {
          if (!response.ok) {
            return response.json().then(function(data) {
              throw new Error(data.error || 'ファイルの取得に失敗しました');
            });
          }
          return response.json();
        })
        .then(function(data) {
          // タイトル更新
          document.title = data.name + ' - ファイルビューア';
          document.getElementById('file-name').textContent = '📄 ' + data.name;
          document.getElementById('file-path').textContent = data.absolutePath || data.path;

          // コンテンツ表示
          var contentEl = document.getElementById('content');
          if (data.isMarkdown && data.htmlContent) {
            contentEl.innerHTML = data.htmlContent;
          } else {
            // 非Markdownファイルはプレーンテキスト表示
            var pre = document.createElement('pre');
            pre.textContent = data.content;
            contentEl.innerHTML = '';
            contentEl.appendChild(pre);
          }

          // エージェント背景イラスト
          if (data.agentId && projectPath) {
            var bgEl = document.getElementById('agent-bg');
            var imageUrl = '/agent-image?agent=' + encodeURIComponent(data.agentId) + '&project=' + encodeURIComponent(projectPath);
            bgEl.style.backgroundImage = 'url(' + imageUrl + ')';
          }
        })
        .catch(function(error) {
          document.getElementById('file-name').textContent = '⚠️ エラー';
          document.getElementById('content').innerHTML = '<div class="error">' + (error.message || 'ファイルの読み込みに失敗しました') + '</div>';
        });
    })();
  </script>
</body>
</html>`;
}
router.get("/file", async (req, res) => {
    const filePath = req.query.path;
    const projectPath = req.query.project;
    if (!filePath) {
        res.status(400).send(`<!DOCTYPE html>
<html><head><title>Error</title>
<style>body{font-family:sans-serif;background:#1e1e1e;color:#ccc;padding:40px;text-align:center;}
.error{color:#f14c4c;font-size:1.5rem;}</style></head>
<body><div class="error">⚠️ パラメータエラー</div><p>path パラメータが必要です</p>
<a href="javascript:history.back()" style="color:#4ec9b0;">← 戻る</a></body></html>`);
        return;
    }
    if (!projectPath) {
        res.status(400).send(`<!DOCTYPE html>
<html><head><title>Error</title>
<style>body{font-family:sans-serif;background:#1e1e1e;color:#ccc;padding:40px;text-align:center;}
.error{color:#f14c4c;font-size:1.5rem;}</style></head>
<body><div class="error">⚠️ パラメータエラー</div><p>project パラメータが必要です</p>
<a href="javascript:history.back()" style="color:#4ec9b0;">← 戻る</a></body></html>`);
        return;
    }
    // 静的HTMLシェルを返す（実際のファイル読み込みはクライアントJSがAPIを呼び出す）
    const html = generateFileViewerHtml(decodeURIComponent(filePath), decodeURIComponent(projectPath));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
});
export default router;
