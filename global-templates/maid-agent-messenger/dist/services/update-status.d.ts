/**
 * update_status ビジネスロジック
 *
 * タスクステータスを更新する処理。
 * unified-task-state-gateway: maid yaml から task_id を取得し、
 * executeUpdateTask に全処理を委譲する。
 */
import type { UpdateStatusOutput, UpdatableStatus } from "../types/index.js";
export interface UpdateStatusParams {
    queueMaidPath: string;
    /** 作業中レポートのパス: .maid-agent/reports/ */
    currentReportsPath: string;
    /** 完了レポートのパス: .maid-agent/master/reports/ */
    archiveReportsPath: string;
    agentId: string;
    status: UpdatableStatus;
    summary?: string;
    actionRequired?: boolean;
}
/**
 * ステータスを更新
 */
export declare function executeUpdateStatus(params: UpdateStatusParams): Promise<UpdateStatusOutput>;
