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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
  // タスク管理サービス（Phase 1 + Phase 3）
  executeCreateTask,
  executeGetTask,
  executeListTasks,
  executeUpdateTask,
  executeGetReport,
  type TaskStatus,
} from "./services/index.js";
import { getQueueMaidPath, getCurrentReportsPath, getArchiveReportsPath } from "./utils/path-helpers.js";

// ルーター
import { createMcpRoutes, type SessionInfo } from "./routes/mcp-routes.js";
import legacyRoutes from "./routes/legacy-routes.js";
import taskApiRoutes from "./routes/task-api-routes.js";
import { createDashboardRoutes } from "./routes/dashboard-routes.js";
import fileRoutes from "./routes/file-routes.js";

// ビュー
import { generateDashboardHtml } from "./views/dashboard-html.js";
import { generateTaskHtml } from "./views/task-html.js";

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

// セッションID -> SessionInfo のマップ
const sessions = new Map<string, SessionInfo>();

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
  const currentReportsPath = getCurrentReportsPath(projectPath);
  const archiveReportsPath = getArchiveReportsPath(projectPath);

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
          currentReportsPath,
          archiveReportsPath,
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
      title: z.string().max(100).describe("タスクタイトル（100文字以内）"),
      description: z.string().max(2000).optional().describe("タスク説明（詳細、2000文字以内、省略可）"),
      target_path: z.string().optional().describe("作業対象パス（オプション）"),
    },
    async ({ task_id, target_agent, title, description, target_path }) => {
      try {
        const result = await executeAssignTask({
          queueMaidPath,
          currentReportsPath,
          templatePath: currentReportsPath,  // テンプレートは作業中レポートと同じ場所
          taskId: task_id,
          targetAgent: target_agent,
          title,
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

  // get_team_status ツール（Phase 3: フィルタ対応）
  server.tool(
    "get_team_status",
    "全メイドのステータス一覧を取得します（メイド長・執事用）。フィルタ・完了タスク取得対応。",
    {
      status: z.array(z.string()).optional().describe("ステータスでフィルタ（例: [\"working\", \"blocked\"]）"),
      agentId: z.enum(MAID_IDS).optional().describe("特定のエージェントのみ取得"),
      includeCompleted: z.number().optional().describe("直近N件の完了タスクを含める（tasks.yamlから取得）"),
    },
    async ({ status, agentId, includeCompleted }) => {
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
  server.tool(
    "create_task",
    "新規タスクまたはサブタスクを作成します",
    {
      title: z.string().describe("タスクタイトル（短い概要）"),
      description: z.string().optional().describe("タスク説明（詳細、省略可）"),
      priority: z.enum(["high", "medium", "low"]).optional().describe("優先度（デフォルト: medium）"),
      parentId: z.string().optional().describe("親タスクID（サブタスク作成時に指定）"),
      assignees: z.array(z.enum(MAID_IDS)).optional().describe("担当者リスト"),
      category: z.enum(["task", "action_required", "skill_candidate", "improvement"]).optional().describe("カテゴリ（デフォルト: task）"),
    },
    async ({ title, description, priority, parentId, assignees, category }) => {
      try {
        const result = await executeCreateTask(projectPath, {
          title,
          description,
          priority,
          parentId,
          assignees,
          category,
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
              error: "タスク作成に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // get_task ツール
  server.tool(
    "get_task",
    "タスクの詳細情報を取得します",
    {
      taskId: z.string().describe("タスクID（例: 076, 076-1）"),
      includeSubtasks: z.boolean().optional().describe("サブタスクも含めるか（デフォルト: false）"),
    },
    async ({ taskId, includeSubtasks }) => {
      try {
        const result = await executeGetTask(projectPath, {
          taskId,
          includeSubtasks,
        });

        if (!result.task) {
          return {
            content: [{
              type: "text" as const,
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
              error: "タスク取得に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // list_tasks ツール
  server.tool(
    "list_tasks",
    "タスク一覧を取得します（フィルタ・ソート対応）",
    {
      status: z.array(TaskStatusSchema).optional().describe("ステータスでフィルタ"),
      assignee: z.enum(MAID_IDS).optional().describe("担当者でフィルタ"),
      parentId: z.string().nullable().optional().describe("親タスクIDでフィルタ（nullでトップレベルのみ）"),
      category: z.array(z.enum(["task", "action_required", "skill_candidate", "improvement"])).optional().describe("カテゴリでフィルタ"),
      limit: z.number().optional().describe("取得件数上限（デフォルト: 50）"),
      offset: z.number().optional().describe("スキップ件数（ページネーション用）"),
      sortField: z.enum(["createdAt", "priority", "status", "id"]).optional().describe("ソートフィールド"),
      sortOrder: z.enum(["asc", "desc"]).optional().describe("ソート順序（デフォルト: desc）"),
    },
    async ({ status, assignee, parentId, category, limit, offset, sortField, sortOrder }) => {
      try {
        const result = await executeListTasks(projectPath, {
          status: status as TaskStatus[] | undefined,
          assignee,
          parentId,
          category: category as ("task" | "action_required" | "skill_candidate" | "improvement")[] | undefined,
          limit,
          offset,
          sortField,
          sortOrder,
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
              error: "タスク一覧取得に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // update_task ツール（Phase 3）
  server.tool(
    "update_task",
    "タスクを更新します",
    {
      taskId: z.string().describe("タスクID（例: 076, 076-1）"),
      status: TaskStatusSchema.optional().describe("新しいステータス"),
      substatus: z.string().optional().describe("サブステータス（blocked時の詳細など）"),
      category: z.enum(["task", "action_required", "skill_candidate", "improvement"]).optional().describe("カテゴリ"),
      summary: z.string().optional().describe("完了サマリー"),
      reportPath: z.string().optional().describe("報告ファイルパス（追加）"),
    },
    async ({ taskId, status, substatus, category, summary, reportPath }) => {
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
              type: "text" as const,
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
              error: "タスク更新に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // get_report ツール
  server.tool(
    "get_report",
    "タスクのレポートファイル内容を取得します（執事・メイド長用）",
    {
      taskId: z.string().describe("タスクID（例: 040, 040-1）"),
      limit: z.number().optional().describe("行数制限（省略時は全行返却）"),
    },
    async ({ taskId, limit }) => {
      try {
        const result = await executeGetReport(projectPath, { taskId, limit });

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
              error: "レポート取得に失敗しました",
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


// ========================================
// ルートマウント
// ========================================

app.use(createMcpRoutes({ sessions, createMcpServer }));
app.use(legacyRoutes);
app.use(taskApiRoutes);
app.use(createDashboardRoutes({ generateDashboardHtml, generateTaskHtml }));
app.use(fileRoutes);

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
