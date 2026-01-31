"use strict";
/**
 * Maid Agent System - 型定義
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPDATABLE_STATUSES = exports.TASK_STATUSES = exports.ALL_AGENT_IDS = exports.MAID_IDS = void 0;
// エージェントID
exports.MAID_IDS = [
    "emma",
    "sophia",
    "lily",
    "rose",
    "alice",
    "may",
    "flora",
    "luna",
];
exports.ALL_AGENT_IDS = ["butler", "chief", ...exports.MAID_IDS];
// タスクステータス
exports.TASK_STATUSES = [
    "idle",
    "assigned",
    "working",
    "completed",
    "blocked",
];
// 更新可能なステータス
exports.UPDATABLE_STATUSES = [
    "working",
    "completed",
    "blocked",
];
// パス定数（レガシー - 動的パス解決に移行）
// プロジェクトパスは X-Maid-Project-Path ヘッダーで指定され、
// central-server.ts 内で動的に解決される
//# sourceMappingURL=index.js.map