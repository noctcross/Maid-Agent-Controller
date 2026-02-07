/**
 * タスク状態更新の副作用処理
 *
 * executeUpdateTask から呼び出される副作用関数群。
 * - syncMaidYaml: maid yaml 自動同期
 * - archiveReport: レポートアーカイブ（completed時）
 * - initReportTemplate: レポートテンプレート初期化（assigned時）
 *
 * task-manager.ts のファイルサイズ制限のため別ファイルに分離。
 */
import type { Task, Assignee, UpdateTaskParams, SideEffectResults } from "./task-manager.js";
/**
 * 全副作用を実行する
 *
 * executeUpdateTask の withTasksLock 外で呼び出される。
 * 各副作用は try-catch で保護され、失敗しても全体は成功扱い。
 */
export declare function executeSideEffects(projectPath: string, task: Task, params: UpdateTaskParams, prevStatus: string, prevAssignees: Assignee[]): Promise<SideEffectResults>;
