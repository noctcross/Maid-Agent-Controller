/**
 * タスク作成操作
 *
 * task-crud.ts から分割。Create 操作を提供。
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
 *
 * Note: assigneesはcreate_taskでは指定不可。assign_taskで別途アサインする。
 * 理由: 作業中メイドへのアサインを防ぐガード条件がassign_taskにあるため。
 */
export declare function executeCreateTask(projectPath: string, params: CreateTaskParams): Promise<CreateTaskResult>;
