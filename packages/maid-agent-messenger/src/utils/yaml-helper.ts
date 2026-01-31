/**
 * YAML ファイル操作ヘルパー
 */

import * as fs from "fs/promises";
import * as yaml from "yaml";
import type { TaskYaml } from "../types/index.js";

/**
 * YAMLファイルを読み込んでパース
 */
export async function readYamlFile<T = TaskYaml>(
  filePath: string
): Promise<T> {
  const content = await fs.readFile(filePath, "utf-8");
  return yaml.parse(content) as T;
}

/**
 * オブジェクトをYAMLファイルに書き込み
 */
export async function writeYamlFile<T>(
  filePath: string,
  data: T
): Promise<void> {
  const content = yaml.stringify(data, {
    lineWidth: 0, // 改行しない
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * ファイルが存在するか確認
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * descriptionの1行目を取得（トークン削減用）
 */
export function getFirstLine(text: string | null): string | null {
  if (!text) return null;
  const firstLine = text.split("\n")[0].trim();
  return firstLine || null;
}

/**
 * ISO 8601形式のタイムスタンプを取得
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}
