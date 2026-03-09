/**
 * プロジェクトパスヘルパー
 * リクエストヘッダーからプロジェクトパスを取得する共通ユーティリティ
 */
import type { Request } from "express";
/**
 * プロジェクトパスが有効か検証する
 * .maid-agent/ ディレクトリの存在を確認
 * @returns エラーメッセージ。有効な場合は null
 */
export declare function validateProjectPath(projectPath: string): string | null;
/**
 * リクエストヘッダーからプロジェクトパスを取得する共通ヘルパー
 * X-Maid-Project-Path ヘッダーまたは project クエリパラメータから取得
 */
export declare function getProjectPathFromRequest(req: Request): string;
//# sourceMappingURL=project-path.d.ts.map