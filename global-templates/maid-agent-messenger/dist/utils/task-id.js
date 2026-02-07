/**
 * タスクID正規化ユーティリティ
 *
 * assign_task / update_status で重複していたロジックを集約
 */
/**
 * タスクIDを正規化する
 * - 先頭の "task-" プレフィックスを除去（複数回出現にも対応）
 * - agentId 指定時は末尾の "-{agentId}" サフィックスを除去
 *
 * @example
 * normalizeTaskId("task-070")           // => "070"
 * normalizeTaskId("task-070-emma", "emma") // => "070"
 * normalizeTaskId("task-072-1")         // => "072-1"
 */
export function normalizeTaskId(taskId, agentId) {
    let normalized = String(taskId).replace(/^(task-)+/i, "");
    if (agentId) {
        normalized = normalized.replace(new RegExp(`-${agentId}$`, "i"), "");
    }
    return normalized;
}
