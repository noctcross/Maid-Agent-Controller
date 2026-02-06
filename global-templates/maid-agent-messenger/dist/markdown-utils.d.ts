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
