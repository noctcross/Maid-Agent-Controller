/**
 * タスク更新操作
 *
 * task-crud.ts から分割。Update 操作を提供。
 *
 * @module task-crud-update
 */
import * as path from "path";
import { getTimestamp } from "../utils/yaml-helper.js";
import { withTasksLock } from "./task-core.js";
import { logger } from "../utils/logger.js";
import { getAgentRole, validateStatusTransition } from "./task-v2-migration.js";
import { checkAndAutoCloseParent, resolveBlockedTasks } from "./task-auto-close.js";
// === Update操作 ===
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
                logger.warn("Invalid status transition attempted", {
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
                catch (error) {
                    logger.error("Failed to add archivePath to reportPaths", error instanceof Error ? error : { error });
                }
            }
        }
        catch (error) {
            logger.error("Failed to execute side effects", error instanceof Error ? error : { error });
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
            catch (error) {
                logger.error("Failed to resolve blocked tasks", error instanceof Error ? error : { error });
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
            catch (error) {
                logger.error("Failed to auto-close parent tasks", error instanceof Error ? error : { error });
            }
        }
    }
    return result;
}
