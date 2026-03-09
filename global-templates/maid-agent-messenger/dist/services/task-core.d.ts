/**
 * タスク管理 - コアユーティリティ
 *
 * tasks.yaml の読み書きに必要な共通関数を提供。
 * 循環参照を避けるため、他のtask-*モジュールはこのファイルからインポートする。
 */
import type { TasksData } from "../types/task-manager-types.js";
/**
 * ファイルロックを取得してタスクデータを操作する
 * 読み取り→加工→書き込みを一貫したロックで保護
 */
export declare function withTasksLock<T>(projectPath: string, operation: (data: TasksData) => Promise<{
    data: TasksData;
    result: T;
}>): Promise<T>;
/**
 * 読み取り専用（ロックなし）- 一覧表示など更新を伴わない場合
 */
export declare function loadTasksReadOnly(projectPath: string): Promise<TasksData>;
//# sourceMappingURL=task-core.d.ts.map