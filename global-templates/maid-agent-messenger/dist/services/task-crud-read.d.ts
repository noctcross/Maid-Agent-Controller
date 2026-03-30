/**
 * タスク読み取り操作
 *
 * task-crud.ts から分割。Get, List 操作を提供。
 *
 * @module task-crud-read
 */
import type { TaskStatus, Task, TaskSummary, TaskCategory } from "../types/task-manager-types.js";
export interface GetTaskParams {
    taskId: string;
    includeSubtasks?: boolean;
    summaryOnly?: boolean;
}
export interface GetTaskResult {
    task: Task | TaskSummary | null;
    subtasks?: (Task | TaskSummary)[];
}
/**
 * タスク取得
 */
export declare function executeGetTask(projectPath: string, params: GetTaskParams): Promise<GetTaskResult>;
export interface ListTasksParams {
    status?: TaskStatus[];
    assignee?: string;
    parentId?: string | null;
    category?: TaskCategory[];
    actionRequired?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
    sortField?: "createdAt" | "completedAt" | "priority" | "status" | "id" | "updatedAt";
    sortOrder?: "asc" | "desc";
    summaryOnly?: boolean;
}
export interface ListTasksResult {
    tasks: (Task | TaskSummary)[];
    total: number;
    hasMore: boolean;
}
/**
 * タスクIDを数値的に比較する
 * 例: "048" < "048-1" < "048-2" < "048-10" (文字列比較だと "048-10" < "048-2" になる)
 */
export declare function compareTaskIds(a: string, b: string): number;
/**
 * タスク一覧取得
 */
export declare function executeListTasks(projectPath: string, params?: ListTasksParams): Promise<ListTasksResult>;
/**
 * 子タスク取得
 *
 * 指定したparentIdを持つ子タスクを取得する。
 * アサイン時・完了時のチェックで使用。
 */
export declare function executeGetTaskChildren(projectPath: string, parentId: string): Promise<Task[]>;
