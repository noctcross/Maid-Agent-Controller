/**
 * get_my_task ビジネスロジック
 *
 * 自分に割り当てられたタスク情報を取得する処理
 */
import type { GetMyTaskOutput } from "../types/index.js";
export interface GetMyTaskParams {
    queueMaidPath: string;
    agentId: string;
}
export interface GetMyTaskResult extends GetMyTaskOutput {
    message?: string;
}
/**
 * タスク情報を取得
 */
export declare function executeGetMyTask(params: GetMyTaskParams): Promise<GetMyTaskResult>;
