/**
 * タスク管理サービス
 *
 * MCPタスク管理システムのコアロジック
 * tasks.yaml を単一ファイルで管理
 */
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { parse, stringify } from "yaml";
import { withFileLock } from "../utils/file-lock.js";
import { getTimestamp, fileExists } from "../utils/yaml-helper.js";
// === ファイルパス ===
const getTasksFilePath = (projectPath) => {
    return path.join(projectPath, ".maid-agent", "tasks.yaml");
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
async function withTasksLock(projectPath, operation) {
    const filePath = getTasksFilePath(projectPath);
    const dirPath = path.dirname(filePath);
    // ディレクトリ作成
    if (!fsSync.existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true });
    }
    // ファイルが存在しない場合は初期ファイル作成
    if (!(await fileExists(filePath))) {
        const initialContent = stringify(createInitialData(), { lineWidth: 120 });
        await fs.writeFile(filePath, initialContent, "utf-8");
    }
    // ファイルロックを取得して操作
    return withFileLock(filePath, async () => {
        // 読み取り
        const content = await fs.readFile(filePath, "utf-8");
        const data = parseTasksData(content);
        // 操作実行
        const { data: newData, result } = await operation(data);
        // 書き込み
        const yamlContent = stringify(newData, { lineWidth: 120 });
        await fs.writeFile(filePath, yamlContent, "utf-8");
        return result;
    }, { retries: 5, stale: 10000 });
}
/**
 * 読み取り専用（ロックなし）- 一覧表示など更新を伴わない場合
 */
async function loadTasksReadOnly(projectPath) {
    const filePath = getTasksFilePath(projectPath);
    if (!(await fileExists(filePath))) {
        return createInitialData();
    }
    const content = await fs.readFile(filePath, "utf-8");
    return parseTasksData(content);
}
/**
 * タスク作成
 */
export async function executeCreateTask(projectPath, params) {
    return withTasksLock(projectPath, async (data) => {
        // 新しいタスクID生成
        let taskId;
        if (params.parentId) {
            // サブタスクの場合: 親ID-連番
            const siblings = data.tasks.filter((t) => t.parentId === params.parentId);
            const nextSeq = siblings.length + 1;
            taskId = `${params.parentId}-${nextSeq}`;
        }
        else {
            // メインタスクの場合: 連番（3桁ゼロ埋め）
            data.lastTaskNumber += 1;
            taskId = String(data.lastTaskNumber).padStart(3, "0");
        }
        const now = getTimestamp();
        const newTask = {
            id: taskId,
            parentId: params.parentId || null,
            description: params.description,
            priority: params.priority || "medium",
            status: params.assignees?.length ? "assigned" : "pending",
            substatus: null,
            category: params.category || "task",
            assignees: (params.assignees || []).map((agentId) => ({
                agentId,
                role: null,
                subTaskId: null,
            })),
            createdAt: now,
            assignedAt: params.assignees?.length ? now : null,
            startedAt: null,
            completedAt: null,
            reportPaths: [],
            summary: null,
        };
        data.tasks.push(newTask);
        return { data, result: { taskId, task: newTask } };
    });
}
/**
 * タスク取得
 */
export async function executeGetTask(projectPath, params) {
    const data = await loadTasksReadOnly(projectPath);
    const task = data.tasks.find((t) => t.id === params.taskId) || null;
    let subtasks;
    if (task && params.includeSubtasks) {
        subtasks = data.tasks.filter((t) => t.parentId === params.taskId);
    }
    return { task, subtasks };
}
/**
 * タスク一覧取得
 */
export async function executeListTasks(projectPath, params = {}) {
    const data = await loadTasksReadOnly(projectPath);
    let tasks = [...data.tasks];
    // フィルタリング
    if (params.status?.length) {
        tasks = tasks.filter((t) => params.status.includes(t.status));
    }
    if (params.assignee) {
        tasks = tasks.filter((t) => t.assignees.some((a) => a.agentId === params.assignee));
    }
    if (params.parentId !== undefined) {
        tasks = tasks.filter((t) => t.parentId === params.parentId);
    }
    if (params.category?.length) {
        tasks = tasks.filter((t) => params.category.includes(t.category || "task"));
    }
    // ソート
    if (params.sortField) {
        const order = params.sortOrder || "desc";
        tasks.sort((a, b) => {
            const aVal = a[params.sortField];
            const bVal = b[params.sortField];
            if (aVal === null && bVal === null)
                return 0;
            if (aVal === null)
                return order === "asc" ? -1 : 1;
            if (bVal === null)
                return order === "asc" ? 1 : -1;
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return order === "asc" ? cmp : -cmp;
        });
    }
    const total = tasks.length;
    // ページネーション
    const offset = params.offset || 0;
    const limit = params.limit || 50;
    tasks = tasks.slice(offset, offset + limit);
    return {
        tasks,
        total,
        hasMore: offset + tasks.length < total,
    };
}
/**
 * タスク更新
 */
export async function executeUpdateTask(projectPath, params) {
    return withTasksLock(projectPath, async (data) => {
        const taskIndex = data.tasks.findIndex((t) => t.id === params.taskId);
        if (taskIndex === -1) {
            const result = { success: false, task: null };
            return { data, result };
        }
        const task = data.tasks[taskIndex];
        const now = getTimestamp();
        // 更新適用
        if (params.status !== undefined) {
            task.status = params.status;
            if (params.status === "working" && !task.startedAt) {
                task.startedAt = now;
            }
            if (params.status === "completed") {
                task.completedAt = now;
            }
        }
        if (params.substatus !== undefined) {
            task.substatus = params.substatus;
        }
        if (params.category !== undefined) {
            task.category = params.category;
        }
        if (params.assignees !== undefined) {
            task.assignees = params.assignees;
            if (!task.assignedAt) {
                task.assignedAt = now;
            }
        }
        if (params.summary !== undefined) {
            task.summary = params.summary;
        }
        if (params.reportPath) {
            task.reportPaths.push(params.reportPath);
        }
        const result = { success: true, task };
        return { data, result };
    });
}
