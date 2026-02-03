/**
 * タスク管理ツール（STDIOモード用ラッパー）
 *
 * Phase 1: create_task, get_task, list_tasks を登録
 * Phase 3: update_task を追加
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * create_task ツールを登録
 */
export declare function registerCreateTask(server: McpServer): void;
/**
 * get_task ツールを登録
 */
export declare function registerGetTask(server: McpServer): void;
/**
 * list_tasks ツールを登録
 */
export declare function registerListTasks(server: McpServer): void;
/**
 * update_task ツールを登録（Phase 3）
 */
export declare function registerUpdateTask(server: McpServer): void;
/**
 * 全タスク管理ツールを一括登録（Phase 1 + Phase 3）
 */
export declare function registerTaskManagerTools(server: McpServer): void;
