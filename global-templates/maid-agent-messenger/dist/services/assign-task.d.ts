/**
 * assign_task ビジネスロジック
 *
 * メイドにタスクを割り当てる処理
 */
import type { AssignTaskOutput } from "../types/index.js";
export interface AssignTaskParams {
    queueMaidPath: string;
    reportsPath: string;
    taskId: string;
    targetAgent: string;
    description: string;
    targetPath?: string;
}
/**
 * タスクを割り当て
 */
export declare function executeAssignTask(params: AssignTaskParams): Promise<AssignTaskOutput>;
