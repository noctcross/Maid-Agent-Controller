/**
 * Maid Agent MCP Server (STDIO Mode)
 *
 * Maid Agent System のタスク管理用 MCP サーバー
 * Claude Code から STDIO で起動される
 *
 * ハイブリッド方式:
 * - 中央サーバーが起動している場合: 中央サーバーを使用（このファイルは使われない）
 * - 中央サーバーが停止している場合: このファイルがSTDIOで起動される（フォールバック）
 */
export {};
