/**
 * get_team_status ビジネスロジック
 *
 * 全メイドのステータス一覧を取得する処理
 */
import { type GetTeamStatusOutput } from "../types/index.js";
export interface GetTeamStatusParams {
    queueMaidPath: string;
}
/**
 * チームステータスを取得
 */
export declare function executeGetTeamStatus(params: GetTeamStatusParams): Promise<GetTeamStatusOutput>;
