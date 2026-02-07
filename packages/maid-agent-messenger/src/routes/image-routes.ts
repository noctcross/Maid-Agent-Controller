/**
 * 画像配信エンドポイント
 * GET /agent-image - エージェントのイラスト画像を配信
 */

import { Router, Request, Response } from "express";
import path from "path";
import { findAgentImages, IMAGES_RELATIVE_PATH } from "../utils/agent-image.js";

const router = Router();

/**
 * エージェント画像リクエストを処理する
 *
 * @param req - Express Request（query: agent, project）
 * @param res - Express Response
 */
export async function handleAgentImage(req: Request, res: Response): Promise<void> {
  const agent = req.query.agent as string;
  const project = req.query.project as string;

  if (!agent) {
    res.status(400).send("Missing agent parameter");
    return;
  }
  if (!project) {
    res.status(400).send("Missing project parameter");
    return;
  }

  const imagesDir = path.join(project, IMAGES_RELATIVE_PATH);
  const images = await findAgentImages(imagesDir, agent);

  if (images.length === 0) {
    res.status(404).send("No image found");
    return;
  }

  // ランダム選択
  const selected = images[Math.floor(Math.random() * images.length)];
  const filePath = path.join(imagesDir, selected);

  // キャッシュ制御（同一セッション中は同じ画像を使うよう1時間キャッシュ）
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.sendFile(filePath);
}

router.get("/agent-image", handleAgentImage);

export default router;
