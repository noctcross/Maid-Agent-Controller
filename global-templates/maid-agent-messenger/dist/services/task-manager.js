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
        // V2.1: タスク種別の決定（デフォルト: action）
        const taskType = params.type || "action";
        // V2.1: 初期ステータスの設定
        // - blockedBy があれば waiting
        // - それ以外は active
        const hasBlockers = params.blockedBy && params.blockedBy.length > 0;
        const initialV2Substatus = hasBlockers ? "waiting" : "active";
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
            size: taskType === "goal" ? (params.size || "standard") : undefined,
            tentative: taskType === "goal" ? (params.tentative || false) : undefined,
            blockedBy: params.blockedBy || [],
            artifacts: [],
            reviewStatus: undefined,
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
        // === V2.1 フィールドの更新 ===
        if (params.mainStatus !== undefined) {
            task.mainStatus = params.mainStatus;
            // closed に変更時は completedAt を設定
            if (params.mainStatus === "closed" && !task.completedAt) {
                task.completedAt = now;
            }
        }
        if (params.v2Substatus !== undefined) {
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
            else if (params.v2Substatus === "active") {
                task.status = "working";
                task.mainStatus = "open";
                if (!task.startedAt) {
                    task.startedAt = now;
                }
            }
            else if (params.v2Substatus === "checkpoint" || params.v2Substatus === "waiting") {
                task.status = "blocked";
                task.mainStatus = "open";
            }
            else if (params.v2Substatus === "paused") {
                task.status = "pending";
                task.mainStatus = "open";
            }
        }
        if (params.type !== undefined) {
            task.type = params.type;
        }
        if (params.size !== undefined && task.type === "goal") {
            task.size = params.size;
        }
        if (params.tentative !== undefined && task.type === "goal") {
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
        // V2.1: Phase完了時に親Goalの自動クローズ判定
        if (isCompleted && result.task) {
            const taskType = inferTaskType(result.task);
            if (taskType === "phase" && result.task.parentId) {
                try {
                    const autoCloseResult = await checkGoalAutoClose(projectPath, result.task.parentId);
                    if (autoCloseResult.canAutoClose) {
                        // 親Goalを自動クローズ
                        await withTasksLock(projectPath, async (data) => {
                            const goal = data.tasks.find((t) => t.id === result.task.parentId);
                            if (goal) {
                                goal.mainStatus = "closed";
                                goal.v2Substatus = "completed";
                                goal.status = "completed";
                                goal.completedAt = getTimestamp();
                                goal.updatedAt = getTimestamp();
                            }
                            return { data, result: null };
                        });
                        result.sideEffects = result.sideEffects || {};
                        result.sideEffects.goalAutoClosed = result.task.parentId;
                    }
                }
                catch {
                    // Goal自動クローズ失敗は握りつぶす
                }
            }
        }
    }
    return result;
}
/**
 * タスク完了時に依存しているタスクを自動的に waiting → active に更新
 *
 * V2.1 設計書より:
 * 1. タスクA完了: maidctl my-status completed
 * 2. システムが blockedBy を検索
 * 3. タスクBが blockedBy: ["A"] を持つ場合
 *    → タスクBの担当者に自動通知
 *    → タスクBの substatus を waiting → active に更新
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
            // blockedBy が空になったら waiting → active に変更
            if (task.blockedBy.length === 0 && task.v2Substatus === "waiting") {
                task.v2Substatus = "active";
                task.substatus = "active";
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
    // 後方互換: parentId があればサブタスク（action）、なければ親タスク（goal）
    return task.parentId ? "action" : "goal";
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
            return { mainStatus: "open", substatus: "paused" };
        case "assigned":
            return { mainStatus: "open", substatus: "active" };
        case "working":
            return { mainStatus: "open", substatus: "active" };
        case "completed":
            return { mainStatus: "closed", substatus: "completed" };
        case "blocked":
            // blockedBy の有無で checkpoint/waiting を判断
            if (task.blockedBy && task.blockedBy.length > 0) {
                return { mainStatus: "open", substatus: "waiting" };
            }
            return { mainStatus: "open", substatus: "checkpoint" };
        case "cancelled":
            return { mainStatus: "closed", substatus: "archived" };
        default:
            return { mainStatus: "open", substatus: "active" };
    }
}
/**
 * V2.1: Goal の自動クローズ判定
 *
 * 条件:
 * - 全Phaseが completed
 * - レビューPhaseが存在する場合は approved
 * - 除外カテゴリなし (skill_candidate, improvement, action_required)
 */
export async function checkGoalAutoClose(projectPath, goalId) {
    const data = await loadTasksReadOnly(projectPath);
    const goal = data.tasks.find((t) => t.id === goalId);
    if (!goal) {
        return { canAutoClose: false, reason: "Goal not found" };
    }
    if (inferTaskType(goal) !== "goal") {
        return { canAutoClose: false, reason: "Not a goal" };
    }
    // 除外カテゴリチェック
    if (["skill_candidate", "improvement", "action_required"].includes(goal.category)) {
        return { canAutoClose: false, reason: `Excluded category: ${goal.category}` };
    }
    // tentative Goal は手動クローズ
    if (goal.tentative) {
        return { canAutoClose: false, reason: "Tentative goal requires manual close" };
    }
    // simple Goal (Phase省略) は手動クローズ
    if (goal.size === "simple") {
        return { canAutoClose: false, reason: "Simple goal requires manual close" };
    }
    // 子Phaseを取得
    const phases = data.tasks.filter((t) => t.parentId === goalId && inferTaskType(t) === "phase");
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
 * タスク一覧からV2.1ダッシュボードデータを生成
 */
export async function generateV2DashboardData(projectPath) {
    const data = await loadTasksReadOnly(projectPath);
    const tasks = data.tasks;
    // Goal/Phase/Action を分類
    const goals = [];
    const phases = [];
    const actions = [];
    const investigations = [];
    for (const task of tasks) {
        const taskType = inferTaskType(task);
        switch (taskType) {
            case "goal":
                goals.push(task);
                break;
            case "phase":
                phases.push(task);
                break;
            case "action":
                actions.push(task);
                break;
            case "investigation":
                investigations.push(task);
                break;
        }
    }
    // V2Goals: Goal階層構造を構築
    const v2Goals = goals
        .filter((g) => g.status !== "completed" || g.mainStatus !== "closed") // 完了していないGoalのみ
        .map((goal) => {
        const { mainStatus, substatus } = convertToV2Status(goal);
        // このGoalに属するPhaseを取得
        const goalPhases = phases.filter((p) => p.parentId === goal.id);
        const v2Phases = goalPhases.map((phase) => {
            const phaseStatus = convertToV2Status(phase);
            // このPhaseに属するActionを取得
            const phaseActions = actions.filter((a) => a.parentId === phase.id);
            const v2Actions = phaseActions.map((action) => {
                const actionStatus = convertToV2Status(action);
                return {
                    id: action.id,
                    title: action.title || `Action #${action.id}`,
                    type: "action",
                    mainStatus: actionStatus.mainStatus,
                    v2Substatus: actionStatus.substatus,
                    assignees: action.assignees?.map((a) => ({ agentId: a.agentId })),
                };
            });
            return {
                id: phase.id,
                title: phase.title || `Phase #${phase.id}`,
                type: "phase",
                mainStatus: phaseStatus.mainStatus,
                v2Substatus: phaseStatus.substatus,
                reviewStatus: phase.reviewStatus,
                actions: v2Actions,
            };
        });
        return {
            id: goal.id,
            title: goal.title || `Goal #${goal.id}`,
            type: "goal",
            mainStatus,
            v2Substatus: substatus,
            size: goal.size,
            reviewStatus: goal.reviewStatus,
            assignees: goal.assignees?.map((a) => ({ agentId: a.agentId })) || [],
            phases: v2Phases,
        };
    });
    // V2ReviewQueue: レビュー待ちタスク
    const v2ReviewQueue = tasks
        .filter((t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review")
        .map((task) => ({
        id: task.id,
        title: task.title,
        type: inferTaskType(task),
        reviewStatus: task.reviewStatus || "pending",
        priority: task.priority || "medium",
        completedAt: task.completedAt || "",
        assignees: task.assignees?.map((a) => ({ agentId: a.agentId })) || [],
    }));
    // V2Artifacts: 成果物一覧
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
    // V2Stats: 統計情報
    const completedCount = tasks.filter((t) => {
        const status = convertToV2Status(t);
        return status.substatus === "completed" || status.substatus === "archived";
    }).length;
    const actionRequiredCount = tasks.filter((t) => t.category === "action_required" && t.status !== "completed").length;
    const reviewPendingCount = tasks.filter((t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review").length;
    const proposalCount = tasks.filter((t) => (t.category === "skill_candidate" || t.category === "improvement") &&
        t.status !== "completed").length;
    const v2Stats = {
        goalCount: goals.length,
        phaseCount: phases.length,
        actionCount: actions.length + investigations.length,
        completedCount,
        actionRequiredCount,
        reviewPendingCount,
        proposalCount,
    };
    return {
        v2Goals,
        v2ReviewQueue,
        v2Artifacts,
        v2Stats,
    };
}
/**
 * 既存タスクを V2.1 形式にマイグレーション
 *
 * 設計書より:
 * 1. 既存タスクに type: action を付与（デフォルト）
 * 2. 親タスクを type: goal に変更
 * 3. サブタスクグループを type: phase に変更（直接の親が goal の場合）
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
                    // 親タスクなし → Goal
                    task.type = "goal";
                    changes.type = "goal";
                }
                else {
                    // 親タスクあり
                    const parent = data.tasks.find((t) => t.id === task.parentId);
                    if (parent && !parent.parentId) {
                        // 親が Goal (parentId なし) → 子は Phase の可能性
                        // サブタスクがある場合は Phase、ない場合は Action
                        const hasChildren = data.tasks.some((t) => t.parentId === task.id);
                        if (hasChildren) {
                            task.type = "phase";
                            changes.type = "phase";
                        }
                        else {
                            // タイトルに「調査」「分析」「リサーチ」が含まれる場合は Investigation
                            const investigationKeywords = ["調査", "分析", "リサーチ", "research", "investigation", "analyze"];
                            const titleLower = (task.title || "").toLowerCase();
                            const descLower = (task.description || "").toLowerCase();
                            const isInvestigation = investigationKeywords.some((kw) => titleLower.includes(kw) || descLower.includes(kw));
                            task.type = isInvestigation ? "investigation" : "action";
                            changes.type = task.type;
                        }
                    }
                    else {
                        // 孫タスク → Action
                        task.type = "action";
                        changes.type = "action";
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
            // 3. Goal 専用フィールドの初期化
            if (task.type === "goal") {
                if (task.size === undefined) {
                    // 子タスク数から size を推定
                    const children = data.tasks.filter((t) => t.parentId === task.id);
                    const phaseCount = children.filter((c) => c.type === "phase" || data.tasks.some((t) => t.parentId === c.id)).length;
                    if (phaseCount === 0 || phaseCount === 1) {
                        task.size = "simple";
                    }
                    else if (phaseCount <= 4) {
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
