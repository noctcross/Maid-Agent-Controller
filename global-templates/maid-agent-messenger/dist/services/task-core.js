/**
 * タスク管理 - コアユーティリティ
 *
 * tasks.yaml の読み書きに必要な共通関数を提供。
 * 循環参照を避けるため、他のtask-*モジュールはこのファイルからインポートする。
 */
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { parse } from "yaml";
import { withFileLock } from "../utils/file-lock.js";
import { fileExists, stringifyYaml } from "../utils/yaml-helper.js";
// === ファイルパス ===
const getTasksFilePath = (projectPath) => {
    return path.join(projectPath, ".maid-agent", "system", "data", "tasks.yaml");
};
// === ファイルロック付き操作 ===
/**
 * YAMLコンテンツをパースしてバリデーション
 */
function parseTasksData(content) {
    try {
        const data = parse(content);
        // バリデーション
        if (!data ||
            typeof data.lastTaskNumber !== "number" ||
            !Array.isArray(data.tasks)) {
            throw new Error("Invalid tasks.yaml format");
        }
        // updatedAt マイグレーション（既存データの後方互換）
        for (const task of data.tasks) {
            if (!task.updatedAt) {
                const timestamps = [
                    task.completedAt,
                    task.starredAt,
                    task.reviewedAt,
                    task.actionRequiredAt,
                    task.startedAt,
                    task.assignedAt,
                    task.createdAt,
                ].filter((t) => t != null);
                task.updatedAt = timestamps.length > 0
                    ? timestamps.sort().pop()
                    : task.createdAt;
            }
        }
        return data;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to parse tasks.yaml: ${message}`);
    }
}
/**
 * 初期データを作成
 */
function createInitialData() {
    return { lastTaskNumber: 0, tasks: [] };
}
/**
 * ファイルロックを取得してタスクデータを操作する
 * 読み取り→加工→書き込みを一貫したロックで保護
 */
export async function withTasksLock(projectPath, operation) {
    const filePath = getTasksFilePath(projectPath);
    const dirPath = path.dirname(filePath);
    // ディレクトリ作成
    if (!fsSync.existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true });
    }
    // ファイルが存在しない場合は初期ファイル作成
    if (!(await fileExists(filePath))) {
        const initialContent = stringifyYaml(createInitialData());
        await fs.writeFile(filePath, initialContent, "utf-8");
    }
    // ファイルロックを取得して操作
    return withFileLock(filePath, async () => {
        // 読み取り
        const content = await fs.readFile(filePath, "utf-8");
        const data = parseTasksData(content);
        // 操作実行
        const { data: newData, result } = await operation(data);
        // 書き込み（統一設定: stringifyYaml 使用）
        const yamlContent = stringifyYaml(newData);
        await fs.writeFile(filePath, yamlContent, "utf-8");
        return result;
    }, { retries: 5, stale: 10000 });
}
/**
 * 読み取り専用（ロックなし）- 一覧表示など更新を伴わない場合
 */
export async function loadTasksReadOnly(projectPath) {
    const filePath = getTasksFilePath(projectPath);
    if (!(await fileExists(filePath))) {
        return createInitialData();
    }
    const content = await fs.readFile(filePath, "utf-8");
    return parseTasksData(content);
}
