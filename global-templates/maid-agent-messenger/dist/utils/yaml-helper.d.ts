/**
 * YAML ファイル操作ヘルパー
 */
import type { TaskYaml } from "../types/index.js";
/**
 * YAMLファイルを読み込んでパース
 */
export declare function readYamlFile<T = TaskYaml>(filePath: string): Promise<T>;
/**
 * オブジェクトをYAMLファイルに書き込み
 */
export declare function writeYamlFile<T>(filePath: string, data: T): Promise<void>;
/**
 * ファイルが存在するか確認
 */
export declare function fileExists(filePath: string): Promise<boolean>;
/**
 * descriptionの1行目を取得（トークン削減用）
 */
export declare function getFirstLine(text: string | null): string | null;
/**
 * ISO 8601形式のタイムスタンプを取得
 */
export declare function getTimestamp(): string;
/**
 * 日本時間のタイムスタンプを YYYY/MM/DD HH:mm:ss 形式で取得
 */
export declare function getJstTimestamp(): string;
/**
 * 日付を日本時間で YYYY/MM/DD HH:mm:ss 形式にフォーマット
 */
export declare function formatDateJst(date: Date): string;
/**
 * 日付を日本時間で MM/DD HH:mm 形式にフォーマット（短縮版）
 */
export declare function formatDateJstShort(date: Date): string;
/**
 * descriptionを最大文字数に切り詰め、ファイル名に使えない文字を除去
 */
export declare function sanitizeDescription(description: string | null, maxLength?: number): string;
/**
 * ファイルをリネーム
 */
export declare function renameFile(oldPath: string, newPath: string): Promise<boolean>;
/**
 * ファイルをコピー
 */
export declare function copyFile(srcPath: string, destPath: string): Promise<boolean>;
/**
 * ファイルに書き込み（新規作成または上書き）
 */
export declare function writeTextFile(filePath: string, content: string): Promise<boolean>;
