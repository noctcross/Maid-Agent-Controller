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
 * 相対パスを絶対パスに変換
 * WSLパスはWSLパスのまま、Windowsパスはそのまま返す
 * （WSL→Windows変換はしない: VSCode拡張がWSL上で動作するため、
 *   Windowsパスに変換するとisPathWithinRootでブロックされる）
 */
export declare function resolveToAbsolutePath(relativePath: string, projectPath: string): string;
/** @deprecated resolveToAbsolutePath を使用してください */
export declare const resolveToWindowsPath: typeof resolveToAbsolutePath;
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
