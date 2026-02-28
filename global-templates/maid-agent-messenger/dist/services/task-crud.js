/**
 * タスク CRUD 操作 - エントリポイント
 *
 * create, get, list, update 操作を提供。
 * 各操作は責務分割のため別モジュールに分離。
 *
 * - task-crud-create.ts: Create 操作
 * - task-crud-read.ts: Get, List 操作
 * - task-crud-update.ts: Update 操作
 *
 * @module task-crud
 */
// === Create ===
export { executeCreateTask, } from "./task-crud-create.js";
// === Read ===
export { executeGetTask, executeListTasks, compareTaskIds, } from "./task-crud-read.js";
// === Update ===
export { executeUpdateTask } from "./task-crud-update.js";
