/**
 * Maid Agent System - 型定義
 * V2.1: Goal/Phase/Action/Investigation 階層構造対応
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
// =============================================================================
// V2.1: タスク種別
// =============================================================================
export const TASK_TYPES = [
    "goal", // 目標タスク（ご主人様の指示単位）
    "phase", // フェーズ（成果物単位の作業グループ）
    "action", // アクション（メイド1人で完結する作業）
    "investigation", // 調査タスク（docs/昇格対象）
];
// =============================================================================
// V2.1: タスクステータス（2層構造）
// =============================================================================
// メインステータス: open/closed
export const TASK_MAIN_STATUSES = ["open", "closed"];
// サブステータス
export const TASK_SUBSTATUSES = [
    // open 時のサブステータス
    "active", // 作業中・進行中
    "paused", // 一時停止
    "checkpoint", // 人間の判断・確認待ち
    "waiting", // 他タスクの完了待ち
    // closed 時のサブステータス
    "completed", // 完了
    "archived", // アーカイブ済み
];
// open 時の有効なサブステータス
export const OPEN_SUBSTATUSES = ["active", "paused", "checkpoint", "waiting"];
// closed 時の有効なサブステータス
export const CLOSED_SUBSTATUSES = ["completed", "archived"];
// =============================================================================
// V2.1: Goal サイズ
// =============================================================================
export const GOAL_SIZES = [
    "simple", // 0-1 phases, typo修正、設定変更、調査のみ
    "standard", // 2-4 phases, 機能追加、バグ修正
    "complex", // 5+ phases, 大規模リファクタリング
];
// =============================================================================
// V2.1: レビューステータス
// =============================================================================
export const REVIEW_STATUSES = [
    "pending", // レビュー待ち
    "in_review", // レビュー中
    "approved", // 承認済み
    "rejected", // 却下
];
// =============================================================================
// V2.1: 成果物 Retention レベル
// =============================================================================
export const RETENTION_LEVELS = [
    "L1", // Phase完了後 7日で削除
    "L2", // Goal完了後 30日で削除
    "L3", // 永続（docs/配下）
];
// =============================================================================
// 後方互換: 旧タスクステータス (マイグレーション用)
// =============================================================================
export const LEGACY_TASK_STATUSES = [
    "idle",
    "assigned",
    "working",
    "completed",
    "blocked",
];
// 更新可能なステータス (後方互換)
export const UPDATABLE_STATUSES = [
    "working",
    "completed",
    "blocked",
];
// V2.1: メイドが更新可能なサブステータス
export const MAID_UPDATABLE_SUBSTATUSES = [
    "active",
    "paused",
    "checkpoint",
    "completed",
];
// タスクカテゴリ
export const TASK_CATEGORIES = [
    "task", // 通常タスク（デフォルト）
    "action_required", // 🚨 要対応
    "skill_candidate", // 📚 スキル化候補
    "improvement", // 💡 改善提案
];
// =============================================================================
// V2.1: ステータスマッピングユーティリティ
// =============================================================================
/**
 * 旧ステータスから V2.1 ステータスへの変換
 */
export function convertLegacyStatus(legacyStatus) {
    switch (legacyStatus) {
        case "idle":
            return { status: "open", substatus: "paused" };
        case "assigned":
            return { status: "open", substatus: "active" };
        case "working":
            return { status: "open", substatus: "active" };
        case "completed":
            return { status: "closed", substatus: "completed" };
        case "blocked":
            return { status: "open", substatus: "checkpoint" };
        default:
            return { status: "open", substatus: "active" };
    }
}
/**
 * V2.1 ステータスから旧ステータスへの変換（後方互換用）
 */
export function convertToLegacyStatus(status, substatus) {
    if (status === "closed") {
        return "completed";
    }
    switch (substatus) {
        case "active":
            return "working";
        case "paused":
            return "idle";
        case "checkpoint":
        case "waiting":
            return "blocked";
        case "completed":
            return "completed";
        case "archived":
            return "completed";
        default:
            return "idle";
    }
}
// パス定数（レガシー - 動的パス解決に移行）
// プロジェクトパスは X-Maid-Project-Path ヘッダーで指定され、
// central-server.ts 内で動的に解決される
