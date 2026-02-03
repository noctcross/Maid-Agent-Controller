/**
 * Central MCP Server (Streamable HTTP Transport)
 *
 * 中央集約サーバー（ユーザーフォルダ版）
 * - MCP Streamable HTTP プロトコル対応（Claude Code から直接接続可能）
 * - 複数のClaude Codeセッションから共有で使用
 * - プロジェクトパスはヘッダー（X-Maid-Project-Path）で指定
 * - pm2で常時稼働させる
 *
 * メモリ効率: 700MB → 90MB（87%削減）
 */
import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import path from "path";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
import { getTimestamp } from "./utils/yaml-helper.js";
import { MAID_IDS, UPDATABLE_STATUSES, } from "./types/index.js";
// サービス層からビジネスロジックをインポート
import { executeGetMyTask, executeUpdateStatus, executeAssignTask, executeGetTeamStatus, 
// タスク管理サービス（Phase 1 + Phase 3）
executeCreateTask, executeGetTask, executeListTasks, executeUpdateTask, } from "./services/index.js";
const app = express();
app.use(express.json());
// リクエストログ
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// セッションID -> SessionInfo のマップ
const sessions = new Map();
// ========================================
// パスヘルパー関数
// ========================================
function getQueueMaidPath(projectPath) {
    return path.join(projectPath, ".maid-agent", "queue", "maid");
}
function getReportsPath(projectPath) {
    return path.join(projectPath, ".maid-agent", "reports");
}
function generateDashboardHtml(data) {
    const { projectPath, timestamp, pending, working, recentCompleted, teamStatus } = data;
    // ステータスアイコンマップ
    const statusIcon = {
        working: "🔧",
        completed: "✅",
        assigned: "📋",
        blocked: "🚫",
        idle: "💤",
        unknown: "❓",
        error: "⚠️",
    };
    // 優先度カラーマップ
    const priorityClass = {
        high: "priority-high",
        medium: "priority-medium",
        low: "priority-low",
    };
    // チームステータスHTML生成
    const teamStatusHtml = teamStatus
        .map((agent) => {
        const icon = statusIcon[agent.status] || "❓";
        const taskInfo = agent.task_id ? `[${agent.task_id}]` : "";
        return `<div class="agent-status agent-${agent.status}">
        <span class="agent-icon">${icon}</span>
        <span class="agent-name">${agent.id}</span>
        <span class="agent-task">${taskInfo}</span>
      </div>`;
    })
        .join("\n");
    // 待機中タスクHTML生成
    const pendingHtml = pending.length > 0
        ? pending.map((task) => `<div class="task-item ${priorityClass[task.priority] || ""}">
        <span class="task-id">${task.id}</span>
        <span class="task-desc">${escapeHtml(task.description.substring(0, 60))}${task.description.length > 60 ? "..." : ""}</span>
        <span class="task-priority">[${task.priority}]</span>
      </div>`).join("\n")
        : '<div class="empty-message">なし</div>';
    // 進行中タスクHTML生成
    const workingHtml = working.length > 0
        ? working.map((task) => {
            const assigneeStr = task.assignees.map((a) => a.agentId).join(", ");
            return `<div class="task-item">
          <span class="task-id">${task.id}</span>
          <span class="task-desc">${escapeHtml(task.description.substring(0, 50))}${task.description.length > 50 ? "..." : ""}</span>
          <span class="task-assignee">${assigneeStr ? `👤 ${assigneeStr}` : ""}</span>
          <span class="task-status">[${task.status}]</span>
        </div>`;
        }).join("\n")
        : '<div class="empty-message">なし</div>';
    // 完了タスクHTML生成
    const completedHtml = recentCompleted.length > 0
        ? recentCompleted.map((task) => {
            const completedDate = task.completedAt
                ? new Date(task.completedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                : "";
            return `<div class="task-item completed">
          <span class="task-id">${task.id}</span>
          <span class="task-desc">${escapeHtml(task.description.substring(0, 50))}${task.description.length > 50 ? "..." : ""}</span>
          <span class="task-date">${completedDate}</span>
        </div>`;
        }).join("\n")
        : '<div class="empty-message">なし</div>';
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>Maid Agent Dashboard</title>
  <style>
    :root {
      --bg-color: #1e1e1e;
      --card-bg: #252526;
      --border-color: #3c3c3c;
      --text-color: #cccccc;
      --text-muted: #808080;
      --accent-color: #569cd6;
      --success-color: #4ec9b0;
      --warning-color: #dcdcaa;
      --error-color: #f14c4c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg-color);
      color: var(--text-color);
      padding: 20px;
      min-height: 100vh;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-color);
    }
    .header h1 { font-size: 1.5rem; }
    .header .timestamp { color: var(--text-muted); font-size: 0.85rem; }
    .project-path { color: var(--text-muted); font-size: 0.75rem; margin-top: 5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 15px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    .card-title { font-size: 1.1rem; font-weight: 600; }
    .card-count { background: var(--accent-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
    .task-item {
      padding: 8px 10px;
      margin: 5px 0;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      display: flex;
      gap: 10px;
      align-items: center;
      font-size: 0.9rem;
    }
    .task-id { color: var(--accent-color); font-weight: 500; min-width: 60px; }
    .task-desc { flex: 1; }
    .task-priority { color: var(--text-muted); font-size: 0.8rem; }
    .task-assignee { color: var(--success-color); font-size: 0.8rem; }
    .task-status { color: var(--warning-color); font-size: 0.8rem; }
    .task-date { color: var(--text-muted); font-size: 0.8rem; }
    .priority-high { border-left: 3px solid var(--error-color); }
    .priority-medium { border-left: 3px solid var(--warning-color); }
    .priority-low { border-left: 3px solid var(--text-muted); }
    .completed { opacity: 0.7; }
    .empty-message { color: var(--text-muted); font-style: italic; padding: 10px; }
    .team-section { grid-column: 1 / -1; }
    .team-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .agent-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .agent-icon { font-size: 1.1rem; }
    .agent-name { font-weight: 500; }
    .agent-task { color: var(--text-muted); font-size: 0.8rem; }
    .agent-working { background: rgba(78, 201, 176, 0.1); border: 1px solid var(--success-color); }
    .agent-completed { background: rgba(86, 156, 214, 0.1); border: 1px solid var(--accent-color); }
    .agent-blocked { background: rgba(241, 76, 76, 0.1); border: 1px solid var(--error-color); }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>🎩 Maid Agent Dashboard</h1>
      <div class="project-path">${escapeHtml(projectPath)}</div>
    </div>
    <div class="timestamp">更新: ${timestamp}</div>
  </div>

  <div class="grid">
    <div class="card team-section">
      <div class="card-header">
        <span class="card-title">👥 チーム状態</span>
      </div>
      <div class="team-grid">
        ${teamStatusHtml}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">⏳ 待機中</span>
        <span class="card-count">${pending.length}</span>
      </div>
      ${pendingHtml}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">⚡ 進行中</span>
        <span class="card-count">${working.length}</span>
      </div>
      ${workingHtml}
    </div>

    <div class="card" style="grid-column: 1 / -1;">
      <div class="card-header">
        <span class="card-title">✅ 直近完了</span>
        <span class="card-count">${recentCompleted.length}</span>
      </div>
      ${completedHtml}
    </div>
  </div>

  <script>
    // 30秒ごとに自動リロード（meta refreshのバックアップ）
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>`;
}
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
// ========================================
// MCP Server ファクトリ関数
// 各セッションごとに新しい McpServer を作成
// projectPath を受け取って動的にパスを解決
// ========================================
function createMcpServer(projectPath) {
    const server = new McpServer({
        name: "maid-agent-messenger",
        version: "4.1.0",
    });
    const queueMaidPath = getQueueMaidPath(projectPath);
    const reportsPath = getReportsPath(projectPath);
    // get_my_task ツール
    server.tool("get_my_task", "自分に割り当てられたタスク情報を取得します", {
        agent_id: z.enum(MAID_IDS).describe("エージェントID（例: emma, flora）"),
    }, async ({ agent_id }) => {
        try {
            const result = await executeGetMyTask({
                queueMaidPath,
                agentId: agent_id,
            });
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ ...result, project_path: projectPath }, null, 2),
                    }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク取得に失敗しました",
                            details: message,
                            project_path: projectPath,
                        }),
                    }],
                isError: true,
            };
        }
    });
    // update_status ツール
    server.tool("update_status", "自分のタスクステータスを更新します", {
        agent_id: z.enum(MAID_IDS).describe("エージェントID（例: emma, flora）"),
        status: z.enum(UPDATABLE_STATUSES).describe("新しいステータス（working, completed, blocked）"),
        summary: z.string().max(100).optional().describe("作業サマリ（100文字以内、オプション）"),
    }, async ({ agent_id, status, summary }) => {
        try {
            const result = await executeUpdateStatus({
                queueMaidPath,
                reportsPath,
                agentId: agent_id,
                status,
                summary,
            });
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: "ステータス更新に失敗しました",
                            details: message,
                        }),
                    }],
                isError: true,
            };
        }
    });
    // assign_task ツール
    server.tool("assign_task", "メイドにタスクを割り当てます（メイド長専用）", {
        task_id: z.string().describe("タスクID（例: task-025-001）"),
        target_agent: z.enum(MAID_IDS).describe("割り当て先エージェント（例: emma, flora）"),
        description: z.string().max(500).describe("タスク説明（500文字以内）"),
        target_path: z.string().optional().describe("作業対象パス（オプション）"),
    }, async ({ task_id, target_agent, description, target_path }) => {
        try {
            const result = await executeAssignTask({
                queueMaidPath,
                reportsPath,
                taskId: task_id,
                targetAgent: target_agent,
                description,
                targetPath: target_path,
            });
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
                isError: !result.success,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: false,
                            error: `タスク割り当てに失敗しました: ${message}`,
                        }),
                    }],
                isError: true,
            };
        }
    });
    // get_team_status ツール（Phase 3: フィルタ対応）
    server.tool("get_team_status", "全メイドのステータス一覧を取得します（メイド長・執事用）。フィルタ・完了タスク取得対応。", {
        status: z.array(z.string()).optional().describe("ステータスでフィルタ（例: [\"working\", \"blocked\"]）"),
        agentId: z.enum(MAID_IDS).optional().describe("特定のエージェントのみ取得"),
        includeCompleted: z.number().optional().describe("直近N件の完了タスクを含める（tasks.yamlから取得）"),
    }, async ({ status, agentId, includeCompleted }) => {
        try {
            const result = await executeGetTeamStatus({
                queueMaidPath,
                filter: {
                    status,
                    agentId,
                    includeCompleted,
                },
            });
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ ...result, project_path: projectPath }, null, 2),
                    }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "チームステータス取得に失敗しました",
                            details: message,
                        }),
                    }],
                isError: true,
            };
        }
    });
    // ========================================
    // タスク管理ツール（Phase 1）
    // ========================================
    // TaskStatusのZodスキーマ
    const TaskStatusSchema = z.enum([
        "pending",
        "assigned",
        "working",
        "completed",
        "blocked",
        "cancelled",
    ]);
    // create_task ツール
    server.tool("create_task", "新規タスクまたはサブタスクを作成します", {
        description: z.string().describe("タスクの説明"),
        priority: z.enum(["high", "medium", "low"]).optional().describe("優先度（デフォルト: medium）"),
        parentId: z.string().optional().describe("親タスクID（サブタスク作成時に指定）"),
        assignees: z.array(z.enum(MAID_IDS)).optional().describe("担当者リスト"),
        category: z.enum(["task", "action_required", "skill_candidate", "improvement"]).optional().describe("カテゴリ（デフォルト: task）"),
    }, async ({ description, priority, parentId, assignees, category }) => {
        try {
            const result = await executeCreateTask(projectPath, {
                description,
                priority,
                parentId,
                assignees,
                category,
            });
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク作成に失敗しました",
                            details: message,
                        }),
                    }],
                isError: true,
            };
        }
    });
    // get_task ツール
    server.tool("get_task", "タスクの詳細情報を取得します", {
        taskId: z.string().describe("タスクID（例: 076, 076-1）"),
        includeSubtasks: z.boolean().optional().describe("サブタスクも含めるか（デフォルト: false）"),
    }, async ({ taskId, includeSubtasks }) => {
        try {
            const result = await executeGetTask(projectPath, {
                taskId,
                includeSubtasks,
            });
            if (!result.task) {
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                error: "タスクが見つかりません",
                                taskId,
                            }),
                        }],
                    isError: true,
                };
            }
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク取得に失敗しました",
                            details: message,
                        }),
                    }],
                isError: true,
            };
        }
    });
    // list_tasks ツール
    server.tool("list_tasks", "タスク一覧を取得します（フィルタ・ソート対応）", {
        status: z.array(TaskStatusSchema).optional().describe("ステータスでフィルタ"),
        assignee: z.enum(MAID_IDS).optional().describe("担当者でフィルタ"),
        parentId: z.string().nullable().optional().describe("親タスクIDでフィルタ（nullでトップレベルのみ）"),
        category: z.array(z.enum(["task", "action_required", "skill_candidate", "improvement"])).optional().describe("カテゴリでフィルタ"),
        limit: z.number().optional().describe("取得件数上限（デフォルト: 50）"),
        offset: z.number().optional().describe("スキップ件数（ページネーション用）"),
        sortField: z.enum(["createdAt", "priority", "status"]).optional().describe("ソートフィールド"),
        sortOrder: z.enum(["asc", "desc"]).optional().describe("ソート順序（デフォルト: desc）"),
    }, async ({ status, assignee, parentId, category, limit, offset, sortField, sortOrder }) => {
        try {
            const result = await executeListTasks(projectPath, {
                status: status,
                assignee,
                parentId,
                category: category,
                limit,
                offset,
                sortField,
                sortOrder,
            });
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク一覧取得に失敗しました",
                            details: message,
                        }),
                    }],
                isError: true,
            };
        }
    });
    // update_task ツール（Phase 3）
    server.tool("update_task", "タスクを更新します", {
        taskId: z.string().describe("タスクID（例: 076, 076-1）"),
        status: TaskStatusSchema.optional().describe("新しいステータス"),
        substatus: z.string().optional().describe("サブステータス（blocked時の詳細など）"),
        category: z.enum(["task", "action_required", "skill_candidate", "improvement"]).optional().describe("カテゴリ"),
        summary: z.string().optional().describe("完了サマリー"),
        reportPath: z.string().optional().describe("報告ファイルパス（追加）"),
    }, async ({ taskId, status, substatus, category, summary, reportPath }) => {
        try {
            const result = await executeUpdateTask(projectPath, {
                taskId,
                status,
                substatus,
                category,
                summary,
                reportPath,
            });
            if (!result.success) {
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                error: "タスクが見つかりません",
                                taskId,
                            }),
                        }],
                    isError: true,
                };
            }
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク更新に失敗しました",
                            details: message,
                        }),
                    }],
                isError: true,
            };
        }
    });
    return server;
}
// ========================================
// HTTP エンドポイント
// ========================================
// ヘルスチェック
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        timestamp: getTimestamp(),
        version: "4.1.0",
        mode: "streamable-http-multiproject",
        activeConnections: sessions.size,
    });
});
// MCP Streamable HTTP エンドポイント - POST /mcp
app.post("/mcp", async (req, res) => {
    // プロジェクトパスをヘッダーから取得
    const projectPath = req.headers["x-maid-project-path"];
    if (!projectPath) {
        console.error("MCP request rejected: X-Maid-Project-Path header is required");
        res.status(400).json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "X-Maid-Project-Path header is required",
            },
            id: null,
        });
        return;
    }
    // セッションIDをヘッダーから取得
    const sessionId = req.headers["mcp-session-id"];
    // 既存セッションがある場合はそれを使用
    if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        console.log(`Reusing session: ${sessionId}`);
        try {
            await session.transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            console.error("Request handling error:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
        return;
    }
    // セッションIDなしのリクエスト: 自動的に新しいセッションを作成
    const body = req.body;
    const isInitializeRequest = body && body.method === "initialize";
    if (!isInitializeRequest) {
        // 自動セッション作成モード: initializeなしでもセッションを作成して処理
        console.log(`Auto-creating session for method=${body?.method} (no session ID)`);
    }
    // 新規セッションを作成
    console.log(`New MCP connection request for project: ${projectPath}`);
    try {
        const newSessionId = randomUUID();
        // StreamableHTTPServerTransport を作成
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
            onsessioninitialized: (sid) => {
                console.log(`Session initialized: ${sid} (project: ${projectPath})`);
            },
        });
        // McpServer インスタンスを作成
        const server = createMcpServer(projectPath);
        // セッション情報を保存
        sessions.set(newSessionId, { transport, server, projectPath });
        // サーバーに接続
        await server.connect(transport);
        // リクエストを処理
        await transport.handleRequest(req, res, req.body);
        // セッション終了時のクリーンアップ（transportのcloseイベント）
        transport.onclose = () => {
            console.log(`Session closed: ${newSessionId}`);
            sessions.delete(newSessionId);
        };
    }
    catch (error) {
        console.error("MCP connection error:", error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Connection failed" },
                id: null,
            });
        }
    }
});
// MCP Streamable HTTP エンドポイント - GET /mcp (SSEストリーム、オプション)
app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
        res.status(400).json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Invalid or missing session ID",
            },
            id: null,
        });
        return;
    }
    const session = sessions.get(sessionId);
    console.log(`SSE stream requested for session: ${sessionId}`);
    try {
        await session.transport.handleRequest(req, res);
    }
    catch (error) {
        console.error("SSE stream error:", error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Stream failed" },
                id: null,
            });
        }
    }
});
// MCP Streamable HTTP エンドポイント - DELETE /mcp (セッション終了)
app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId) {
        res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Session ID required" },
            id: null,
        });
        return;
    }
    const session = sessions.get(sessionId);
    if (session) {
        console.log(`Session terminated: ${sessionId}`);
        await session.transport.close();
        sessions.delete(sessionId);
    }
    res.status(204).end();
});
// ========================================
// レガシー REST API エンドポイント（後方互換性）
// ヘッダーからプロジェクトパスを取得
// ========================================
// プロジェクトパスを取得するヘルパー
function getProjectPathFromRequest(req) {
    const projectPath = req.headers["x-maid-project-path"];
    if (!projectPath) {
        throw new Error("X-Maid-Project-Path header is required");
    }
    return projectPath;
}
// Zodスキーマ
const GetMyTaskSchema = z.object({
    agent_id: z.enum(MAID_IDS),
});
const UpdateStatusSchema = z.object({
    agent_id: z.enum(MAID_IDS),
    status: z.enum(UPDATABLE_STATUSES),
    summary: z.string().max(100).optional(),
});
const AssignTaskSchema = z.object({
    task_id: z.string(),
    target_agent: z.enum(MAID_IDS),
    description: z.string().max(500),
    target_path: z.string().optional(),
});
// get_my_task (REST)
app.post("/tools/get_my_task", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { agent_id } = GetMyTaskSchema.parse(req.body);
        const result = await executeGetMyTask({
            queueMaidPath: getQueueMaidPath(projectPath),
            agentId: agent_id,
        });
        res.json({ ...result, project_path: projectPath });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid input", details: error.errors });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task retrieval failed", details: message });
    }
});
// update_status (REST)
app.post("/tools/update_status", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { agent_id, status, summary } = UpdateStatusSchema.parse(req.body);
        const result = await executeUpdateStatus({
            queueMaidPath: getQueueMaidPath(projectPath),
            reportsPath: getReportsPath(projectPath),
            agentId: agent_id,
            status,
            summary,
        });
        res.json(result);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid input", details: error.errors });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ success: false, error: "Status update failed", details: message });
    }
});
// assign_task (REST)
app.post("/tools/assign_task", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { task_id, target_agent, description, target_path } = AssignTaskSchema.parse(req.body);
        const result = await executeAssignTask({
            queueMaidPath: getQueueMaidPath(projectPath),
            reportsPath: getReportsPath(projectPath),
            taskId: task_id,
            targetAgent: target_agent,
            description,
            targetPath: target_path,
        });
        if (!result.success) {
            res.status(409).json(result);
            return;
        }
        res.json(result);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid input", details: error.errors });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ success: false, error: "Task assignment failed", details: message });
    }
});
// get_team_status (REST) - Phase 3: フィルタ対応
app.post("/tools/get_team_status", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        // オプショナルなフィルタパラメータ
        const { status, agentId, includeCompleted } = req.body;
        const result = await executeGetTeamStatus({
            queueMaidPath: getQueueMaidPath(projectPath),
            filter: {
                status,
                agentId,
                includeCompleted,
            },
        });
        res.json({ ...result, project_path: projectPath });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Team status retrieval failed", details: message });
    }
});
// ========================================
// Task API エンドポイント（Phase 2）
// ========================================
// GET /api/tasks - タスク一覧
app.get("/api/tasks", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        // クエリパラメータからフィルタ条件を構築
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status.split(",");
        }
        if (req.query.assignee) {
            filter.assignee = req.query.assignee;
        }
        if (req.query.parentId !== undefined) {
            filter.parentId = req.query.parentId === "null" ? null : req.query.parentId;
        }
        if (req.query.limit) {
            filter.limit = parseInt(req.query.limit, 10);
        }
        if (req.query.offset) {
            filter.offset = parseInt(req.query.offset, 10);
        }
        if (req.query.sortField) {
            filter.sortField = req.query.sortField;
        }
        if (req.query.sortOrder) {
            filter.sortOrder = req.query.sortOrder;
        }
        const result = await executeListTasks(projectPath, filter);
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task list retrieval failed", details: message });
    }
});
// GET /api/tasks/:id - タスク詳細
app.get("/api/tasks/:id", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const includeSubtasks = req.query.includeSubtasks === "true";
        const result = await executeGetTask(projectPath, {
            taskId: req.params.id,
            includeSubtasks,
        });
        if (!result.task) {
            res.status(404).json({ error: "Task not found", taskId: req.params.id });
            return;
        }
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task retrieval failed", details: message });
    }
});
// PATCH /api/tasks/:id - タスク更新
app.patch("/api/tasks/:id", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const { status, substatus, summary, reportPath } = req.body;
        const result = await executeUpdateTask(projectPath, {
            taskId: req.params.id,
            status,
            substatus,
            summary,
            reportPath,
        });
        if (!result.success) {
            res.status(404).json({ error: "Task not found", taskId: req.params.id });
            return;
        }
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Task update failed", details: message });
    }
});
// GET /api/dashboard - ダッシュボードJSON
app.get("/api/dashboard", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        // 並列でタスクを取得
        const [pending, working, completed] = await Promise.all([
            executeListTasks(projectPath, { status: ["pending"] }),
            executeListTasks(projectPath, { status: ["working", "assigned"] }),
            executeListTasks(projectPath, { status: ["completed"], limit: 10, sortField: "createdAt", sortOrder: "desc" }),
        ]);
        res.json({
            timestamp: getTimestamp(),
            summary: {
                pendingCount: pending.total,
                workingCount: working.total,
                completedCount: completed.total,
            },
            pending: pending.tasks,
            working: working.tasks,
            recentCompleted: completed.tasks,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Dashboard retrieval failed", details: message });
    }
});
// GET /dashboard - HTMLダッシュボード（ブラウザ用）
app.get("/dashboard", async (req, res) => {
    try {
        // クエリパラメータからプロジェクトパスを取得（?project=/path/to/project）
        const projectPath = req.query.project
            ? req.query.project
            : getProjectPathFromRequest(req);
        // 並列でデータを取得
        const [pending, working, completed, teamStatus] = await Promise.all([
            executeListTasks(projectPath, { status: ["pending"] }),
            executeListTasks(projectPath, { status: ["working", "assigned"] }),
            executeListTasks(projectPath, { status: ["completed"], limit: 5, sortField: "createdAt", sortOrder: "desc" }),
            executeGetTeamStatus({ queueMaidPath: getQueueMaidPath(projectPath) }),
        ]);
        // HTML生成
        const html = generateDashboardHtml({
            projectPath,
            timestamp: getTimestamp(),
            pending: pending.tasks,
            working: working.tasks,
            recentCompleted: completed.tasks,
            teamStatus: teamStatus.agents,
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).send(`<html><body><h1>Error</h1><p>${message}</p></body></html>`);
    }
});
// ========================================
// エラーハンドラ
// ========================================
app.use((err, _req, res, _next) => {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error" });
});
// ========================================
// サーバー起動
// ========================================
async function main() {
    const config = await loadConfig();
    const { port, host } = config.server;
    app.listen(port, host, () => {
        console.log(`Central MCP Server v4.1.0 running on ${getServerUrl(config)}`);
        console.log(`MCP endpoint: ${getServerUrl(config)}/mcp`);
        console.log(`Health check: ${getServerUrl(config)}/health`);
        console.log(`Mode: Streamable HTTP Transport (Multi-Project Support)`);
        console.log(`Note: Requires X-Maid-Project-Path header for project identification`);
    });
}
main().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
});
