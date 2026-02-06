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
export function getProjectPathFromRequest(req) {
    const projectPath = req.headers["x-maid-project-path"];
    if (!projectPath) {
        throw new Error("X-Maid-Project-Path header is required");
    }
    return projectPath;
}
