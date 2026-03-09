/**
 * タスクID正規化ユーティリティ
 *
 * assign_task / update_status で重複しているロジックを集約
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
export declare function normalizeTaskId(taskId: string, agentId?: string): string;
/**
 * 親タスクIDを正規化する
 * - 先頭のゼロを除去後、3桁ゼロ埋めに統一
 * - サブタスクID（XX-YY, XX-YY-ZZ形式）にも対応
 *
 * @example
 * normalizeParentId("49")      // => "049"
 * normalizeParentId("049")     // => "049"
 * normalizeParentId("49-1")    // => "049-1"
 * normalizeParentId("049-1-2") // => "049-1-2"
 */
export declare function normalizeParentId(id: string | null | undefined): string | null;
/**
 * 2つのタスクIDが同一かどうかを比較する
 * 正規化してから比較するため、"49" と "049" は同一と判定される
 */
export declare function isSameTaskId(id1: string | null | undefined, id2: string | null | undefined): boolean;
//# sourceMappingURL=task-id.d.ts.map