/**
 * セッション管理・リクエストヘルパー
 * SessionInfo, sessions Map, getProjectPathFromRequest
 */

import type { Request } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { existsSync } from "fs";
import { join } from "path";

/**
 * MCPセッション情報
 */
export interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  projectPath: string;
  createdAt: Date;
  lastActivity: Date;
  // Phase 3
  missedPings: number;
  pingTimer?: ReturnType<typeof setInterval>;
}

/**
 * セッションID -> SessionInfo のマップ
 */
export const sessions = new Map<string, SessionInfo>();

/**
 * リクエストヘッダーからプロジェクトパスを取得する共通ヘルパー
 */
/**
 * アイドル状態のセッションをクリーンアップ
 * @returns 削除されたセッション数
 */
export function cleanupIdleSessions(idleTimeoutMs: number): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastActivity.getTime() > idleTimeoutMs) {
      console.log(`[SessionGC] Cleaning up idle session: ${id} (idle for ${Math.round((now - session.lastActivity.getTime()) / 1000)}s)`);
      // pingTimer が動いている場合は先に停止（競合防止）
      if (session.pingTimer) {
        clearInterval(session.pingTimer);
      }
      try {
        session.transport.close();
      } catch (e) {
        console.log(`[SessionGC] Error closing session ${id}: ${e}`);
      }
      sessions.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * プロジェクトパスが有効か検証する
 * .maid-agent/ ディレクトリの存在を確認
 * @returns エラーメッセージ。有効な場合は null
 */
export function validateProjectPath(projectPath: string): string | null {
  if (!projectPath) {
    return "X-Maid-Project-Path header is required";
  }

  // 環境変数が展開されていない場合のチェック
  if (projectPath.includes("${") || projectPath.includes("$CLAUDE")) {
    return `X-Maid-Project-Path contains unexpanded variable: "${projectPath}". ` +
      `Claude Code v1.0.48+ is required for environment variable expansion in .mcp.json`;
  }

  const maidAgentDir = join(projectPath, ".maid-agent");
  if (!existsSync(maidAgentDir)) {
    return `Project path "${projectPath}" does not contain .maid-agent/ directory. ` +
      `The project may have been moved. Please update .mcp.json or re-run Init command`;
  }

  return null;
}

export function getProjectPathFromRequest(req: Request): string {
  const projectPath = req.headers["x-maid-project-path"] as string;
  const error = validateProjectPath(projectPath);
  if (error) {
    throw new Error(error);
  }
  return projectPath;
}
