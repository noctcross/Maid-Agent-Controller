/**
 * タスクステータス関連ユーティリティ・マイグレーション機能
 *
 * - ステータス遷移バリデーション
 * - ステータス変換
 * - マイグレーション処理
 *
 * task-manager.ts から責務分割のため分離。
 */
import type { TaskStatus, Task, TaskType, TaskMainStatus, TaskSubstatus, OperatorRole, StatusTransitionValidation } from "../types/task-manager-types.js";
/**
 * V2.1: タスク種別の判定（後方互換）
 * type が未設定の場合、parentId の有無で推定
 */
export declare function inferTaskType(task: Task): TaskType;
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
export declare function validateStatusTransition(currentStatus: TaskSubstatus | string, newStatus: TaskSubstatus, operatorRole: OperatorRole): StatusTransitionValidation;
/**
 * エージェントIDから役割を取得
 */
export declare function getAgentRole(agentId: string): OperatorRole;
/**
 * V2.1: ステータス変換（旧 → 新）
 */
export declare function convertStatus(task: Task): {
    mainStatus: TaskMainStatus;
    substatus: TaskSubstatus;
};
/**
 * 旧ステータスから V2.1 ステータスへのマッピング
 *
 * 実装計画書 3.2 準拠
 */
export declare function mapLegacyStatus(legacyStatus: TaskStatus, legacySubstatus: string | null): {
    mainStatus: TaskMainStatus;
    subStatus: TaskSubstatus;
};
/**
 * 単一タスクを V2.1 形式にマイグレーション
 *
 * 実装計画書 3.6 準拠
 * - 既に V2.1 形式の場合はそのまま返す
 * - archivedフラグを独立フラグとして設定
 */
export declare function migrateTask(task: Task): Task;
/**
 * マイグレーション結果
 */
export interface MigrationResult {
    totalTasks: number;
    migratedTasks: number;
    skippedTasks: number;
    details: Array<{
        taskId: string;
        action: "migrated" | "skipped";
        changes?: Record<string, unknown>;
        reason?: string;
    }>;
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
export declare function migrate(projectPath: string, options?: {
    dryRun?: boolean;
}): Promise<MigrationResult>;
/**
 * V2.1 マイグレーション状況の確認
 */
export declare function checkMigrationStatus(projectPath: string): Promise<{
    totalTasks: number;
    v2Tasks: number;
    legacyTasks: number;
    migrationRequired: boolean;
}>;
