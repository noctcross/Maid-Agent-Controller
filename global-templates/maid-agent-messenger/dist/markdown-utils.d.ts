/**
 * マークダウン→HTML変換ユーティリティ
 *
 * central-server.ts から抽出。テスト可能にするため独立モジュール化。
 */
export declare function escapeHtml(str: string): string;
/**
 * 簡易マークダウン→HTML変換
 */
export declare function convertMarkdownToHtml(markdown: string): string;
/**
 * パスリンク化で検出するプレフィクスのデフォルト値
 * プロジェクト固有のプレフィクス（例: "VSCode拡張"）は
 * linkifyProjectPaths() の第3引数で追加可能
 */
export declare const DEFAULT_PATH_PREFIXES: string[];
/**
 * 相対パスをWindows絶対パスに変換（WSL環境対応）
 * 既存のreportPathsリンク生成ロジック（dashboard-html.ts 142-158行目）を関数化
 */
export declare function resolveToWindowsPath(relativePath: string, projectPath: string): string;
/**
 * HTML内のプロジェクト相対パスをクリック可能なリンクに変換
 *
 * 処理手順:
 * 1. <pre>, <code>, <a> タグ内のテキストをプレースホルダーに置換（保護）
 * 2. 残りのテキスト部分で正規表現によるパス検出
 * 3. マッチしたパスを <a> タグに変換
 * 4. プレースホルダーを復元
 *
 * @param html - convertMarkdownToHtml() で変換済みのHTML文字列
 * @param projectPath - プロジェクトルートの絶対パス（WSLパスまたはWindowsパス）
 * @param pathPrefixes - 検出するパスプレフィクス（省略時はDEFAULT_PATH_PREFIXES）
 * @returns リンク化されたHTML文字列
 */
export declare function linkifyProjectPaths(html: string, projectPath: string, pathPrefixes?: string[]): string;
