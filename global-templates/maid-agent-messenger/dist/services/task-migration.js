/**
 * タスクステータス関連ユーティリティ・マイグレーション機能
 *
 * - ステータス遷移バリデーション
 * - ステータス変換
 * - マイグレーション処理
 *
 * task-manager.ts から責務分割のため分離。
 */
import { getTimestamp } from "../utils/yaml-helper.js";
import { withTasksLock, loadTasksReadOnly } from "./task-core.js";
import { logger } from "../utils/logger.js";
// 役割の階層（数値が大きいほど上位）
const ROLE_HIERARCHY = {
    maid: 1,
    chief: 2,
    butler: 3,
    master: 4,
};
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
/**
 * V2.1: ステータス遷移バリデーション
 *
 * 不正な遷移を検出し、許可/拒否を判定する。
 * 設計書: docs/Maid-Agent-Controller/設計書/02_メッセンジャーサーバ/ダッシュボード/ステータス遷移設計.md
 *
 * @param currentStatus - 現在のステータス（subStatus）
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
export function convertStatus(task) {
    // 既にV2.1形式の場合
    if (task.mainStatus && task.subStatus) {
        return { mainStatus: task.mainStatus, substatus: task.subStatus };
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
// =============================================================================
// V2.1: マイグレーション機能
// =============================================================================
/**
 * 旧ステータスから V2.1 ステータスへのマッピング
 *
 * 実装計画書 3.2 準拠
 */
export function mapLegacyStatus(legacyStatus, legacySubstatus) {
    switch (legacyStatus) {
        case "pending":
            return { mainStatus: "open", subStatus: "pending" };
        case "assigned":
            return { mainStatus: "open", subStatus: "assigned" };
        case "working":
            return { mainStatus: "open", subStatus: "working" };
        case "blocked":
            if (legacySubstatus === "waiting") {
                return { mainStatus: "open", subStatus: "waiting" };
            }
            return { mainStatus: "open", subStatus: "checkpoint" };
        case "completed":
            return { mainStatus: "closed", subStatus: "completed" };
        case "cancelled":
            return { mainStatus: "cancelled", subStatus: "archived" };
        default:
            logger.warn(`Unknown legacyStatus: ${legacyStatus}, defaulting to open/pending`);
            return { mainStatus: "open", subStatus: "pending" };
    }
}
/**
 * 単一タスクを V2.1 形式にマイグレーション
 *
 * 実装計画書 3.6 準拠
 * - 既に V2.1 形式の場合はそのまま返す
 * - archivedフラグを独立フラグとして設定
 */
export function migrateTask(task) {
    // 既に V2.1 形式の場合はそのまま返す
    if (task.mainStatus && task.subStatus) {
        return task;
    }
    // 旧ステータスからV2.1ステータスへ変換
    const { mainStatus, subStatus } = mapLegacyStatus(task.status, task.substatus);
    // archivedフラグの決定
    // - 旧 substatus が "archived" の場合
    // - 既にarchivedフラグがtrueの場合
    const archived = task.substatus === "archived" || task.archived === true;
    // タスク種別の推定
    const type = task.type || inferTaskType(task);
    return {
        ...task,
        type,
        mainStatus,
        subStatus,
        archived,
        archivedAt: archived ? (task.archivedAt || task.completedAt || null) : null,
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
 * 5. mainStatus/subStatus を旧 status から変換
 */
export async function migrate(projectPath, options = {}) {
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
            // 既に V2.1 形式の場合はスキップ（V1フィールドが残っていても無視）
            const hasV2Fields = task.type && task.mainStatus && task.subStatus;
            if (hasV2Fields) {
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
            // 2. mainStatus / subStatus の決定
            if (!task.mainStatus || !task.subStatus) {
                const { mainStatus, substatus } = convertStatus(task);
                task.mainStatus = mainStatus;
                task.subStatus = substatus;
                changes.mainStatus = mainStatus;
                changes.subStatus = substatus;
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
            if (task.archived === undefined) {
                const shouldArchive = task.substatus === "archived";
                task.archived = shouldArchive;
                task.archivedAt = shouldArchive ? (task.completedAt || null) : null;
                if (shouldArchive) {
                    changes.archived = true;
                    changes.archivedAt = task.archivedAt;
                }
            }
            // 7. V1フィールド削除（status, substatus）
            // V2.1フィールド（mainStatus, subStatus）に移行済みのため不要
            if (task.status !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                delete task.status;
                changes.removedStatus = true;
            }
            if (task.substatus !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                delete task.substatus;
                changes.removedSubstatus = true;
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
        if (task.type && task.mainStatus && task.subStatus) {
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
