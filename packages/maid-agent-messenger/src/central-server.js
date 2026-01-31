"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const zod_1 = require("zod");
const path_1 = __importDefault(require("path"));
const config_loader_js_1 = require("./utils/config-loader.js");
const yaml_helper_js_1 = require("./utils/yaml-helper.js");
const file_lock_js_1 = require("./utils/file-lock.js");
const index_js_1 = require("./types/index.js");
const app = (0, express_1.default)();
app.use(express_1.default.json());
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
    return path_1.default.join(projectPath, ".maid-agent", "queue", "maid");
}
function getReportsPath(projectPath) {
    return path_1.default.join(projectPath, ".maid-agent", "reports");
}
// ========================================
// MCP Server ファクトリ関数
// 各セッションごとに新しい McpServer を作成
// projectPath を受け取って動的にパスを解決
// ========================================
function createMcpServer(projectPath) {
    const server = new mcp_js_1.McpServer({
        name: "maid-agent-messenger",
        version: "3.1.0",
    });
    const queueMaidPath = getQueueMaidPath(projectPath);
    // get_my_task ツール
    server.tool("get_my_task", "自分に割り当てられたタスク情報を取得します", {
        agent_id: zod_1.z.enum(index_js_1.MAID_IDS).describe("エージェントID（例: emma, flora）"),
    }, async ({ agent_id }) => {
        const filePath = path_1.default.join(queueMaidPath, `${agent_id}.yaml`);
        try {
            if (!(await (0, yaml_helper_js_1.fileExists)(filePath))) {
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
            const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
            const result = {
                task_id: task.task_id || null,
                description: (0, yaml_helper_js_1.getFirstLine)(task.description),
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
        agent_id: zod_1.z.enum(index_js_1.MAID_IDS).describe("エージェントID（例: emma, flora）"),
        status: zod_1.z.enum(index_js_1.UPDATABLE_STATUSES).describe("新しいステータス（working, completed, blocked）"),
        summary: zod_1.z.string().max(100).optional().describe("作業サマリ（100文字以内、オプション）"),
    }, async ({ agent_id, status, summary }) => {
        const filePath = path_1.default.join(queueMaidPath, `${agent_id}.yaml`);
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        try {
            const result = await (0, file_lock_js_1.withFileLock)(filePath, async () => {
                const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
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
                await (0, yaml_helper_js_1.writeYamlFile)(filePath, task);
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
        task_id: zod_1.z.string().describe("タスクID（例: task-025-001）"),
        target_agent: zod_1.z.enum(index_js_1.MAID_IDS).describe("割り当て先エージェント（例: emma, flora）"),
        description: zod_1.z.string().max(500).describe("タスク説明（500文字以内）"),
        target_path: zod_1.z.string().optional().describe("作業対象パス（オプション）"),
    }, async ({ task_id, target_agent, description, target_path }) => {
        const filePath = path_1.default.join(queueMaidPath, `${target_agent}.yaml`);
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        try {
            const result = await (0, file_lock_js_1.withFileLock)(filePath, async () => {
                const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
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
                await (0, yaml_helper_js_1.writeYamlFile)(filePath, task);
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
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        const agents = [];
        const summary = {};
        try {
            for (const id of index_js_1.MAID_IDS) {
                const filePath = path_1.default.join(queueMaidPath, `${id}.yaml`);
                try {
                    if (!(await (0, yaml_helper_js_1.fileExists)(filePath))) {
                        agents.push({ id, status: "unknown", task_id: null });
                        summary["unknown"] = (summary["unknown"] || 0) + 1;
                        continue;
                    }
                    const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
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
        timestamp: (0, yaml_helper_js_1.getTimestamp)(),
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
        const transport = new sse_js_1.SSEServerTransport("/message", res);
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
const GetMyTaskSchema = zod_1.z.object({
    agent_id: zod_1.z.enum(index_js_1.MAID_IDS),
});
const UpdateStatusSchema = zod_1.z.object({
    agent_id: zod_1.z.enum(index_js_1.MAID_IDS),
    status: zod_1.z.enum(index_js_1.UPDATABLE_STATUSES),
    summary: zod_1.z.string().max(100).optional(),
});
const AssignTaskSchema = zod_1.z.object({
    task_id: zod_1.z.string(),
    target_agent: zod_1.z.enum(index_js_1.MAID_IDS),
    description: zod_1.z.string().max(500),
    target_path: zod_1.z.string().optional(),
});
// get_my_task (REST)
app.post("/tools/get_my_task", async (req, res) => {
    try {
        const projectPath = getProjectPathFromRequest(req);
        const queueMaidPath = getQueueMaidPath(projectPath);
        const { agent_id } = GetMyTaskSchema.parse(req.body);
        const filePath = path_1.default.join(queueMaidPath, `${agent_id}.yaml`);
        if (!(await (0, yaml_helper_js_1.fileExists)(filePath))) {
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
        const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
        res.json({
            task_id: task.task_id || null,
            description: (0, yaml_helper_js_1.getFirstLine)(task.description),
            target_path: task.target_path || null,
            status: task.status || "idle",
            assigned_at: task.assigned_at || null,
            started_at: task.started_at || null,
            project_path: projectPath,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
        const filePath = path_1.default.join(queueMaidPath, `${agent_id}.yaml`);
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        const result = await (0, file_lock_js_1.withFileLock)(filePath, async () => {
            const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
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
            await (0, yaml_helper_js_1.writeYamlFile)(filePath, task);
            return { success: true, updated_fields: updatedFields, timestamp };
        });
        res.json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
        const filePath = path_1.default.join(queueMaidPath, `${target_agent}.yaml`);
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        const result = await (0, file_lock_js_1.withFileLock)(filePath, async () => {
            const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
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
            await (0, yaml_helper_js_1.writeYamlFile)(filePath, task);
            return { success: true, assigned_to: target_agent, task_id };
        });
        if (!result.success) {
            res.status(409).json(result);
            return;
        }
        res.json(result);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
        const timestamp = (0, yaml_helper_js_1.getTimestamp)();
        const agents = [];
        const summary = {};
        for (const id of index_js_1.MAID_IDS) {
            const filePath = path_1.default.join(queueMaidPath, `${id}.yaml`);
            try {
                if (!(await (0, yaml_helper_js_1.fileExists)(filePath))) {
                    agents.push({ id, status: "unknown", task_id: null });
                    summary["unknown"] = (summary["unknown"] || 0) + 1;
                    continue;
                }
                const task = await (0, yaml_helper_js_1.readYamlFile)(filePath);
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
    const config = await (0, config_loader_js_1.loadConfig)();
    const { port, host } = config.server;
    app.listen(port, host, () => {
        console.log(`Central MCP Server v3.1.0 running on ${(0, config_loader_js_1.getServerUrl)(config)}`);
        console.log(`MCP SSE endpoint: ${(0, config_loader_js_1.getServerUrl)(config)}/sse`);
        console.log(`Health check: ${(0, config_loader_js_1.getServerUrl)(config)}/health`);
        console.log(`Mode: MCP SSE Protocol (Multi-Project Support)`);
        console.log(`Note: Requires X-Maid-Project-Path header for project identification`);
    });
}
main().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
});
//# sourceMappingURL=central-server.js.map