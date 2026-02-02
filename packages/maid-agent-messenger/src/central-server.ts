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

import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import path from "path";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
import { getTimestamp } from "./utils/yaml-helper.js";
import {
  MAID_IDS,
  UPDATABLE_STATUSES,
} from "./types/index.js";

// サービス層からビジネスロジックをインポート
import {
  executeGetMyTask,
  executeUpdateStatus,
  executeAssignTask,
  executeGetTeamStatus,
} from "./services/index.js";

const app = express();
app.use(express.json());

// リクエストログ
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ========================================
// セッション管理
// ========================================

interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  projectPath: string;
}

// セッションID -> SessionInfo のマップ
const sessions = new Map<string, SessionInfo>();

// ========================================
// パスヘルパー関数
// ========================================

function getQueueMaidPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "queue", "maid");
}

function getReportsPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "reports");
}

// ========================================
// MCP Server ファクトリ関数
// 各セッションごとに新しい McpServer を作成
// projectPath を受け取って動的にパスを解決
// ========================================

function createMcpServer(projectPath: string): McpServer {
  const server = new McpServer({
    name: "maid-agent-messenger",
    version: "4.1.0",
  });

  const queueMaidPath = getQueueMaidPath(projectPath);
  const reportsPath = getReportsPath(projectPath);

  // get_my_task ツール
  server.tool(
    "get_my_task",
    "自分に割り当てられたタスク情報を取得します",
    {
      agent_id: z.enum(MAID_IDS).describe("エージェントID（例: emma, flora）"),
    },
    async ({ agent_id }) => {
      try {
        const result = await executeGetMyTask({
          queueMaidPath,
          agentId: agent_id,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ...result, project_path: projectPath }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "タスク取得に失敗しました",
              details: message,
              project_path: projectPath,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // update_status ツール
  server.tool(
    "update_status",
    "自分のタスクステータスを更新します",
    {
      agent_id: z.enum(MAID_IDS).describe("エージェントID（例: emma, flora）"),
      status: z.enum(UPDATABLE_STATUSES).describe("新しいステータス（working, completed, blocked）"),
      summary: z.string().max(100).optional().describe("作業サマリ（100文字以内、オプション）"),
    },
    async ({ agent_id, status, summary }) => {
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
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "ステータス更新に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // assign_task ツール
  server.tool(
    "assign_task",
    "メイドにタスクを割り当てます（メイド長専用）",
    {
      task_id: z.string().describe("タスクID（例: task-025-001）"),
      target_agent: z.enum(MAID_IDS).describe("割り当て先エージェント（例: emma, flora）"),
      description: z.string().max(500).describe("タスク説明（500文字以内）"),
      target_path: z.string().optional().describe("作業対象パス（オプション）"),
    },
    async ({ task_id, target_agent, description, target_path }) => {
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
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
          isError: !result.success,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: `タスク割り当てに失敗しました: ${message}`,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // get_team_status ツール
  server.tool(
    "get_team_status",
    "全メイドのステータス一覧を取得します（メイド長・執事用）",
    {},
    async () => {
      try {
        const result = await executeGetTeamStatus({
          queueMaidPath,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ...result, project_path: projectPath }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "チームステータス取得に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ========================================
// HTTP エンドポイント
// ========================================

// ヘルスチェック
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: getTimestamp(),
    version: "4.1.0",
    mode: "streamable-http-multiproject",
    activeConnections: sessions.size,
  });
});

// MCP Streamable HTTP エンドポイント - POST /mcp
app.post("/mcp", async (req: Request, res: Response) => {
  // プロジェクトパスをヘッダーから取得
  const projectPath = req.headers["x-maid-project-path"] as string;

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
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // 既存セッションがある場合はそれを使用
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    console.log(`Reusing session: ${sessionId}`);
    try {
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
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

  // 新規セッションを作成（Initialize リクエストの場合）
  console.log(`New MCP connection request for project: ${projectPath}`);

  try {
    const newSessionId = randomUUID();

    // StreamableHTTPServerTransport を作成
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid: string) => {
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

  } catch (error) {
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
app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

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

  const session = sessions.get(sessionId)!;
  console.log(`SSE stream requested for session: ${sessionId}`);

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
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
app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

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
function getProjectPathFromRequest(req: Request): string {
  const projectPath = req.headers["x-maid-project-path"] as string;
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
app.post("/tools/get_my_task", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { agent_id } = GetMyTaskSchema.parse(req.body);

    const result = await executeGetMyTask({
      queueMaidPath: getQueueMaidPath(projectPath),
      agentId: agent_id,
    });

    res.json({ ...result, project_path: projectPath });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task retrieval failed", details: message });
  }
});

// update_status (REST)
app.post("/tools/update_status", async (req: Request, res: Response) => {
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: "Status update failed", details: message });
  }
});

// assign_task (REST)
app.post("/tools/assign_task", async (req: Request, res: Response) => {
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: "Task assignment failed", details: message });
  }
});

// get_team_status (REST)
app.post("/tools/get_team_status", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);

    const result = await executeGetTeamStatus({
      queueMaidPath: getQueueMaidPath(projectPath),
    });

    res.json({ ...result, project_path: projectPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Team status retrieval failed", details: message });
  }
});

// ========================================
// エラーハンドラ
// ========================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ========================================
// サーバー起動
// ========================================

async function main(): Promise<void> {
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
