/**
 * タスク作成操作
 *
 * task-crud.ts から分離した create 操作を提供
 *
 * @module task-crud-create
 */
import type { Task, TaskCategory, TaskType, TaskSize } from "../types/task-manager-types.js";
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
 */
export declare function executeCreateTask(projectPath: string, params: CreateTaskParams): Promise<CreateTaskResult>;
//# sourceMappingURL=task-crud-create.d.ts.map