/**
 * YAML ファイル操作ヘルパー
 */

import * as fs from "fs/promises";
import * as yaml from "yaml";
import type { TaskYaml } from "../types/index.js";

// === YAML stringify 設定 ===

/**
 * stringifyYaml のオプション
 */
export interface YamlStringifyOptions {
  lineWidth?: number;
}

/**
 * オブジェクトをYAML文字列に変換（統一設定）
 *
 * - 複数行文字列はリテラルブロック形式（|）で出力
 * - 改行文字が \\n にエスケープされる問題を解消
 *
 * @see docs/plans/task-219-1-yaml-newline-fix.md
 */
export function stringifyYaml<T>(data: T, options?: YamlStringifyOptions): string {
  return yaml.stringify(data, {
    lineWidth: options?.lineWidth ?? 120,
    blockQuote: "literal",  // 複数行文字列はリテラルブロック形式
  });
}

// === ファイル読み書き ===

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
 *
 * 内部で stringifyYaml() を使用（統一設定）
 */
export async function writeYamlFile<T>(
  filePath: string,
  data: T
): Promise<void> {
  const content = stringifyYaml(data);
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

/**
 * 日本時間のタイムスタンプを YYYY/MM/DD HH:mm:ss 形式で取得
 */
export function getJstTimestamp(): string {
  return formatDateJst(new Date());
}

/**
 * 日付を日本時間で YYYY/MM/DD HH:mm:ss 形式にフォーマット
 */
export function formatDateJst(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * 日時を相対時間表示に変換（日本語）
 * 例: "3分前", "2時間前", "1日前", "3週間前"
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const now = Date.now();
  const target = new Date(dateString).getTime();
  const diffMs = now - target;

  if (diffMs < 0) return "たった今";

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  if (diffMs < MINUTE) return "たった今";
  if (diffMs < HOUR) return `${Math.floor(diffMs / MINUTE)}分前`;
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}時間前`;
  if (diffMs < WEEK) return `${Math.floor(diffMs / DAY)}日前`;
  return `${Math.floor(diffMs / WEEK)}週間前`;
}

/**
 * 日付を日本時間で MM/DD HH:mm 形式にフォーマット（短縮版）
 */
export function formatDateJstShort(date: Date): string {
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * descriptionを最大文字数に切り詰め、ファイル名に使えない文字を除去
 */
export function sanitizeDescription(
  description: string | null,
  maxLength = 15
): string {
  if (!description) return "untitled";

  // 1行目のみ取得
  const firstLine = description.split("\n")[0].trim();

  // ファイル名に使えない文字を除去（Windows/Linux両対応）
  const withoutInvalid = firstLine.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");

  // 半角スペースをアンダースコアに置換（連続スペースは1つに）
  const sanitized = withoutInvalid.replace(/ +/g, "_");

  // 最大文字数に切り詰め
  return sanitized.slice(0, maxLength) || "untitled";
}

/**
 * ファイルをリネーム
 */
export async function renameFile(
  oldPath: string,
  newPath: string
): Promise<boolean> {
  try {
    await fs.rename(oldPath, newPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ファイルをコピー
 */
export async function copyFile(
  srcPath: string,
  destPath: string
): Promise<boolean> {
  try {
    await fs.copyFile(srcPath, destPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ファイルに書き込み（新規作成または上書き）
 */
export async function writeTextFile(
  filePath: string,
  content: string
): Promise<boolean> {
  try {
    await fs.writeFile(filePath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}
