/**
 * パスヘルパー関数
 * プロジェクトパスから各種ディレクトリパスを構築する
 */

import path from "path";

export function getQueueMaidPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "system", "data", "maid");
}

// 作業中レポート: .maid-agent/system/data/reports/ (中間ファイル)
export function getCurrentReportsPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "system", "data", "reports");
}

// 完了レポート: .maid-agent/master/reports/ (アーカイブ先)
export function getArchiveReportsPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "master", "reports");
}
