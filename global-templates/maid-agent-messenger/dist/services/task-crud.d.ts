/**
 * タスク CRUD 操作
 *
 * create, get, list, update 操作を提供。
 * task-manager.ts から責務分割のため分離。
 */
import type { TaskStatus, Task, TaskSummary, TaskCategory, TaskType, UpdateTaskParams, UpdateTaskResult, TaskSize } from "../types/task-manager-types.js";
export interface CreateTaskParams {
    title: string;
    description?: string;
    priority?: "high" | "medium" | "low";
    parentId?: string;
    category?: TaskCategory;
    type?: TaskType;
    size?: TaskSize;
    tentative?: boolean;
    blockedBy?: string[];
}
export interface CreateTaskResult {
    taskId: string;
    task: Task;
    reopenedParent?: Task;
    reopenedAncestors?: Task[];
}
/**
 * タスク作成
 *
 * Note: assigneesはcreate_taskでは指定不可。assign_taskで別途アサインする。
 * 理由: 作業中メイドへのアサインを防ぐガード条件がassign_taskにあるため。
 */
export declare function executeCreateTask(projectPath: string, params: CreateTaskParams): Promise<CreateTaskResult>;
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
    reviewed?: boolean;
    starred?: boolean;
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
 * タスク更新
 *
 * unified-task-state-gateway: 唯一の書き込みゲートウェイ。
 * tasks.yaml 更新後、副作用（maid yaml同期・レポートアーカイブ・テンプレート初期化）を実行。
 */
export declare function executeUpdateTask(projectPath: string, params: UpdateTaskParams): Promise<UpdateTaskResult>;
