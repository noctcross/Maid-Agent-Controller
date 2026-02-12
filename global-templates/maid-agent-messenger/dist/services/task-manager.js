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
                    task.escalatedAt,
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
            title: params.title,
            description: params.description || "",
            priority: params.priority || "medium",
            status: params.assignees?.length ? "assigned" : "pending",
            substatus: null,
            category: params.category || "task",
            assignees: (params.assignees || []).map((agentId) => ({
                agentId,
                role: null,
                subTaskId: null,
            })),
            targetPath: null,
            createdAt: now,
            updatedAt: now,
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
 * Task を TaskSummary に変換
 */
function toTaskSummary(task) {
    return {
        id: task.id,
        parentId: task.parentId,
        title: task.title,
        status: task.status,
        priority: task.priority,
        category: task.category,
        assignees: task.assignees,
    };
}
/**
 * タスク取得
 */
export async function executeGetTask(projectPath, params) {
    const data = await loadTasksReadOnly(projectPath);
    const fullTask = data.tasks.find((t) => t.id === params.taskId) || null;
    if (!fullTask) {
        return { task: null };
    }
    const task = params.summaryOnly ? toTaskSummary(fullTask) : fullTask;
    let subtasks;
    if (params.includeSubtasks) {
        const fullSubtasks = data.tasks.filter((t) => t.parentId === params.taskId);
        subtasks = params.summaryOnly
            ? fullSubtasks.map(toTaskSummary)
            : fullSubtasks;
    }
    return { task, subtasks };
}
/**
 * タスクIDを数値的に比較する
 * 例: "048" < "048-1" < "048-2" < "048-10" (文字列比較だと "048-10" < "048-2" になる)
 */
export function compareTaskIds(a, b) {
    const partsA = a.split("-").map(Number);
    const partsB = b.split("-").map(Number);
    const maxLen = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < maxLen; i++) {
        const numA = partsA[i] ?? -1;
        const numB = partsB[i] ?? -1;
        if (numA !== numB)
            return numA - numB;
    }
    return 0;
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
    if (params.reviewed !== undefined) {
        tasks = tasks.filter((t) => params.reviewed ? t.reviewed === true : !t.reviewed);
    }
    if (params.starred !== undefined) {
        tasks = tasks.filter((t) => params.starred ? t.starred === true : !t.starred);
    }
    // テキスト検索（id, title, description を部分一致検索）
    if (params.search) {
        const searchLower = params.search.toLowerCase();
        tasks = tasks.filter((t) => {
            const idMatch = t.id?.toLowerCase().includes(searchLower) || false;
            const titleMatch = t.title?.toLowerCase().includes(searchLower) || false;
            const descMatch = t.description?.toLowerCase().includes(searchLower) || false;
            return idMatch || titleMatch || descMatch;
        });
    }
    // ソート
    if (params.sortField) {
        const order = params.sortOrder || "desc";
        if (params.sortField === "id") {
            tasks.sort((a, b) => {
                const cmp = compareTaskIds(a.id, b.id);
                return order === "asc" ? cmp : -cmp;
            });
        }
        else {
            const field = params.sortField;
            tasks.sort((a, b) => {
                const aVal = a[field];
                const bVal = b[field];
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
    }
    const total = tasks.length;
    // ページネーション
    const offset = params.offset || 0;
    const limit = params.limit || 50;
    tasks = tasks.slice(offset, offset + limit);
    return {
        tasks: params.summaryOnly ? tasks.map(toTaskSummary) : tasks,
        total,
        hasMore: offset + tasks.length < total,
    };
}
/**
 * タスク更新
 *
 * unified-task-state-gateway: 唯一の書き込みゲートウェイ。
 * tasks.yaml 更新後、副作用（maid yaml同期・レポートアーカイブ・テンプレート初期化）を実行。
 */
export async function executeUpdateTask(projectPath, params) {
    // Phase 1: tasks.yaml 更新（ロック内）
    const lockResult = await withTasksLock(projectPath, async (data) => {
        const taskIndex = data.tasks.findIndex((t) => t.id === params.taskId);
        if (taskIndex === -1) {
            const result = { success: false, task: null };
            return { data, result: { result, prevStatus: "", prevAssignees: [] } };
        }
        const task = data.tasks[taskIndex];
        const now = getTimestamp();
        // 更新前の状態を保持（副作用判定用）
        const prevStatus = task.status;
        const prevAssignees = [...task.assignees];
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
        if (params.description !== undefined) {
            task.description = params.description;
        }
        if (params.targetPath !== undefined) {
            task.targetPath = params.targetPath;
        }
        if (params.summary !== undefined) {
            task.summary = params.summary;
        }
        if (params.reportPath) {
            // ファイル名で重複チェック（絶対パス/相対パスの違いを吸収）
            const newFileName = path.basename(params.reportPath);
            const isDuplicate = task.reportPaths.some((existing) => {
                const existingFileName = path.basename(existing);
                return existingFileName === newFileName;
            });
            if (!isDuplicate) {
                task.reportPaths.push(params.reportPath);
            }
        }
        if (params.reviewed !== undefined) {
            task.reviewed = params.reviewed;
            task.reviewedAt = params.reviewed ? now : null;
        }
        if (params.starred !== undefined) {
            task.starred = params.starred;
            task.starredAt = params.starred ? now : null;
        }
        if (params.escalation !== undefined) {
            task.escalation = params.escalation;
            task.escalatedAt = params.escalation ? now : null;
        }
        // 最終更新日時を自動設定
        task.updatedAt = now;
        const result = { success: true, task };
        return { data, result: { result, prevStatus, prevAssignees } };
    });
    const { result, prevStatus, prevAssignees } = lockResult;
    // Phase 2: 副作用実行（tasks.yaml ロック外）
    if (result.success && result.task) {
        try {
            const { executeSideEffects } = await import("./task-side-effects.js");
            const sideEffects = await executeSideEffects(projectPath, result.task, params, prevStatus, prevAssignees);
            result.sideEffects = sideEffects;
            // archivePath を tasks.yaml の reportPaths に追加（再ロック）
            if (sideEffects.archivePath) {
                try {
                    await withTasksLock(projectPath, async (data) => {
                        const task = data.tasks.find((t) => t.id === params.taskId);
                        if (task) {
                            const newFileName = path.basename(sideEffects.archivePath);
                            const isDuplicate = task.reportPaths.some((existing) => {
                                const existingFileName = path.basename(existing);
                                return existingFileName === newFileName;
                            });
                            if (!isDuplicate) {
                                task.reportPaths.push(sideEffects.archivePath);
                            }
                        }
                        return { data, result: null };
                    });
                }
                catch {
                    // reportPaths 追加失敗は握りつぶす
                }
            }
        }
        catch {
            // 副作用全体の失敗は握りつぶす
        }
    }
    return result;
}
