/**
 * エージェント画像ユーティリティ
 *
 * 報告書ファイル名からエージェントIDを抽出し、
 * 対応するイラスト画像を検索する機能を提供。
 */

import * as fs from "fs/promises";
import path from "path";

/** 全エージェントID */
export const AGENT_IDS = [
  "emma", "sophia", "lily", "rose",
  "alice", "may", "flora", "luna",
  "butler", "chief",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/** サポートする画像拡張子 */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"] as const;

/** ステータス名（画像検索で除外対象） */
const STATUS_NAMES = ["working", "completed", "blocked", "idle", "assigned", "pending"];

/** .maid-agent 内の画像ディレクトリの相対パス */
export const IMAGES_RELATIVE_PATH = ".maid-agent/system/resources/images";

/**
 * 報告書のファイルパスからエージェントIDを抽出する
 *
 * 対応パターン:
 * - current_{agentId}.md
 * - task-{number}-{agentId}.md
 * - task-{number}-{subtask}-{agentId}.md
 *
 * @param filePath - 報告書のファイルパス
 * @returns エージェントID、マッチしない場合はnull
 */
export function extractAgentIdFromPath(filePath: string): string | null {
  const fileName = path.basename(filePath);

  // .md 拡張子チェック
  if (!fileName.endsWith(".md")) {
    return null;
  }

  const nameWithoutExt = fileName.slice(0, -3);

  // パターン1: current_{agentId}
  const currentMatch = nameWithoutExt.match(/^current_(\w+)$/);
  if (currentMatch) {
    const id = currentMatch[1];
    if (isAgentId(id)) return id;
  }

  // パターン2: task-{number}-{agentId} または task-{number}-{subtask}-{agentId}
  // 説明文付き（task-081-alice-説明文.md）にも対応
  const taskMatch = nameWithoutExt.match(/^task-\d+(?:-\d+)?-([a-z]+)(?:-|$)/);
  if (taskMatch) {
    const id = taskMatch[1];
    if (isAgentId(id)) return id;
  }

  return null;
}

/**
 * 文字列が有効なエージェントIDかどうか判定する
 */
function isAgentId(id: string): id is AgentId {
  return (AGENT_IDS as readonly string[]).includes(id);
}

/**
 * 指定ディレクトリからエージェントの画像ファイル名一覧を取得する
 *
 * 検出対象:
 * - ベース画像: {agentId}.{ext}
 * - バージョン画像: {agentId}_{number}.{ext}
 *
 * 除外対象:
 * - ステータス画像: {agentId}_{status}.{ext}
 *
 * @param imagesDir - 画像ディレクトリの絶対パス
 * @param agentId - エージェントID
 * @returns マッチした画像ファイル名の配列
 */
export async function findAgentImages(
  imagesDir: string,
  agentId: string,
): Promise<string[]> {
  try {
    const files = await fs.readdir(imagesDir);
    const extPattern = IMAGE_EXTENSIONS.join("|");
    // ベース画像: {agentId}.{ext}
    const baseRegex = new RegExp(`^${agentId}\\.(${extPattern})$`);
    // バージョン画像: {agentId}_{number}.{ext}
    const versionRegex = new RegExp(`^${agentId}_(\\d+)\\.(${extPattern})$`);

    return files.filter((file) => baseRegex.test(file) || versionRegex.test(file));
  } catch {
    return [];
  }
}

/**
 * エージェント背景イラスト用のCSS+HTMLスニペットを生成する
 *
 * 生成されるスニペット:
 * - CSS: position:fixed でスクロール追従、pointer-events:none でクリック透過
 * - bodyHtml: <img> 要素（class="agent-background"）
 *
 * @param imageUrl - 画像のURL（/agent-image?agent=xxx&project=xxx）
 * @returns css と bodyHtml のスニペット
 */
export function generateAgentBackgroundSnippet(imageUrl: string): {
  css: string;
  bodyHtml: string;
} {
  const css = `
    .agent-background {
      position: fixed;
      bottom: 0;
      right: 0;
      height: 50vh;
      opacity: 0.18;
      pointer-events: none;
      z-index: 0;
      user-select: none;
      -webkit-user-select: none;
    }`;

  const bodyHtml = `<img src="${imageUrl}" class="agent-background" alt="" draggable="false">`;

  return { css, bodyHtml };
}
