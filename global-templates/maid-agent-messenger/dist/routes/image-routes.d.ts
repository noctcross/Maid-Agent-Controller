/**
 * 画像配信エンドポイント
 * GET /agent-image - エージェントのイラスト画像を配信
 */
import { Request, Response } from "express";
declare const router: import("express-serve-static-core").Router;
/**
 * エージェント画像リクエストを処理する
 *
 * @param req - Express Request（query: agent, project）
 * @param res - Express Response
 */
export declare function handleAgentImage(req: Request, res: Response): Promise<void>;
export default router;
