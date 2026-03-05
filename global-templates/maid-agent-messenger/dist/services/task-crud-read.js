/**
 * タスク読み取り操作
 *
 * task-crud.ts から分割。Get, List 操作を提供。
 *
 * @module task-crud-read
 */
import { loadTasksReadOnly } from "./task-core.js";
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
    if (params.actionRequired !== undefined) {
        tasks = tasks.filter((t) => params.actionRequired ? t.actionRequired === true : !t.actionRequired);
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
 * 子タスク取得
 *
 * 指定したparentIdを持つ子タスクを取得する。
 * アサイン時・完了時のチェックで使用。
 */
export async function executeGetTaskChildren(projectPath, parentId) {
    const data = await loadTasksReadOnly(projectPath);
    return data.tasks.filter(t => t.parentId === parentId);
}
