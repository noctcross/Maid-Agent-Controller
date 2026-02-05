/**
 * タスク管理ツール（STDIOモード用ラッパー）
 *
 * Phase 1: create_task, get_task, list_tasks を登録
 * Phase 3: update_task を追加
 */
import { z } from "zod";
import { MAID_IDS } from "../types/index.js";
import { executeCreateTask, executeGetTask, executeListTasks, executeUpdateTask, } from "../services/index.js";
// STDIOモード用：カレントディレクトリ = プロジェクトディレクトリ
const getProjectPath = () => process.cwd();
// TaskStatusのZodスキーマ
const TaskStatusSchema = z.enum([
    "pending",
    "assigned",
    "working",
    "completed",
    "blocked",
    "cancelled",
]);
/**
 * create_task ツールを登録
 */
export function registerCreateTask(server) {
    server.tool("create_task", "新規タスクまたはサブタスクを作成します", {
        title: z.string().describe("タスクタイトル（短い概要）"),
        description: z.string().optional().describe("タスク説明（詳細、省略可）"),
        priority: z
            .enum(["high", "medium", "low"])
            .optional()
            .describe("優先度（デフォルト: medium）"),
        parentId: z
            .string()
            .optional()
            .describe("親タスクID（サブタスク作成時に指定）"),
        assignees: z
            .array(z.enum(MAID_IDS))
            .optional()
            .describe("担当者リスト"),
        category: z
            .enum(["task", "action_required", "skill_candidate", "improvement"])
            .optional()
            .describe("カテゴリ（デフォルト: task）"),
    }, async ({ title, description, priority, parentId, assignees, category }) => {
        try {
            const result = await executeCreateTask(getProjectPath(), {
                title,
                description,
                priority,
                parentId,
                assignees,
                category,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク作成に失敗しました",
                            details: message,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
}
/**
 * get_task ツールを登録
 */
export function registerGetTask(server) {
    server.tool("get_task", "タスクの詳細情報を取得します", {
        taskId: z.string().describe("タスクID（例: 076, 076-1）"),
        includeSubtasks: z
            .boolean()
            .optional()
            .describe("サブタスクも含めるか（デフォルト: false）"),
    }, async ({ taskId, includeSubtasks }) => {
        try {
            const result = await executeGetTask(getProjectPath(), {
                taskId,
                includeSubtasks,
            });
            if (!result.task) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "タスクが見つかりません",
                                taskId,
                            }),
                        },
                    ],
                    isError: true,
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク取得に失敗しました",
                            details: message,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
}
/**
 * list_tasks ツールを登録
 */
export function registerListTasks(server) {
    server.tool("list_tasks", "タスク一覧を取得します（フィルタ・ソート対応）", {
        status: z
            .array(TaskStatusSchema)
            .optional()
            .describe("ステータスでフィルタ（例: [\"pending\", \"working\"]）"),
        assignee: z
            .enum(MAID_IDS)
            .optional()
            .describe("担当者でフィルタ"),
        parentId: z
            .string()
            .nullable()
            .optional()
            .describe("親タスクIDでフィルタ（nullでトップレベルのみ）"),
        limit: z
            .number()
            .optional()
            .describe("取得件数上限（デフォルト: 50）"),
        offset: z
            .number()
            .optional()
            .describe("スキップ件数（ページネーション用）"),
        sortField: z
            .enum(["createdAt", "priority", "status"])
            .optional()
            .describe("ソートフィールド"),
        sortOrder: z
            .enum(["asc", "desc"])
            .optional()
            .describe("ソート順序（デフォルト: desc）"),
    }, async ({ status, assignee, parentId, limit, offset, sortField, sortOrder }) => {
        try {
            const result = await executeListTasks(getProjectPath(), {
                status: status,
                assignee,
                parentId,
                limit,
                offset,
                sortField,
                sortOrder,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク一覧取得に失敗しました",
                            details: message,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
}
/**
 * update_task ツールを登録（Phase 3）
 */
export function registerUpdateTask(server) {
    server.tool("update_task", "タスクを更新します", {
        taskId: z.string().describe("タスクID（例: 076, 076-1）"),
        status: TaskStatusSchema.optional().describe("新しいステータス"),
        substatus: z
            .string()
            .optional()
            .describe("サブステータス（blocked時の詳細など）"),
        summary: z
            .string()
            .optional()
            .describe("完了サマリー"),
        reportPath: z
            .string()
            .optional()
            .describe("報告ファイルパス（追加）"),
    }, async ({ taskId, status, substatus, summary, reportPath }) => {
        try {
            const result = await executeUpdateTask(getProjectPath(), {
                taskId,
                status,
                substatus,
                summary,
                reportPath,
            });
            if (!result.success) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "タスクが見つかりません",
                                taskId,
                            }),
                        },
                    ],
                    isError: true,
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "不明なエラー";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: "タスク更新に失敗しました",
                            details: message,
                        }),
                    },
                ],
                isError: true,
            };
        }
    });
}
/**
 * 全タスク管理ツールを一括登録（Phase 1 + Phase 3）
 */
export function registerTaskManagerTools(server) {
    registerCreateTask(server);
    registerGetTask(server);
    registerListTasks(server);
    registerUpdateTask(server);
}
