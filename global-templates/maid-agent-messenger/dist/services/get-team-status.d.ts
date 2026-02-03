/**
 * get_team_status ビジネスロジック
 *
 * 全メイドのステータス一覧を取得する処理
 * Phase 3: フィルタ対応（status, agentId, includeCompleted）
 */
import { type GetTeamStatusOutput } from "../types/index.js";
import { type Task } from "./task-manager.js";
export interface GetTeamStatusParams {
    queueMaidPath: string;
    filter?: {
        status?: string[];
        agentId?: string;
        includeCompleted?: number;
    };
}
export interface ExtendedGetTeamStatusOutput extends GetTeamStatusOutput {
    recentCompleted?: Task[];
}
/**
 * チームステータスを取得
 * Phase 3: フィルタ対応
 */
export declare function executeGetTeamStatus(params: GetTeamStatusParams): Promise<ExtendedGetTeamStatusOutput>;
