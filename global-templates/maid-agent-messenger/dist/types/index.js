/**
 * Maid Agent System - 型定義
 */
// エージェントID
export const MAID_IDS = [
    "emma",
    "sophia",
    "lily",
    "rose",
    "alice",
    "may",
    "flora",
    "luna",
];
export const ALL_AGENT_IDS = ["butler", "chief", ...MAID_IDS];
// タスクステータス
export const TASK_STATUSES = [
    "idle",
    "assigned",
    "working",
    "completed",
    "blocked",
];
// 更新可能なステータス
export const UPDATABLE_STATUSES = [
    "working",
    "completed",
    "blocked",
];
// パス定数（レガシー - 動的パス解決に移行）
// プロジェクトパスは X-Maid-Project-Path ヘッダーで指定され、
// central-server.ts 内で動的に解決される
