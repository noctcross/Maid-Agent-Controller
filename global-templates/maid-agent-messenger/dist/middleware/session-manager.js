/**
 * セッション管理・リクエストヘルパー
 * SessionInfo, sessions Map, getProjectPathFromRequest
 */
/**
 * セッションID -> SessionInfo のマップ
 */
export const sessions = new Map();
/**
 * リクエストヘッダーからプロジェクトパスを取得する共通ヘルパー
 */
/**
 * アイドル状態のセッションをクリーンアップ
 * @returns 削除されたセッション数
 */
export function cleanupIdleSessions(idleTimeoutMs) {
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
            }
            catch (e) {
                console.log(`[SessionGC] Error closing session ${id}: ${e}`);
            }
            sessions.delete(id);
            cleaned++;
        }
    }
    return cleaned;
}
export function getProjectPathFromRequest(req) {
    const projectPath = req.headers["x-maid-project-path"];
    if (!projectPath) {
        throw new Error("X-Maid-Project-Path header is required");
    }
    return projectPath;
}
