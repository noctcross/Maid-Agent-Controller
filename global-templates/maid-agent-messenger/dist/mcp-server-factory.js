/**
 * MCP Server ファクトリ関数
 * 各セッションごとに新しい McpServer を作成
 * projectPath を受け取って動的にパスを解決
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MAID_IDS, UPDATABLE_STATUSES, } from "./types/index.js";
import { executeGetMyTask, executeUpdateStatus, executeAssignTask, executeGetTeamStatus, executeCreateTask, executeGetTask, executeListTasks, executeUpdateTask, executeGetReport, } from "./services/index.js";
import { getQueueMaidPath, getCurrentReportsPath, getArchiveReportsPath } from "./utils/path-helpers.js";
export function createMcpServer(projectPath) {
    const server = new McpServer({
        name: "maid-agent-messenger",
        version: "4.1.0",
    });
    const queueMaidPath = getQueueMaidPath(projectPath);
    const currentReportsPath = getCurrentReportsPath(projectPath);
    const archiveReportsPath = getArchiveReportsPath(projectPath);
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
                currentReportsPath,
                archiveReportsPath,
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
        title: z.string().max(100).describe("タスクタイトル（100文字以内）"),
        description: z.string().max(2000).optional().describe("タスク説明（詳細、2000文字以内、省略可）"),
        target_path: z.string().optional().describe("作業対象パス（オプション）"),
    }, async ({ task_id, target_agent, title, description, target_path }) => {
        try {
            const result = await executeAssignTask({
                queueMaidPath,
                currentReportsPath,
                templatePath: currentReportsPath, // テンプレートは作業中レポートと同じ場所
                taskId: task_id,
                targetAgent: target_agent,
                title,
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
    // Note: assigneesはcreate_taskでは指定不可。assign_taskで別途アサインする設計。
    server.tool("create_task", "新規タスクまたはサブタスクを作成します（担当者指定はassign_taskを使用）", {
        title: z.string().describe("タスクタイトル（短い概要）"),
        description: z.string().optional().describe("タスク説明（詳細、省略可）"),
        priority: z.enum(["high", "medium", "low"]).optional().describe("優先度（デフォルト: medium）"),
        parentId: z.string().optional().describe("親タスクID（サブタスク作成時に指定）"),
        category: z.enum(["task", "action_required", "skill_candidate", "improvement"]).optional().describe("カテゴリ（デフォルト: task）"),
    }, async ({ title, description, priority, parentId, category }) => {
        try {
            const result = await executeCreateTask(projectPath, {
                title,
                description,
                priority,
                parentId,
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
        summaryOnly: z.boolean().optional().describe("軽量版（id, title, status, priority, assignees, parentId, category のみ）を返却（デフォルト: false）"),
    }, async ({ taskId, includeSubtasks, summaryOnly }) => {
        try {
            const result = await executeGetTask(projectPath, {
                taskId,
                includeSubtasks,
                summaryOnly,
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
        sortField: z.enum(["createdAt", "priority", "status", "id"]).optional().describe("ソートフィールド"),
        sortOrder: z.enum(["asc", "desc"]).optional().describe("ソート順序（デフォルト: desc）"),
        summaryOnly: z.boolean().optional().describe("軽量版（id, title, status, priority, assignees, parentId, category のみ）を返却（デフォルト: false）"),
    }, async ({ status, assignee, parentId, category, limit, offset, sortField, sortOrder, summaryOnly }) => {
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
                summaryOnly,
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
    // get_report ツール
    server.tool("get_report", "タスクのレポートファイル内容を取得します（執事・メイド長用）", {
        taskId: z.string().describe("タスクID（例: 040, 040-1）"),
        limit: z.number().optional().describe("行数制限（省略時は全行返却）"),
    }, async ({ taskId, limit }) => {
        try {
            const result = await executeGetReport(projectPath, { taskId, limit });
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
                            error: "レポート取得に失敗しました",
                            details: message,
                        }),
                    }],
                isError: true,
            };
        }
    });
    return server;
}
