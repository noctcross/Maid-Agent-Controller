/**
 * エージェント画像ユーティリティ
 *
 * 報告書ファイル名からエージェントIDを抽出し、
 * 対応するイラスト画像を検索する機能を提供。
 */
/** 全エージェントID */
export declare const AGENT_IDS: readonly ["emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna", "butler", "chief"];
export type AgentId = (typeof AGENT_IDS)[number];
/** サポートする画像拡張子 */
export declare const IMAGE_EXTENSIONS: readonly ["png", "jpg", "jpeg", "gif", "webp"];
/** .maid-agent 内の画像ディレクトリの相対パス */
export declare const IMAGES_RELATIVE_PATH = ".maid-agent/system/resources/images";
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
export declare function extractAgentIdFromPath(filePath: string): string | null;
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
export declare function findAgentImages(imagesDir: string, agentId: string): Promise<string[]>;
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
export declare function generateAgentBackgroundSnippet(imageUrl: string): {
    css: string;
    bodyHtml: string;
};
