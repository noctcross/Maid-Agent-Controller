/**
 * プロジェクトパスヘルパー
 * リクエストヘッダーからプロジェクトパスを取得する共通ユーティリティ
 */
import { existsSync } from "fs";
import { join } from "path";
/**
 * プロジェクトパスが有効か検証する
 * .maid-agent/ ディレクトリの存在を確認
 * @returns エラーメッセージ。有効な場合は null
 */
export function validateProjectPath(projectPath) {
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
            `The project may have been moved. Please update configuration or re-run Init command`;
    }
    return null;
}
/**
 * リクエストヘッダーからプロジェクトパスを取得する共通ヘルパー
 * X-Maid-Project-Path ヘッダーまたは project クエリパラメータから取得
 */
export function getProjectPathFromRequest(req) {
    // クエリパラメータを優先（ブラウザからのアクセス対応）
    if (req.query.project) {
        const projectPath = decodeURIComponent(req.query.project);
        const error = validateProjectPath(projectPath);
        if (error) {
            throw new Error(error);
        }
        return projectPath;
    }
    // ヘッダーからプロジェクトパスを取得
    const projectPath = req.headers["x-maid-project-path"];
    const error = validateProjectPath(projectPath);
    if (error) {
        throw new Error(error);
    }
    return projectPath;
}
