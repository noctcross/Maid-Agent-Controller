/**
 * get_my_task ビジネスロジック
 *
 * 自分に割り当てられたタスク情報を取得する処理
 */
import type { GetMyTaskOutput, ParkedTask } from "../types/index.js";
export interface GetMyTaskParams {
    queueMaidPath: string;
    agentId: string;
    summaryOnly?: boolean;
    projectPath?: string;
}
/**
 * 親タスク情報の型
 */
export interface ParentTaskInfo {
    id: string;
    title: string;
    type: string;
    description?: string;
    subStatus?: string;
}
export interface GetMyTaskResult extends GetMyTaskOutput {
    message?: string;
    parent_chain?: ParentTaskInfo[];
    parked_tasks?: ParkedTask[];
}
/**
 * タスク情報を取得
 */
export declare function executeGetMyTask(params: GetMyTaskParams): Promise<GetMyTaskResult>;
