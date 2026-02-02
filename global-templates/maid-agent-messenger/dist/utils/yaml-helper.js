/**
 * YAML ファイル操作ヘルパー
 */
import * as fs from "fs/promises";
import * as yaml from "yaml";
/**
 * YAMLファイルを読み込んでパース
 */
export async function readYamlFile(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    return yaml.parse(content);
}
/**
 * オブジェクトをYAMLファイルに書き込み
 */
export async function writeYamlFile(filePath, data) {
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
export async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * descriptionの1行目を取得（トークン削減用）
 */
export function getFirstLine(text) {
    if (!text)
        return null;
    const firstLine = text.split("\n")[0].trim();
    return firstLine || null;
}
/**
 * ISO 8601形式のタイムスタンプを取得
 */
export function getTimestamp() {
    return new Date().toISOString();
}
/**
 * descriptionを最大文字数に切り詰め、ファイル名に使えない文字を除去
 */
export function sanitizeDescription(description, maxLength = 15) {
    if (!description)
        return "untitled";
    // 1行目のみ取得
    const firstLine = description.split("\n")[0].trim();
    // ファイル名に使えない文字を除去（Windows/Linux両対応）
    const sanitized = firstLine.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
    // 最大文字数に切り詰め
    return sanitized.slice(0, maxLength) || "untitled";
}
/**
 * ファイルをリネーム
 */
export async function renameFile(oldPath, newPath) {
    try {
        await fs.rename(oldPath, newPath);
        return true;
    }
    catch {
        return false;
    }
}
