/**
 * update_status ビジネスロジック
 *
 * タスクステータスを更新する処理
 * completed時のレポートローテーションも含む
 */
import type { UpdateStatusOutput, UpdatableStatus } from "../types/index.js";
export interface UpdateStatusParams {
    queueMaidPath: string;
    reportsPath: string;
    agentId: string;
    status: UpdatableStatus;
    summary?: string;
}
/**
 * ステータスを更新
 */
export declare function executeUpdateStatus(params: UpdateStatusParams): Promise<UpdateStatusOutput>;
