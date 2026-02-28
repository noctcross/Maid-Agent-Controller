/**
 * タスク管理サービス
 *
 * MCPタスク管理システムのコアロジック
 * tasks.yaml を単一ファイルで管理
 */
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { parse } from "yaml";
import { withFileLock } from "../utils/file-lock.js";
import { getTimestamp, fileExists, stringifyYaml } from "../utils/yaml-helper.js";
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
async function withTasksLock(projectPath, operation) {
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
 *
 * Note: assigneesはcreate_taskでは指定不可。assign_taskで別途アサインする。
 * 理由: 作業中メイドへのアサインを防ぐガード条件がassign_taskにあるため。
 */
export async function executeCreateTask(projectPath, params) {
    return withTasksLock(projectPath, async (data) => {
        // 新しいタスクID生成
        let taskId;
        let reopenedParent; // 直接の親タスク（後方互換）
        const reopenedAncestors = []; // 全ての再オープンされた祖先
        if (params.parentId) {
            // サブタスクの場合: 親ID-連番
            const siblings = data.tasks.filter((t) => t.parentId === params.parentId);
            const nextSeq = siblings.length + 1;
            taskId = `${params.parentId}-${nextSeq}`;
            // 祖先タスクの自動再オープン
            // 子タスクが追加されたら、全ての祖先を open/working に変更
            let currentParentId = params.parentId;
            while (currentParentId) {
                const ancestorTask = data.tasks.find((t) => t.id === currentParentId);
                if (!ancestorTask)
                    break;
                let ancestorUpdated = false;
                // 祖先が closed の場合 → open/working に変更
                if (ancestorTask.mainStatus === "closed") {
                    ancestorTask.mainStatus = "open";
                    ancestorTask.v2Substatus = "working";
                    ancestorTask.status = "working"; // 旧ステータスも同期
                    ancestorTask.updatedAt = getTimestamp();
                    ancestorUpdated = true;
                }
                // 祖先が archived の場合 → archived:false に変更
                if (ancestorTask.archived === true) {
                    ancestorTask.archived = false;
                    ancestorTask.updatedAt = getTimestamp();
                    ancestorUpdated = true;
                }
                // 祖先タスクが更新された場合、リストに追加
                if (ancestorUpdated) {
                    reopenedAncestors.push({ ...ancestorTask }); // コピーを作成
                    // 最初の祖先（直接の親）を後方互換のために保持
                    if (!reopenedParent) {
                        reopenedParent = { ...ancestorTask };
                    }
                }
                // 次の祖先へ
                currentParentId = ancestorTask.parentId;
            }
        }
        else {
            // メインタスクの場合: 連番（3桁ゼロ埋め）
            data.lastTaskNumber += 1;
            taskId = String(data.lastTaskNumber).padStart(3, "0");
        }
        const now = getTimestamp();
        // V2.1: タスク種別の決定（デフォルト: step）
        const taskType = params.type || "step";
        // V2.1: 初期ステータスの設定
        // - blockedBy があれば waiting
        // - それ以外は pending（未着手）
        const hasBlockers = params.blockedBy && params.blockedBy.length > 0;
        const initialV2Substatus = hasBlockers ? "waiting" : "pending";
        const newTask = {
            id: taskId,
            parentId: params.parentId || null,
            title: params.title,
            description: params.description || "",
            priority: params.priority || "medium",
            status: "pending",
            substatus: null,
            category: params.category || "task",
            assignees: [],
            targetPath: null,
            createdAt: now,
            updatedAt: now,
            assignedAt: null,
            startedAt: null,
            completedAt: null,
            reportPaths: [],
            summary: null,
            // === V2.1 拡張フィールド ===
            type: taskType,
            mainStatus: "open",
            v2Substatus: initialV2Substatus,
            size: taskType === "task" ? (params.size || "standard") : undefined,
            tentative: taskType === "task" ? (params.tentative || false) : undefined,
            blockedBy: params.blockedBy || [],
            artifacts: [],
            reviewStatus: undefined,
        };
        data.tasks.push(newTask);
        return { data, result: { taskId, task: newTask, reopenedParent, reopenedAncestors: reopenedAncestors.length > 0 ? reopenedAncestors : undefined } };
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
// === Phase 3: update_task ===
// 型定義は ../types/task-manager-types.ts から再エクスポート
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
            // V2.1: 旧ステータス→V2.1ステータス自動同期
            // params.v2Substatus が明示的に指定されている場合はそちらを優先
            if (params.v2Substatus === undefined) {
                if (params.status === "working") {
                    task.mainStatus = "open";
                    task.v2Substatus = "working";
                }
                else if (params.status === "completed") {
                    task.mainStatus = "closed";
                    task.v2Substatus = "completed";
                }
                else if (params.status === "blocked") {
                    task.mainStatus = "open";
                    task.v2Substatus = "checkpoint";
                }
                else if (params.status === "assigned") {
                    task.mainStatus = "open";
                    task.v2Substatus = "assigned";
                }
                else if (params.status === "pending") {
                    task.mainStatus = "open";
                    task.v2Substatus = "pending";
                }
                else if (params.status === "cancelled") {
                    task.mainStatus = "cancelled";
                    task.v2Substatus = "archived";
                }
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
        if (params.title !== undefined) {
            task.title = params.title;
        }
        if (params.description !== undefined) {
            task.description = params.description;
        }
        if (params.priority !== undefined) {
            task.priority = params.priority;
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
        if (params.actionRequired !== undefined) {
            task.actionRequired = params.actionRequired;
            task.actionRequiredAt = params.actionRequired ? now : null;
        }
        // === V2.1 フィールドの更新 ===
        if (params.mainStatus !== undefined) {
            task.mainStatus = params.mainStatus;
            // closed に変更時は completedAt を設定
            if (params.mainStatus === "closed" && !task.completedAt) {
                task.completedAt = now;
            }
        }
        // V2.1: ステータス遷移バリデーション
        if (params.v2Substatus !== undefined) {
            const currentSubstatus = (task.v2Substatus || task.substatus || "pending");
            const operatorRole = params.agentId ? getAgentRole(params.agentId) : "maid";
            const validation = validateStatusTransition(currentSubstatus, params.v2Substatus, operatorRole);
            if (!validation.valid) {
                // 不正遷移: WARNログを出力
                console.warn(`[WARN] Invalid status transition attempted`, {
                    taskId: task.id,
                    currentStatus: currentSubstatus,
                    attemptedStatus: params.v2Substatus,
                    operator: params.agentId || "unknown",
                    operatorRole,
                    timestamp: now,
                    error: validation.error,
                });
                // 不正遷移は無視し、ステータスは変更しない
                // ただし、他のフィールド更新は継続
            }
            else {
                // 正常遷移: 既存の更新処理を実行
                task.v2Substatus = params.v2Substatus;
                // V2.1 substatus が設定されたら、後方互換の status/substatus も更新
                task.substatus = params.v2Substatus;
                // V2.1 → 旧ステータス変換
                if (params.v2Substatus === "completed" || params.v2Substatus === "archived") {
                    task.status = "completed";
                    task.mainStatus = "closed";
                    if (!task.completedAt) {
                        task.completedAt = now;
                    }
                }
                else if (params.v2Substatus === "working") {
                    task.status = "working";
                    task.mainStatus = "open";
                    if (!task.startedAt) {
                        task.startedAt = now;
                    }
                }
                else if (params.v2Substatus === "assigned") {
                    task.status = "assigned";
                    task.mainStatus = "open";
                }
                else if (params.v2Substatus === "checkpoint" || params.v2Substatus === "waiting") {
                    task.status = "blocked";
                    task.mainStatus = "open";
                }
                else if (params.v2Substatus === "pending") {
                    task.status = "pending";
                    task.mainStatus = "open";
                }
            }
        }
        if (params.type !== undefined) {
            task.type = params.type;
        }
        if (params.size !== undefined && task.type === "task") {
            task.size = params.size;
        }
        if (params.tentative !== undefined && task.type === "task") {
            task.tentative = params.tentative;
        }
        if (params.blockedBy !== undefined) {
            task.blockedBy = params.blockedBy;
        }
        if (params.artifacts !== undefined) {
            task.artifacts = params.artifacts;
        }
        if (params.artifactAdd !== undefined) {
            if (!task.artifacts) {
                task.artifacts = [];
            }
            task.artifacts.push(params.artifactAdd);
        }
        if (params.reviewStatus !== undefined) {
            task.reviewStatus = params.reviewStatus;
        }
        if (params.archived !== undefined) {
            task.archived = params.archived;
            task.archivedAt = params.archived ? now : null;
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
        // V2.1: タスク完了時に依存タスクを自動解消
        // status=completed または v2Substatus=completed の場合
        const isCompleted = params.status === "completed" ||
            params.v2Substatus === "completed";
        if (isCompleted) {
            try {
                const dependencyResult = await resolveBlockedTasks(projectPath, params.taskId);
                // 解消されたタスクがある場合、sideEffects に追加
                if (dependencyResult.unblockedTasks.length > 0) {
                    result.sideEffects = result.sideEffects || {};
                    result.sideEffects.dependencyResolved = true;
                    result.sideEffects.unblockedTasks = dependencyResult.unblockedTasks;
                }
            }
            catch {
                // 依存解消失敗は握りつぶす（メイン処理に影響させない）
            }
        }
        // V2.1: 子タスク完了時に親タスクを再帰的に自動クローズ
        // Step完了→親Work、Work完了→親Task、さらに祖先まで連鎖
        if (isCompleted && result.task && result.task.parentId) {
            try {
                const autoCloseResult = await checkAndAutoCloseParent(projectPath, params.taskId);
                if (autoCloseResult.autoClosedIds.length > 0) {
                    result.sideEffects = result.sideEffects || {};
                    result.sideEffects.autoClosedParents = autoCloseResult.autoClosedIds;
                    // 後方互換: 最初にクローズされた親を goalAutoClosed に設定
                    result.sideEffects.goalAutoClosed = autoCloseResult.autoClosedIds[0];
                }
            }
            catch {
                // 親自動クローズ失敗は握りつぶす
            }
        }
    }
    return result;
}
/**
 * タスク完了時に依存しているタスクを自動的に waiting → assigned に更新
 *
 * V2.1 設計書より:
 * 1. タスクA完了: maidctl my-status completed
 * 2. システムが blockedBy を検索
 * 3. タスクBが blockedBy: ["A"] を持つ場合
 *    → タスクBの担当者に自動通知
 *    → タスクBの substatus を waiting → assigned に更新
 */
export async function resolveBlockedTasks(projectPath, completedTaskId) {
    const unblockedTasks = [];
    await withTasksLock(projectPath, async (data) => {
        const now = getTimestamp();
        // blockedBy に completedTaskId を持つタスクを検索
        for (const task of data.tasks) {
            if (!task.blockedBy || !task.blockedBy.includes(completedTaskId)) {
                continue;
            }
            const previousSubstatus = task.v2Substatus || task.substatus || "";
            // blockedBy から completedTaskId を削除
            task.blockedBy = task.blockedBy.filter((id) => id !== completedTaskId);
            // blockedBy が空になったら waiting → assigned に変更
            if (task.blockedBy.length === 0 && task.v2Substatus === "waiting") {
                task.v2Substatus = "assigned";
                task.substatus = "assigned";
                task.status = "assigned"; // 旧ステータス互換
                task.mainStatus = "open";
                task.updatedAt = now;
                // 通知対象として記録
                unblockedTasks.push({
                    taskId: task.id,
                    assignees: task.assignees.map((a) => a.agentId),
                    previousSubstatus,
                });
            }
            task.updatedAt = now;
        }
        return { data, result: null };
    });
    return { unblockedTasks };
}
/**
 * V2.1: タスク種別の判定（後方互換）
 * type が未設定の場合、parentId の有無で推定
 */
export function inferTaskType(task) {
    if (task.type) {
        return task.type;
    }
    // 後方互換: parentId があればサブタスク（step）、なければ親タスク（task）
    return task.parentId ? "step" : "task";
}
// 役割の階層（数値が大きいほど上位）
const ROLE_HIERARCHY = {
    maid: 1,
    chief: 2,
    butler: 3,
    master: 4,
};
/**
 * V2.1: ステータス遷移バリデーション
 *
 * 不正な遷移を検出し、許可/拒否を判定する。
 * 設計書: docs/Maid-Agent-Controller/設計書/02_メッセンジャーサーバ/ダッシュボード/ステータス遷移設計.md
 *
 * @param currentStatus - 現在のステータス（v2Substatus）
 * @param newStatus - 遷移先のステータス
 * @param operatorRole - 操作者の役割
 * @returns バリデーション結果
 */
export function validateStatusTransition(currentStatus, newStatus, operatorRole) {
    // 空文字列・未定義は "pending" として扱う（後方互換）
    const current = (currentStatus || "pending");
    const roleLevel = ROLE_HIERARCHY[operatorRole] || 1;
    // 同じステータスへの遷移は常に許可（no-op）
    if (current === newStatus) {
        return { valid: true };
    }
    // 許可遷移ルール定義
    // key: "currentStatus:newStatus", value: 最低必要なroleLevel
    const allowedTransitions = {
        // 通常遷移
        "pending:assigned": 2, // chief+
        "assigned:working": 1, // maid+
        "working:waiting": 1, // maid+
        "working:checkpoint": 1, // maid+
        "working:completed": 1, // maid+
        "waiting:working": 1, // maid+
        "waiting:checkpoint": 1, // maid+
        "checkpoint:working": 2, // chief+
        "checkpoint:waiting": 1, // maid+
        "completed:archived": 2, // chief+
        // 条件付き遷移（差し戻し・再オープン）
        "completed:working": 2, // chief（レビュー差し戻し）
        "archived:working": 3, // butler（再オープン）
    };
    const transitionKey = `${current}:${newStatus}`;
    const requiredLevel = allowedTransitions[transitionKey];
    // 許可リストにない遷移は禁止
    if (requiredLevel === undefined) {
        return {
            valid: false,
            error: `${current} → ${newStatus} への遷移は許可されていません`,
        };
    }
    // 役割による権限チェック
    if (roleLevel < requiredLevel) {
        const requiredRole = Object.entries(ROLE_HIERARCHY)
            .find(([, level]) => level === requiredLevel)?.[0] || "unknown";
        return {
            valid: false,
            error: `${current} → ${newStatus} への遷移には ${requiredRole} 以上の権限が必要です`,
        };
    }
    return { valid: true };
}
/**
 * エージェントIDから役割を取得
 */
export function getAgentRole(agentId) {
    if (agentId === "butler")
        return "butler";
    if (agentId === "chief")
        return "chief";
    // メイドIDリスト
    const maidIds = ["emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];
    if (maidIds.includes(agentId))
        return "maid";
    // master は明示的に指定されない限り使用しない
    return "maid"; // デフォルト
}
/**
 * V2.1: ステータス変換（旧 → 新）
 */
export function convertToV2Status(task) {
    // 既にV2.1形式の場合
    if (task.mainStatus && task.v2Substatus) {
        return { mainStatus: task.mainStatus, substatus: task.v2Substatus };
    }
    // 旧ステータスから変換
    switch (task.status) {
        case "pending":
            return { mainStatus: "open", substatus: "pending" };
        case "assigned":
            return { mainStatus: "open", substatus: "assigned" };
        case "working":
            return { mainStatus: "open", substatus: "working" };
        case "completed":
            return { mainStatus: "closed", substatus: "completed" };
        case "blocked":
            // blockedBy の有無で checkpoint/waiting を判断
            if (task.blockedBy && task.blockedBy.length > 0) {
                return { mainStatus: "open", substatus: "waiting" };
            }
            return { mainStatus: "open", substatus: "checkpoint" };
        case "cancelled":
            return { mainStatus: "cancelled", substatus: "archived" };
        default:
            return { mainStatus: "open", substatus: "pending" };
    }
}
/**
 * V2.1: Goal階層連動 - 子Phaseの状態から親Goalの表示ステータスを計算
 *
 * 設計書より:
 * - 全Phase pending → Goal「未着手」⏸️
 * - いずれかPhase assigned → Goal「準備中」📋
 * - いずれかPhase working → Goal「進行中」🔵
 * - いずれかPhase waiting/checkpoint → Goal「ブロック中」⚠️
 * - 全Phase completed → Goal「完了可能」✅
 */
export function computeGoalDisplayStatus(goalSubstatus, phases, goalMainStatus) {
    // Goal自身が closed/completed の場合は「完了」を返す
    if (goalMainStatus === "closed" || goalSubstatus === "completed") {
        return { displayStatus: "完了", displayIcon: "✅" };
    }
    // Phaseがない場合はGoal自身のステータスを使用
    if (phases.length === 0) {
        return mapSubstatusToDisplay(goalSubstatus);
    }
    const substatuses = phases.map((p) => p.v2Substatus);
    // ブロック中（waiting/checkpoint）を最優先
    if (substatuses.some((s) => s === "waiting" || s === "checkpoint")) {
        return { displayStatus: "ブロック中", displayIcon: "⚠️" };
    }
    // 全Phase完了（Goalがまだopenの場合）
    if (phases.every((p) => p.v2Substatus === "completed" || p.mainStatus === "closed")) {
        return { displayStatus: "完了可能", displayIcon: "✅" };
    }
    // いずれかPhase working（active は後方互換）
    if (substatuses.some((s) => s === "working" || s === "active")) {
        return { displayStatus: "進行中", displayIcon: "🔵" };
    }
    // いずれかPhase assigned
    if (substatuses.some((s) => s === "assigned")) {
        return { displayStatus: "準備中", displayIcon: "📋" };
    }
    // 全Phase pending（paused は後方互換）
    if (substatuses.every((s) => s === "pending" || s === "paused")) {
        return { displayStatus: "未着手", displayIcon: "⏸️" };
    }
    // フォールバック
    console.warn(`[computeGoalDisplayStatus] Unexpected phase states: ${substatuses.join(", ")}, defaulting to 進行中`);
    return { displayStatus: "進行中", displayIcon: "🔵" };
}
/**
 * substatusを表示用ステータスにマッピング
 */
function mapSubstatusToDisplay(substatus) {
    switch (substatus) {
        case "pending":
        case "paused": // 後方互換: paused → pending
            return { displayStatus: "未着手", displayIcon: "⏸️" };
        case "assigned":
            return { displayStatus: "準備中", displayIcon: "📋" };
        case "working":
        case "active": // 後方互換: active → working
            return { displayStatus: "進行中", displayIcon: "🔵" };
        case "waiting":
            return { displayStatus: "依存待ち", displayIcon: "⏳" };
        case "checkpoint":
            return { displayStatus: "確認待ち", displayIcon: "🔶" };
        case "completed":
            return { displayStatus: "完了", displayIcon: "✅" };
        case "archived":
            return { displayStatus: "アーカイブ", displayIcon: "📦" };
        default:
            return { displayStatus: "進行中", displayIcon: "🔵" };
    }
}
/**
 * V2.1: Goal の自動クローズ判定
 *
 * 条件:
 * - 全Phaseが completed
 * - レビューPhaseが存在する場合は approved
 * - 除外カテゴリなし (skill_candidate, improvement)
 * - actionRequired フラグ付きタスクは別途管理
 */
export async function checkGoalAutoClose(projectPath, goalId) {
    const data = await loadTasksReadOnly(projectPath);
    const goal = data.tasks.find((t) => t.id === goalId);
    if (!goal) {
        return { canAutoClose: false, reason: "Task not found" };
    }
    if (inferTaskType(goal) !== "task") {
        return { canAutoClose: false, reason: "Not a task" };
    }
    // 除外カテゴリチェック（V2.1: action_required は actionRequired フラグに移行）
    if (["skill_candidate", "improvement"].includes(goal.category)) {
        return { canAutoClose: false, reason: `Excluded category: ${goal.category}` };
    }
    // tentative Task は手動クローズ
    if (goal.tentative) {
        return { canAutoClose: false, reason: "Tentative task requires manual close" };
    }
    // simple Task (Work省略) は手動クローズ
    if (goal.size === "simple") {
        return { canAutoClose: false, reason: "Simple task requires manual close" };
    }
    // 子Workを取得
    const phases = data.tasks.filter((t) => t.parentId === goalId && inferTaskType(t) === "work");
    if (phases.length === 0) {
        return { canAutoClose: false, reason: "No phases found" };
    }
    // 全Phaseが completed かチェック
    const allPhasesCompleted = phases.every((p) => {
        const { substatus } = convertToV2Status(p);
        return substatus === "completed" || substatus === "archived";
    });
    if (!allPhasesCompleted) {
        return { canAutoClose: false, reason: "Not all phases completed" };
    }
    // レビューPhaseの approved チェック（reviewStatus がある場合）
    const reviewPhases = phases.filter((p) => p.reviewStatus !== undefined);
    if (reviewPhases.length > 0) {
        const allReviewsApproved = reviewPhases.every((p) => p.reviewStatus === "approved");
        if (!allReviewsApproved) {
            return { canAutoClose: false, reason: "Not all reviews approved" };
        }
    }
    return { canAutoClose: true };
}
/**
 * 子タスク完了時に親タスクを再帰的に自動クローズ
 *
 * 処理フロー:
 * 1. タスクが completed になったとき
 * 2. 親タスクを取得
 * 3. 親の全子タスクが completed かチェック
 * 4. 全完了なら親も completed に変更
 * 5. 再帰的に祖先までチェック
 *
 * @param projectPath プロジェクトパス
 * @param completedTaskId 完了したタスクのID
 * @returns 自動クローズされた親タスクのID配列
 */
export async function checkAndAutoCloseParent(projectPath, completedTaskId) {
    const autoClosedIds = [];
    // 再帰的に親をチェック
    let currentTaskId = completedTaskId;
    while (true) {
        const data = await loadTasksReadOnly(projectPath);
        const currentTask = data.tasks.find((t) => t.id === currentTaskId);
        if (!currentTask || !currentTask.parentId) {
            // 親がない場合は終了
            break;
        }
        const parentId = currentTask.parentId;
        const parent = data.tasks.find((t) => t.id === parentId);
        if (!parent) {
            break;
        }
        // 親がすでに完了している場合はスキップ
        const { substatus: parentSubstatus } = convertToV2Status(parent);
        if (parentSubstatus === "completed" || parentSubstatus === "archived") {
            // 親がすでに完了していても、さらに上の親をチェック
            currentTaskId = parentId;
            continue;
        }
        // 除外条件チェック
        // 1. stepRequired フラグがある場合は自動クローズしない（将来拡張用）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (parent.stepRequired) {
            break;
        }
        // 2. category が skill_candidate/improvement の場合は自動クローズしない
        if (["skill_candidate", "improvement"].includes(parent.category)) {
            break;
        }
        // 3. tentative Task は手動クローズ
        if (parent.tentative) {
            break;
        }
        // 4. simple Task (Work省略) は手動クローズ
        if (parent.size === "simple") {
            break;
        }
        // 親の全子タスクを取得
        const siblings = data.tasks.filter((t) => t.parentId === parentId);
        if (siblings.length === 0) {
            break;
        }
        // 全子タスクが completed かチェック
        const allSiblingsCompleted = siblings.every((s) => {
            const { substatus } = convertToV2Status(s);
            return substatus === "completed" || substatus === "archived";
        });
        if (!allSiblingsCompleted) {
            // 全子が完了していない場合は終了
            break;
        }
        // レビューが必要な子タスクの approved チェック（reviewStatus がある場合）
        const reviewSiblings = siblings.filter((s) => s.reviewStatus !== undefined);
        if (reviewSiblings.length > 0) {
            const allReviewsApproved = reviewSiblings.every((s) => s.reviewStatus === "approved");
            if (!allReviewsApproved) {
                break;
            }
        }
        // 親を自動クローズ
        await withTasksLock(projectPath, async (lockData) => {
            const parentTask = lockData.tasks.find((t) => t.id === parentId);
            if (parentTask) {
                const now = getTimestamp();
                parentTask.mainStatus = "closed";
                parentTask.v2Substatus = "completed";
                parentTask.status = "completed";
                parentTask.completedAt = now;
                parentTask.updatedAt = now;
            }
            return { data: lockData, result: null };
        });
        autoClosedIds.push(parentId);
        // 次の親をチェック
        currentTaskId = parentId;
    }
    return { autoClosedIds };
}
/**
 * タスク一覧からV2.1ダッシュボードデータを生成
 */
export async function generateV2DashboardData(projectPath, options = {}) {
    const { showArchived = false, statusFilter = "open", offset = 0, limit = 10, sortField = "id", sortOrder = "desc", sortBy = "updated", search, priority, assignee, } = options;
    const data = await loadTasksReadOnly(projectPath);
    const tasks = data.tasks;
    // タスクのMapを作成（親タスク参照用）
    const taskMap = new Map();
    for (const task of tasks) {
        taskMap.set(task.id, task);
    }
    /**
     * タスク種別を判定（親タスクの情報も使用）
     * 1. type が 'goal', 'phase', 'investigation' の場合はそのまま使用
     * 2. type が 'step' または未設定の場合は親タスク構造で判定:
     *    - parentId がない → task
     *    - parentId があり、親の parentId がない → work（Taskの直接の子）
     *    - parentId があり、親の parentId もある → step（孫タスク）
     */
    function inferTypeWithContext(task) {
        // type が 'task', 'work', 'investigation' の場合はそのまま使用
        if (task.type === "task" || task.type === "work" || task.type === "investigation") {
            return task.type;
        }
        // type が 'step' または未設定の場合は親タスク構造で判定
        if (!task.parentId)
            return "task";
        // 親タスクを取得
        const parent = taskMap.get(task.parentId);
        // 親タスクが存在し、その親がない場合はwork（Taskの直接の子）
        if (parent && !parent.parentId)
            return "work";
        // それ以外はstep（孫タスク）
        return "step";
    }
    // Task/Work/Step を分類
    const goals = [];
    const phases = [];
    const actions = [];
    const investigations = [];
    // Task階層から除外するカテゴリ（提案は別パネルで表示、actionRequired はフラグで管理）
    const excludedCategories = ["skill_candidate", "improvement"];
    for (const task of tasks) {
        const taskType = inferTypeWithContext(task);
        switch (taskType) {
            case "task":
                // 提案・要対応カテゴリはTask階層から除外
                if (!excludedCategories.includes(task.category || "task")) {
                    goals.push(task);
                }
                break;
            case "work":
                phases.push(task);
                break;
            case "step":
                actions.push(task);
                break;
            case "investigation":
                investigations.push(task);
                break;
        }
    }
    // タスクID比較用ヘルパー（数値部分を考慮）
    const compareTaskIds = (idA, idB) => {
        const partsA = idA.split("-");
        const partsB = idB.split("-");
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const pa = i < partsA.length ? parseInt(partsA[i], 10) : -1;
            const pb = i < partsB.length ? parseInt(partsB[i], 10) : -1;
            const numA = isNaN(pa) ? -1 : pa;
            const numB = isNaN(pb) ? -1 : pb;
            if (numA !== numB)
                return numA - numB;
        }
        return 0;
    };
    // 検索・フィルター用ヘルパー関数
    const matchesSearch = (task, searchTerm) => {
        const term = searchTerm.toLowerCase();
        const idMatch = task.id.toLowerCase().includes(term);
        const titleMatch = (task.title || "").toLowerCase().includes(term);
        return idMatch || titleMatch;
    };
    const hasAssignee = (task, targetAssignee) => {
        return task.assignees?.some((a) => a.agentId === targetAssignee) ?? false;
    };
    // 階層全体で検索・担当者がマッチするか判定
    const matchesHierarchy = (goal, searchTerm, targetAssignee) => {
        // Goalレベルでマッチ
        if (searchTerm && matchesSearch(goal, searchTerm))
            return true;
        if (targetAssignee && hasAssignee(goal, targetAssignee))
            return true;
        // Work/Stepレベルでマッチを検索
        const goalWorks = phases.filter((p) => p.parentId === goal.id);
        for (const work of goalWorks) {
            if (searchTerm && matchesSearch(work, searchTerm))
                return true;
            if (targetAssignee && hasAssignee(work, targetAssignee))
                return true;
            const workSteps = actions.filter((a) => a.parentId === work.id);
            for (const step of workSteps) {
                if (searchTerm && matchesSearch(step, searchTerm))
                    return true;
                if (targetAssignee && hasAssignee(step, targetAssignee))
                    return true;
            }
        }
        // searchTermもtargetAssigneeも指定なしの場合はtrue
        return !searchTerm && !targetAssignee;
    };
    // V2Goals: Goal階層構造を構築（フィルタ → 変換 → ソートの順で処理）
    const v2Goals = goals
        // archivedフィルタ: デフォルトでarchivedを除外
        .filter((g) => showArchived || g.archived !== true)
        // statusフィルタ: open/closed/all
        .filter((g) => {
        if (statusFilter === "all")
            return true;
        const { mainStatus } = convertToV2Status(g);
        if (statusFilter === "open")
            return mainStatus === "open";
        if (statusFilter === "closed")
            return mainStatus === "closed";
        return true;
    })
        // 優先度フィルタ
        .filter((g) => !priority || g.priority === priority)
        // 検索・担当者フィルタ（階層全体で検索）
        .filter((g) => matchesHierarchy(g, search, assignee))
        .map((goal) => {
        const { mainStatus, substatus } = convertToV2Status(goal);
        // このGoalに属するPhaseを取得（sortByに応じてソート）
        const goalPhases = phases
            .filter((p) => p.parentId === goal.id)
            .sort((a, b) => {
            if (sortBy === "id") {
                // ID順（昇順）
                return compareTaskIds(a.id, b.id);
            }
            else {
                // updatedAt順（降順）
                const aTime = a.updatedAt || a.createdAt || "";
                const bTime = b.updatedAt || b.createdAt || "";
                return bTime.localeCompare(aTime);
            }
        });
        const v2Works = goalPhases.map((phase) => {
            const phaseStatus = convertToV2Status(phase);
            // このWorkに属するStepを取得（sortByに応じてソート）
            const phaseActions = actions
                .filter((a) => a.parentId === phase.id)
                .sort((a, b) => {
                if (sortBy === "id") {
                    // ID順（昇順）
                    return compareTaskIds(a.id, b.id);
                }
                else {
                    // updatedAt順（降順）
                    const aTime = a.updatedAt || a.createdAt || "";
                    const bTime = b.updatedAt || b.createdAt || "";
                    return bTime.localeCompare(aTime);
                }
            });
            const v2Steps = phaseActions.map((action) => {
                const actionStatus = convertToV2Status(action);
                return {
                    id: action.id,
                    title: action.title || `Step #${action.id}`,
                    description: action.description,
                    type: "step",
                    mainStatus: actionStatus.mainStatus,
                    v2Substatus: actionStatus.substatus,
                    assignees: action.assignees?.map((a) => ({ agentId: a.agentId })),
                    updatedAt: action.updatedAt,
                };
            });
            return {
                id: phase.id,
                title: phase.title || `Work #${phase.id}`,
                description: phase.description,
                type: "work",
                mainStatus: phaseStatus.mainStatus,
                v2Substatus: phaseStatus.substatus,
                reviewStatus: phase.reviewStatus,
                assignees: phase.assignees?.map((a) => ({ agentId: a.agentId })),
                steps: v2Steps,
                updatedAt: phase.updatedAt,
            };
        });
        // Task階層連動: 子Workの状態から表示ステータスを計算
        // Task自身が closed の場合は「完了」を返す
        const { displayStatus, displayIcon } = computeGoalDisplayStatus(substatus, v2Works.map((w) => ({ v2Substatus: w.v2Substatus, mainStatus: w.mainStatus })), mainStatus);
        // 最新更新日時を計算（Task自身 + 配下のWork/Step）
        const childUpdates = v2Works.flatMap((w) => [w.updatedAt, ...w.steps.map((s) => s.updatedAt)]).filter((d) => Boolean(d));
        const allUpdates = [goal.updatedAt, ...childUpdates].filter((d) => Boolean(d));
        const latestUpdatedAt = allUpdates.length > 0
            ? allUpdates.sort().pop()
            : goal.updatedAt;
        return {
            id: goal.id,
            title: goal.title || `Task #${goal.id}`,
            description: goal.description,
            type: "task",
            mainStatus,
            v2Substatus: substatus,
            size: goal.size,
            reviewStatus: goal.reviewStatus,
            assignees: goal.assignees?.map((a) => ({ agentId: a.agentId })) || [],
            works: v2Works,
            displayStatus,
            displayIcon,
            archived: goal.archived || substatus === "archived",
            updatedAt: goal.updatedAt,
            latestUpdatedAt,
        };
    })
        // ソート: latestUpdatedAt を使用（子タスクの最新日時を含む）
        .sort((a, b) => {
        let cmp;
        if (sortField === "updatedAt") {
            const aTime = a.latestUpdatedAt || a.updatedAt || "";
            const bTime = b.latestUpdatedAt || b.updatedAt || "";
            cmp = aTime.localeCompare(bTime);
        }
        else {
            // デフォルト: id でソート
            cmp = compareTaskIds(a.id, b.id);
        }
        return sortOrder === "asc" ? cmp : -cmp;
    });
    // ページネーション: totalGoals はフィルタリング後の件数
    const totalGoals = v2Goals.length;
    const paginatedV2Goals = v2Goals.slice(offset, offset + limit);
    // V2ReviewQueue: レビュー待ちタスク（updatedAt降順でソート）
    const v2ReviewQueue = tasks
        .filter((t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review")
        .sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || "";
        const bTime = b.updatedAt || b.createdAt || "";
        return bTime.localeCompare(aTime);
    })
        .map((task) => ({
        id: task.id,
        title: task.title,
        type: inferTaskType(task),
        reviewStatus: task.reviewStatus || "pending",
        priority: task.priority || "medium",
        completedAt: task.completedAt || "",
        assignees: task.assignees?.map((a) => ({ agentId: a.agentId })) || [],
    }));
    // V2Artifacts: 成果物一覧（createdAt降順でソート）
    const v2Artifacts = [];
    for (const task of tasks) {
        if (task.artifacts && Array.isArray(task.artifacts)) {
            for (const artifact of task.artifacts) {
                v2Artifacts.push({
                    path: artifact.path,
                    type: artifact.type || "default",
                    retention: artifact.retention || "L1",
                    taskId: task.id,
                    createdAt: task.createdAt, // TaskArtifact には createdAt がないので task から取得
                });
            }
        }
    }
    // 成果物を作成日時の降順でソート
    v2Artifacts.sort((a, b) => {
        const aTime = a.createdAt || "";
        const bTime = b.createdAt || "";
        return bTime.localeCompare(aTime);
    });
    // V2Stats: 統計情報
    const completedCount = tasks.filter((t) => {
        const status = convertToV2Status(t);
        return status.substatus === "completed" || status.substatus === "archived";
    }).length;
    const actionRequiredCount = tasks.filter((t) => t.actionRequired === true && t.status !== "completed").length;
    const reviewPendingCount = tasks.filter((t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review").length;
    // 提案カウント: closed/cancelled/archivedを除外
    const proposalCount = tasks.filter((t) => {
        if (t.category !== "skill_candidate" && t.category !== "improvement") {
            return false;
        }
        // V1ステータスでの除外
        if (t.status === "completed" || t.status === "cancelled") {
            return false;
        }
        // アーカイブ済みを除外
        if (t.archived === true) {
            return false;
        }
        // V2.1ステータスでの除外（mainStatus: closed）
        const { mainStatus } = convertToV2Status(t);
        if (mainStatus === "closed") {
            return false;
        }
        return true;
    }).length;
    const v2Stats = {
        taskCount: goals.length,
        workCount: phases.length,
        stepCount: actions.length + investigations.length,
        completedCount,
        actionRequiredCount,
        reviewPendingCount,
        proposalCount,
    };
    return {
        v2Goals: paginatedV2Goals,
        v2ReviewQueue,
        v2Artifacts,
        v2Stats,
        totalGoals,
    };
}
// =============================================================================
// V2.1: マイグレーション機能
// =============================================================================
/**
 * 旧ステータスから V2.1 ステータスへのマッピング
 *
 * 実装計画書 3.2 準拠
 */
export function mapLegacyToV2Status(legacyStatus, legacySubstatus) {
    switch (legacyStatus) {
        case "pending":
            return { mainStatus: "open", v2Substatus: "pending" };
        case "assigned":
            return { mainStatus: "open", v2Substatus: "assigned" };
        case "working":
            return { mainStatus: "open", v2Substatus: "working" };
        case "blocked":
            if (legacySubstatus === "waiting") {
                return { mainStatus: "open", v2Substatus: "waiting" };
            }
            return { mainStatus: "open", v2Substatus: "checkpoint" };
        case "completed":
            return { mainStatus: "closed", v2Substatus: "completed" };
        case "cancelled":
            return { mainStatus: "cancelled", v2Substatus: "archived" };
        default:
            console.warn(`[mapLegacyToV2Status] Unknown legacyStatus: ${legacyStatus}, defaulting to open/pending`);
            return { mainStatus: "open", v2Substatus: "pending" };
    }
}
/**
 * 単一タスクを V2.1 形式にマイグレーション
 *
 * 実装計画書 3.6 準拠
 * - 既に V2.1 形式の場合はそのまま返す
 * - archivedフラグを独立フラグとして設定
 */
export function migrateTaskToV2(task) {
    // 既に V2.1 形式の場合はそのまま返す
    if (task.mainStatus && task.v2Substatus) {
        return task;
    }
    // 旧ステータスからV2.1ステータスへ変換
    const { mainStatus, v2Substatus } = mapLegacyToV2Status(task.status, task.substatus);
    // archivedフラグの決定
    // - 旧 substatus が "archived" の場合
    // - reviewed が true の場合（チェック済み完了タスク）
    const archived = task.substatus === "archived" || task.reviewed === true;
    // タスク種別の推定
    const type = task.type || inferTaskType(task);
    return {
        ...task,
        type,
        mainStatus,
        v2Substatus,
        archived,
        archivedAt: archived ? (task.reviewedAt || task.completedAt || null) : null,
        // Task専用フィールドの初期化
        size: type === "task" ? (task.size || "standard") : undefined,
        tentative: type === "task" ? (task.tentative || false) : undefined,
        // 配列フィールドの初期化
        artifacts: task.artifacts || [],
        blockedBy: task.blockedBy || [],
    };
}
/**
 * 既存タスクを V2.1 形式にマイグレーション
 *
 * 設計書より:
 * 1. 既存タスクに type: step を付与（デフォルト）
 * 2. 親タスクを type: task に変更
 * 3. サブタスクグループを type: work に変更（直接の親が task の場合）
 * 4. 調査系タスクを type: investigation に変更
 * 5. mainStatus/v2Substatus を旧 status から変換
 */
export async function migrateToV2(projectPath, options = {}) {
    const result = {
        totalTasks: 0,
        migratedTasks: 0,
        skippedTasks: 0,
        details: [],
    };
    await withTasksLock(projectPath, async (data) => {
        result.totalTasks = data.tasks.length;
        const now = getTimestamp();
        for (const task of data.tasks) {
            // 既に V2.1 形式の場合はスキップ
            if (task.type && task.mainStatus && task.v2Substatus) {
                result.skippedTasks++;
                result.details.push({
                    taskId: task.id,
                    action: "skipped",
                    reason: "Already migrated",
                });
                continue;
            }
            const changes = {};
            // 1. type の決定
            if (!task.type) {
                if (!task.parentId) {
                    // 親タスクなし → Task
                    task.type = "task";
                    changes.type = "task";
                }
                else {
                    // 親タスクあり
                    const parent = data.tasks.find((t) => t.id === task.parentId);
                    if (parent && !parent.parentId) {
                        // 親が Task (parentId なし) → 子は Work の可能性
                        // サブタスクがある場合は Work、ない場合は Step
                        const hasChildren = data.tasks.some((t) => t.parentId === task.id);
                        if (hasChildren) {
                            task.type = "work";
                            changes.type = "work";
                        }
                        else {
                            // タイトルに「調査」「分析」「リサーチ」が含まれる場合は Investigation
                            const investigationKeywords = ["調査", "分析", "リサーチ", "research", "investigation", "analyze"];
                            const titleLower = (task.title || "").toLowerCase();
                            const descLower = (task.description || "").toLowerCase();
                            const isInvestigation = investigationKeywords.some((kw) => titleLower.includes(kw) || descLower.includes(kw));
                            task.type = isInvestigation ? "investigation" : "step";
                            changes.type = task.type;
                        }
                    }
                    else {
                        // 孫タスク → Step
                        task.type = "step";
                        changes.type = "step";
                    }
                }
            }
            // 2. mainStatus / v2Substatus の決定
            if (!task.mainStatus || !task.v2Substatus) {
                const { mainStatus, substatus } = convertToV2Status(task);
                task.mainStatus = mainStatus;
                task.v2Substatus = substatus;
                changes.mainStatus = mainStatus;
                changes.v2Substatus = substatus;
            }
            // 3. Task 専用フィールドの初期化
            if (task.type === "task") {
                if (task.size === undefined) {
                    // 子タスク数から size を推定
                    const children = data.tasks.filter((t) => t.parentId === task.id);
                    const workCount = children.filter((c) => c.type === "work" || data.tasks.some((t) => t.parentId === c.id)).length;
                    if (workCount === 0 || workCount === 1) {
                        task.size = "simple";
                    }
                    else if (workCount <= 4) {
                        task.size = "standard";
                    }
                    else {
                        task.size = "complex";
                    }
                    changes.size = task.size;
                }
                if (task.tentative === undefined) {
                    task.tentative = false;
                    changes.tentative = false;
                }
            }
            // 4. artifacts 初期化
            if (task.artifacts === undefined) {
                task.artifacts = [];
                changes.artifacts = [];
            }
            // 5. blockedBy 初期化
            if (task.blockedBy === undefined) {
                task.blockedBy = [];
                changes.blockedBy = [];
            }
            // 6. archived フラグの初期化（独立フラグ）
            // - 旧 substatus が "archived" の場合
            // - reviewed が true の場合（チェック済み完了タスク）
            if (task.archived === undefined) {
                const shouldArchive = task.substatus === "archived" || task.reviewed === true;
                task.archived = shouldArchive;
                task.archivedAt = shouldArchive ? (task.reviewedAt || task.completedAt || null) : null;
                if (shouldArchive) {
                    changes.archived = true;
                    changes.archivedAt = task.archivedAt;
                }
            }
            // 更新時刻
            if (Object.keys(changes).length > 0 && !options.dryRun) {
                task.updatedAt = now;
            }
            result.migratedTasks++;
            result.details.push({
                taskId: task.id,
                action: "migrated",
                changes,
            });
        }
        // dryRun の場合は変更を保存しない
        if (options.dryRun) {
            return { data: await loadTasksReadOnly(projectPath), result: null };
        }
        return { data, result: null };
    });
    return result;
}
/**
 * V2.1 マイグレーション状況の確認
 */
export async function checkMigrationStatus(projectPath) {
    const data = await loadTasksReadOnly(projectPath);
    let v2Tasks = 0;
    let legacyTasks = 0;
    for (const task of data.tasks) {
        if (task.type && task.mainStatus && task.v2Substatus) {
            v2Tasks++;
        }
        else {
            legacyTasks++;
        }
    }
    return {
        totalTasks: data.tasks.length,
        v2Tasks,
        legacyTasks,
        migrationRequired: legacyTasks > 0,
    };
}
