/**
 * タスク自動クローズ・依存解消処理
 *
 * - 子タスク完了時の親タスク自動クローズ
 * - 依存タスク完了時のブロック解消
 *
 * task-manager.ts から責務分割のため分離。
 */
/**
 * 依存解消時の自動更新結果
 */
export interface DependencyResolutionResult {
    unblockedTasks: Array<{
        taskId: string;
        assignees: string[];
        previousSubstatus: string;
    }>;
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
export declare function resolveBlockedTasks(projectPath: string, completedTaskId: string): Promise<DependencyResolutionResult>;
/**
 * V2.1: Goal の自動クローズ判定
 *
 * 条件:
 * - 全Phaseが completed
 * - レビューPhaseが存在する場合は approved
 * - 除外カテゴリなし (skill_candidate, improvement)
 * - actionRequired フラグ付きタスクは別途管理
 */
export declare function checkGoalAutoClose(projectPath: string, goalId: string): Promise<{
    canAutoClose: boolean;
    reason?: string;
}>;
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
export declare function checkAndAutoCloseParent(projectPath: string, completedTaskId: string): Promise<{
    autoClosedIds: string[];
}>;
//# sourceMappingURL=task-auto-close.d.ts.map