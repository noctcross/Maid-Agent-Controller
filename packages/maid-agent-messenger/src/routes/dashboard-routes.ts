/**
 * ダッシュボードエンドポイント
 * GET /dashboard, /dashboard/goals, /report
 * PATCH /dashboard/tasks/:id/archive, /dashboard/tasks/:id/close
 */

import { Router, Request, Response } from "express";
import { loadConfig, getServerUrl } from "../utils/config-loader.js";
import {
  executeUpdateTask,
  generateDashboardData,
} from "../services/index.js";
import { generateDashboardSpaHtml } from "../views/dashboard-spa.js";
import { getProjectPathFromRequest } from "../middleware/project-path.js";
import { recordProjectAccess } from "../services/project-registry.js";
import type { DashboardWebSocketServer } from "../websocket/dashboard-ws.js";
import { logger } from "../utils/logger.js";

// 依存関数の型定義（SPA版では最小限）
export interface DashboardRoutesDeps {
  wsServer?: DashboardWebSocketServer; // WebSocket サーバー（オプション）
}

export function createDashboardRoutes(deps: DashboardRoutesDeps): Router {
  const { wsServer } = deps;
  const router = Router();

  // GET /dashboard - SPA版ダッシュボード
  router.get("/dashboard", async (req: Request, res: Response) => {
    try {
      // project未指定時 → トップページにリダイレクト
      if (!req.query.project && !req.headers["x-maid-project-path"]) {
        res.redirect("/");
        return;
      }

      const projectPath = req.query.project
        ? (req.query.project as string)
        : getProjectPathFromRequest(req);

      const config = await loadConfig();
      const serverUrl = getServerUrl(config);

      // SPA版HTMLシェルを生成
      const html = generateDashboardSpaHtml(projectPath, serverUrl);

      // アクセス記録（非同期、レスポンスをブロックしない）
      recordProjectAccess(projectPath).catch((err) =>
        logger.error("Failed to record project access", err instanceof Error ? err : { error: err })
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).send(`<html><body><h1>Error</h1><p>${message}</p></body></html>`);
    }
  });

  // GET /dashboard/goals - Tasks ページネーション用エンドポイント
  router.get("/dashboard/goals", async (req: Request, res: Response) => {
    try {
      const projectPath = req.query.project
        ? decodeURIComponent(req.query.project as string)
        : getProjectPathFromRequest(req);

      // ページネーションパラメータ
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 10;

      // フィルタパラメータ
      const statusParam = req.query.status as string;
      const statusFilter: "open" | "closed" | "all" =
        statusParam === "closed" ? "closed" :
        statusParam === "all" ? "all" : "open";

      const showArchived = req.query.archived === "true";

      // ソートパラメータ
      const sortFieldParam = req.query.sort as string;
      const sortField: "id" | "updatedAt" = sortFieldParam === "updatedAt" ? "updatedAt" : "id";
      const sortOrderParam = req.query.order as string;
      const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";

      // 検索・絞り込みパラメータ
      const search = req.query.search as string | undefined;
      const priorityParam = req.query.priority as string | undefined;
      const priority: "high" | "medium" | "low" | undefined =
        priorityParam === "high" || priorityParam === "medium" || priorityParam === "low"
          ? priorityParam
          : undefined;
      const assignee = req.query.assignee as string | undefined;

      // V2.1 ダッシュボードデータを取得（ページネーション・ソート・フィルタ適用）
      const v2Data = await generateDashboardData(projectPath, {
        offset,
        limit,
        statusFilter,
        showArchived,
        sortField,
        sortOrder,
        search,
        priority,
        assignee,
      });

      res.json({
        goals: v2Data.v2Goals,
        total: v2Data.totalGoals,
        offset,
        limit,
        hasMore: offset + v2Data.v2Goals.length < v2Data.totalGoals,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /dashboard/tasks/:id/archive - アーカイブトグル（LAN公開）
  router.patch("/dashboard/tasks/:id/archive", async (req: Request, res: Response) => {
    try {
      const projectPath = getProjectPathFromRequest(req);
      const txId = req.get("X-Transaction-Id");
      const { archived } = req.body;

      const result = await executeUpdateTask(projectPath, {
        taskId: req.params.id,
        archived: archived !== undefined ? archived : true,
      });

      if (!result.success) {
        res.status(404).json({ error: "Task not found", taskId: req.params.id });
        return;
      }

      // WebSocket通知: タスク更新をリアルタイム配信
      if (wsServer) {
        wsServer.broadcast(projectPath, {
          type: "taskUpdated",
          taskId: req.params.id,
          field: "archived",
          value: result.task?.archived,
          txId,
        });
      }

      res.json({ success: true, archived: result.task?.archived, archivedAt: result.task?.archivedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Archive toggle failed", details: message });
    }
  });

  // PATCH /dashboard/tasks/:id/close - Task完了（LAN公開）
  router.patch("/dashboard/tasks/:id/close", async (req: Request, res: Response) => {
    try {
      const projectPath = getProjectPathFromRequest(req);
      const txId = req.get("X-Transaction-Id");

      const result = await executeUpdateTask(projectPath, {
        taskId: req.params.id,
        mainStatus: "closed",
        subStatus: "completed",
      });

      if (!result.success) {
        res.status(404).json({ error: "Task not found", taskId: req.params.id });
        return;
      }

      // WebSocket通知: タスク更新をリアルタイム配信
      if (wsServer) {
        wsServer.broadcast(projectPath, {
          type: "taskUpdated",
          taskId: req.params.id,
          field: "status",
          value: "completed",
          txId,
        });
      }

      res.json({ success: true, mainStatus: result.task?.mainStatus, subStatus: result.task?.subStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Close task failed", details: message });
    }
  });

  // GET /report - 報告書表示（SPA: 静的HTMLシェル + クライアントJSでAPI呼び出し）
  router.get("/report", async (req: Request, res: Response) => {
    const taskId = req.query.task as string;
    if (!taskId) {
      res.status(400).send(`<!DOCTYPE html>
<html><head><title>Error</title>
<style>body{font-family:sans-serif;background:#1e1e1e;color:#ccc;padding:40px;text-align:center;}
.error{color:#f14c4c;font-size:1.5rem;}</style></head>
<body><div class="error">⚠️ パラメータエラー</div><p>task パラメータが必要です</p>
<a href="javascript:history.back()" style="color:#4ec9b0;">← 戻る</a></body></html>`);
      return;
    }

    const projectPath = req.query.project
      ? decodeURIComponent(req.query.project as string)
      : getProjectPathFromRequest(req);

    // 静的HTMLシェルを返す（実際のレポート取得はクライアントJSがAPIを呼び出す）
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>報告書 - 読み込み中...</title>
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
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 10px;
      margin-bottom: 16px;
      border-bottom: 2px solid var(--accent-color);
    }
    .page-title { font-size: 1.2rem; color: var(--accent-color); }
    .back-link { color: var(--link-color); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .report-content { background: rgba(0,0,0,0.3); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .report-path { font-size: 0.9em; color: #808080; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); }
    .report-body { line-height: 1.6; }
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
    .report-error { background: rgba(255,0,0,0.1); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .error { color: #ff6b6b; }
    .loading { text-align: center; padding: 40px; color: #888; }
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
  <div class="page-header">
    <div class="page-title" id="page-title">📄 報告書 - 読み込み中...</div>
    <a href="/dashboard?project=${encodeURIComponent(projectPath)}" class="back-link">← ダッシュボードに戻る</a>
  </div>
  <div id="content">
    <div class="loading">📂 報告書を読み込み中...</div>
  </div>
  <div class="agent-background" id="agent-bg"></div>

  <script>
    (function() {
      var taskId = ${JSON.stringify(taskId)};
      var projectPath = ${JSON.stringify(projectPath)};

      // APIからレポート内容を取得
      var apiUrl = '/api/tasks/' + encodeURIComponent(taskId) + '/report?project=' + encodeURIComponent(projectPath);

      fetch(apiUrl)
        .then(function(response) {
          if (!response.ok) {
            return response.json().then(function(data) {
              throw new Error(data.error || '報告書の取得に失敗しました');
            });
          }
          return response.json();
        })
        .then(function(data) {
          // タイトル更新
          document.title = '報告書 - ' + taskId;
          document.getElementById('page-title').textContent = '📄 報告書 - ' + taskId;

          var contentEl = document.getElementById('content');

          if (!data.reports || data.reports.length === 0) {
            contentEl.innerHTML = '<div class="report-error"><p class="error">このタスクには報告書が登録されていません</p></div>';
            return;
          }

          // 報告書を表示
          var html = data.reports.map(function(report) {
            if (report.error) {
              return '<div class="report-error"><h3>' + escapeHtml(report.path) + '</h3><p class="error">' + escapeHtml(report.error) + '</p></div>';
            }
            if (!report.htmlContent && !report.content) {
              return '<div class="report-error"><h3>' + escapeHtml(report.path) + '</h3><p class="error">内容を取得できませんでした</p></div>';
            }
            // htmlContent（Markdown変換済み）があればそれを使用
            var body = report.htmlContent || '<pre>' + escapeHtml(report.content) + '</pre>';
            return '<div class="report-content">' +
              '<h3 class="report-path">' + escapeHtml(report.path) + '</h3>' +
              '<div class="report-body">' + body + '</div>' +
              '</div>';
          }).join('');

          contentEl.innerHTML = html;

          // エージェント背景イラスト
          if (data.agentId && projectPath) {
            var bgEl = document.getElementById('agent-bg');
            var imageUrl = '/agent-image?agent=' + encodeURIComponent(data.agentId) + '&project=' + encodeURIComponent(projectPath);
            bgEl.style.backgroundImage = 'url(' + imageUrl + ')';
          }
        })
        .catch(function(error) {
          document.getElementById('page-title').textContent = '⚠️ エラー';
          document.getElementById('content').innerHTML = '<div class="report-error"><p class="error">' + (error.message || '報告書の読み込みに失敗しました') + '</p></div>';
        });

      // HTML エスケープ関数
      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }
    })();
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  return router;
}
