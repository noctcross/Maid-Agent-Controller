/**
 * タスク更新操作
 *
 * task-crud.ts から分割。Update 操作を提供。
 *
 * @module task-crud-update
 */
import type { UpdateTaskParams, UpdateTaskResult } from "../types/task-manager-types.js";
/**
 * タスク更新
 *
 * unified-task-state-gateway: 唯一の書き込みゲートウェイ。
 * tasks.yaml 更新後、副作用（maid yaml同期・レポートアーカイブ・テンプレート初期化）を実行。
 */
export declare function executeUpdateTask(projectPath: string, params: UpdateTaskParams): Promise<UpdateTaskResult>;
