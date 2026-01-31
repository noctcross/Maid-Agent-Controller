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
