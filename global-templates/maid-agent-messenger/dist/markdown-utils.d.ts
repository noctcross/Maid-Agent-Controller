/**
 * マークダウン→HTML変換ユーティリティ
 *
 * central-server.ts から抽出。テスト可能にするため独立モジュール化。
 */
/**
 * HTML特殊文字をエスケープ（XSS防止）
 *
 * 注意: この実装は src/utils/html-escape.ts の escapeHtml() と同一である必要があります。
 * 変更時は両方を更新してください。
 * @see src/utils/html-escape.ts (IDE版)
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
 * パス終端判定に使用するファイル拡張子
 * これらの拡張子で終わる位置をパスの終端とみなす
 */
export declare const FILE_EXTENSIONS: readonly ["md", "txt", "html", "htm", "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "yaml", "yml", "toml", "ini", "conf", "css", "scss", "sass", "less", "py", "rb", "php", "go", "rs", "java", "kt", "scala", "c", "cpp", "h", "hpp", "cs", "swift", "m", "vue", "svelte", "astro", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd", "xml", "svg", "log"];
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
