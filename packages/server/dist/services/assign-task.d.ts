/**
 * assign_task ビジネスロジック
 *
 * メイドにタスクを割り当てる処理。
 * unified-task-state-gateway: ガード条件のみ担当し、
 * executeUpdateTask に全処理を委譲する。
 */
import type { AssignTaskOutput } from "../types/index.js";
export interface AssignTaskParams {
    queueMaidPath: string;
    /** 作業中レポートのパス: .maid-agent/reports/ */
    currentReportsPath: string;
    /** テンプレートのパス: .maid-agent/master/reports/ */
    templatePath: string;
    taskId: string;
    targetAgent: string;
    title: string;
    description?: string;
    targetPath?: string;
    force?: boolean;
}
/**
 * タスクを割り当て
 */
export declare function executeAssignTask(params: AssignTaskParams): Promise<AssignTaskOutput>;
//# sourceMappingURL=assign-task.d.ts.map