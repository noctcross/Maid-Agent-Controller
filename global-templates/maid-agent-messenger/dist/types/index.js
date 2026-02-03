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
// タスクカテゴリ
export const TASK_CATEGORIES = [
    "task", // 通常タスク（デフォルト）
    "action_required", // 🚨 要対応
    "skill_candidate", // 📚 スキル化候補
    "improvement", // 💡 改善提案
];
// パス定数（レガシー - 動的パス解決に移行）
// プロジェクトパスは X-Maid-Project-Path ヘッダーで指定され、
// central-server.ts 内で動的に解決される
