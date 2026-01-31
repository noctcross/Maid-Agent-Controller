/**
 * Central MCP Server (HTTP/SSE with MCP Protocol)
 *
 * 中央集約サーバー（ユーザーフォルダ版）
 * - MCP SSE プロトコル対応（Claude Code から直接接続可能）
 * - 複数のClaude Codeセッションから共有で使用
 * - プロジェクトパスはヘッダー（X-Maid-Project-Path）で指定
 * - pm2で常時稼働させる
 *
 * メモリ効率: 700MB → 90MB（87%削減）
 */
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import path from "path";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
import { readYamlFile, writeYamlFile, getFirstLine, getTimestamp, fileExists } from "./utils/yaml-helper.js";
import { withFileLock } from "./utils/file-lock.js";
import { MAID_IDS, UPDATABLE_STATUSES, } from "./types/index.js";
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
// ========================================
// MCP Server ファクトリ関数
// 各セッションごとに新しい McpServer を作成
// projectPath を受け取って動的にパスを解決
// ========================================
function createMcpServer(projectPath) {
    const server = new McpServer({
        name: "maid-task-server",
        version: "3.1.0",
    });
    const queueMaidPath = getQueueMaidPath(projectPath);
    // get_my_task ツール
    server.tool("get_my_task", "自分に割り当てられたタスク情報を取得します", {
        agent_id: z.enum(MAID_IDS).describe("エージェントID（例: emma, flora）"),
    }, async ({ agent_id }) => {
        const filePath = path.join(queueMaidPath, `${agent_id}.yaml`);
        try {
            if (!(await fileExists(filePath))) {
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                task_id: null,
                                description: null,
                                target_path: null,
                                status: "idle",
                                assigned_at: null,
                                started_at: null,
                                message: "タスクファイルが見つかりません",
                                project_path: projectPath,
                            }),
                        }],
                };
            }
            const task = await readYamlFile(filePath);
            const result = {
                task_id: task.task_id || null,
                description: getFirstLine(task.description),
                target_path: task.target_path || null,
                status: task.status || "idle",
                assigned_at: task.assigned_at || null,
                started_at: task.started_at || null,
                project_path: projectPath,
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "タスク取得に失敗しました", details: message, project_path: projectPath }) }],
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
        const filePath = path.join(queueMaidPath, `${agent_id}.yaml`);
        const timestamp = getTimestamp();
        try {
            const result = await withFileLock(filePath, async () => {
                const task = await readYamlFile(filePath);
                const updatedFields = ["status"];
                task.status = status;
                if (status === "working" && !task.started_at) {
                    task.started_at = timestamp;
                    updatedFields.push("started_at");
                }
                if (status === "completed") {
                    task.completed_at = timestamp;
                    updatedFields.push("completed_at");
                }
                if (summary) {
                    task.completion_summary = summary;
                    updatedFields.push("completion_summary");
                }
                await writeYamlFile(filePath, task);
                return {
                    success: true,
                    updated_fields: updatedFields,
                    timestamp,
                };
            });
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{ type: "text", text: JSON.stringify({ success: false, error: "ステータス更新に失敗しました", details: message }) }],
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
        const filePath = path.join(queueMaidPath, `${target_agent}.yaml`);
        const timestamp = getTimestamp();
        try {
            const result = await withFileLock(filePath, async () => {
                const task = await readYamlFile(filePath);
                if (task.status === "working") {
                    return {
                        success: false,
                        assigned_to: target_agent,
                        task_id: task.task_id || "",
                        error: `${target_agent} は現在作業中です（${task.task_id}）`,
                    };
                }
                task.task_id = task_id;
                task.description = description;
                task.target_path = target_path || null;
                task.status = "assigned";
                task.substatus = null;
                task.assigned_at = timestamp;
                task.started_at = null;
                task.completed_at = null;
                await writeYamlFile(filePath, task);
                return {
                    success: true,
                    assigned_to: target_agent,
                    task_id,
                };
            });
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                isError: !result.success,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{ type: "text", text: JSON.stringify({ success: false, error: `タスク割り当てに失敗しました: ${message}` }) }],
                isError: true,
            };
        }
    });
    // get_team_status ツール
    server.tool("get_team_status", "全メイドのステータス一覧を取得します（メイド長・執事用）", {}, async () => {
        const timestamp = getTimestamp();
        const agents = [];
        const summary = {};
        try {
            for (const id of MAID_IDS) {
                const filePath = path.join(queueMaidPath, `${id}.yaml`);
                try {
                    if (!(await fileExists(filePath))) {
                        agents.push({ id, status: "unknown", task_id: null });
                        summary["unknown"] = (summary["unknown"] || 0) + 1;
                        continue;
                    }
                    const task = await readYamlFile(filePath);
                    const status = task.status || "idle";
                    agents.push({
                        id,
                        status,
                        task_id: task.task_id || null,
                    });
                    summary[status] = (summary[status] || 0) + 1;
                }
                catch {
                    agents.push({ id, status: "error", task_id: null });
                    summary["error"] = (summary["error"] || 0) + 1;
                }
            }
            const result = {
                timestamp,
                summary,
                agents,
                project_path: projectPath,
            };
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [{ type: "text", text: JSON.stringify({ error: "チームステータス取得に失敗しました", details: message }) }],
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
        version: "3.1.0",
        mode: "mcp-sse-multiproject",
        activeConnections: sessions.size,
    });
});
// MCP SSE エンドポイント - GET /sse
app.get("/sse", async (req, res) => {
    // プロジェクトパスをヘッダーから取得
    const projectPath = req.headers["x-maid-project-path"];
    if (!projectPath) {
        console.error("SSE connection rejected: X-Maid-Project-Path header is required");
        res.status(400).json({
            error: "X-Maid-Project-Path header is required",
            hint: "Add 'headers': { 'X-Maid-Project-Path': '/path/to/project' } to your .mcp.json",
        });
        return;
    }
    console.log(`New SSE connection request for project: ${projectPath}`);
    try {
        // SSEServerTransport を作成（/message がメッセージ受信エンドポイント）
        const transport = new SSEServerTransport("/message", res);
        // セッション情報を保存
        const sessionId = transport.sessionId;
        sessions.set(sessionId, { transport, projectPath });
        console.log(`SSE connection established: ${sessionId} (project: ${projectPath})`);
        // 接続終了時のクリーンアップ
        res.on("close", () => {
            console.log(`SSE connection closed: ${sessionId}`);
            sessions.delete(sessionId);
        });
        // プロジェクトパスを渡して McpServer インスタンスを作成
        const server = createMcpServer(projectPath);
        await server.connect(transport);
    }
    catch (error) {
        console.error("SSE connection error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "SSE connection failed" });
        }
    }
});
// MCP メッセージ受信エンドポイント - POST /message
app.post("/message", async (req, res) => {
    // sessionId をクエリパラメータから取得
    const sessionId = req.query.sessionId;
    console.log(`Received MCP message for session: ${sessionId}`);
    if (!sessionId) {
        res.status(400).json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Bad Request: sessionId query parameter is required",
            },
            id: null,
        });
        return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
        res.status(404).json({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: `Session not found: ${sessionId}`,
            },
            id: null,
        });
        return;
    }
    try {
        // SSEServerTransport の handlePostMessage を呼び出す
        await session.transport.handlePostMessage(req, res, req.body);
    }
    catch (error) {
        console.error("Message handling error:", error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: {
                    code: -32603,
                    message: "Internal server error",
                },
                id: null,
            });
        }
    }
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
        const queueMaidPath = getQueueMaidPath(projectPath);
        const { agent_id } = GetMyTaskSchema.parse(req.body);
        const filePath = path.join(queueMaidPath, `${agent_id}.yaml`);
        if (!(await fileExists(filePath))) {
            res.json({
                task_id: null,
                description: null,
                target_path: null,
                status: "idle",
                assigned_at: null,
                started_at: null,
                message: "タスクファイルが見つかりません",
                project_path: projectPath,
            });
            return;
        }
        const task = await readYamlFile(filePath);
        res.json({
            task_id: task.task_id || null,
            description: getFirstLine(task.description),
            target_path: task.target_path || null,
            status: task.status || "idle",
            assigned_at: task.assigned_at || null,
            started_at: task.started_at || null,
            project_path: projectPath,
        });
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
        const queueMaidPath = getQueueMaidPath(projectPath);
        const { agent_id, status, summary } = UpdateStatusSchema.parse(req.body);
        const filePath = path.join(queueMaidPath, `${agent_id}.yaml`);
        const timestamp = getTimestamp();
        const result = await withFileLock(filePath, async () => {
            const task = await readYamlFile(filePath);
            const updatedFields = ["status"];
            task.status = status;
            if (status === "working" && !task.started_at) {
                task.started_at = timestamp;
                updatedFields.push("started_at");
            }
            if (status === "completed") {
                task.completed_at = timestamp;
                updatedFields.push("completed_at");
            }
            if (summary) {
                task.completion_summary = summary;
                updatedFields.push("completion_summary");
            }
            await writeYamlFile(filePath, task);
            return { success: true, updated_fields: updatedFields, timestamp };
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
        const queueMaidPath = getQueueMaidPath(projectPath);
        const { task_id, target_agent, description, target_path } = AssignTaskSchema.parse(req.body);
        const filePath = path.join(queueMaidPath, `${target_agent}.yaml`);
        const timestamp = getTimestamp();
        const result = await withFileLock(filePath, async () => {
            const task = await readYamlFile(filePath);
            if (task.status === "working") {
                return {
                    success: false,
                    assigned_to: target_agent,
                    task_id: task.task_id || "",
                    error: `${target_agent} は現在作業中です（${task.task_id}）`,
                };
            }
            task.task_id = task_id;
            task.description = description;
            task.target_path = target_path || null;
            task.status = "assigned";
            task.substatus = null;
            task.assigned_at = timestamp;
            task.started_at = null;
            task.completed_at = null;
            await writeYamlFile(filePath, task);
            return { success: true, assigned_to: target_agent, task_id };
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
// get_team_status (REST)
app.post("/tools/get_team_status", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const queueMaidPath = getQueueMaidPath(projectPath);
        const timestamp = getTimestamp();
        const agents = [];
        const summary = {};
        for (const id of MAID_IDS) {
            const filePath = path.join(queueMaidPath, `${id}.yaml`);
            try {
                if (!(await fileExists(filePath))) {
                    agents.push({ id, status: "unknown", task_id: null });
                    summary["unknown"] = (summary["unknown"] || 0) + 1;
                    continue;
                }
                const task = await readYamlFile(filePath);
                const status = task.status || "idle";
                agents.push({ id, status, task_id: task.task_id || null });
                summary[status] = (summary[status] || 0) + 1;
            }
            catch {
                agents.push({ id, status: "error", task_id: null });
                summary["error"] = (summary["error"] || 0) + 1;
            }
        }
        res.json({ timestamp, summary, agents, project_path: projectPath });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "Team status retrieval failed", details: message });
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
        console.log(`Central MCP Server v3.1.0 running on ${getServerUrl(config)}`);
        console.log(`MCP SSE endpoint: ${getServerUrl(config)}/sse`);
        console.log(`Health check: ${getServerUrl(config)}/health`);
        console.log(`Mode: MCP SSE Protocol (Multi-Project Support)`);
        console.log(`Note: Requires X-Maid-Project-Path header for project identification`);
    });
}
main().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
});
