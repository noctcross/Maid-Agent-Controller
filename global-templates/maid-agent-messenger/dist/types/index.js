/**
 * Maid Agent System - 型定義
 * V2.1: Task/Work/Step/Investigation 階層構造対応
 * V5.0.0: @maid-agent/types からの re-export を追加
 */
import { logger } from "../utils/logger.js";
// =============================================================================
// エージェントID（実行時定数）
// =============================================================================
// ⚠️ 一貫性注意: この定義は VSCode拡張側 (src/utils/agents.ts の DEFAULT_MAID_ORDER) と
//    同じ値・同じ順序を維持する必要があります。変更時は両方を更新してください。
//    一貫性テスト: src/utils/__tests__/maid-id-consistency.test.ts
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
// V2.1: タスク種別（実行時定数）
// =============================================================================
export const TASK_TYPES = [
    "task", // タスク（ご主人様の指示単位）
    "work", // ワーク（成果物単位の作業グループ）
    "step", // ステップ（メイド1人で完結する作業）
    "investigation", // 調査タスク（docs/昇格対象）
];
// =============================================================================
// V2.1: タスクステータス（2層構造）
// =============================================================================
// メインステータス: open/closed/cancelled
export const TASK_MAIN_STATUSES = ["open", "closed", "cancelled"];
// サブステータス（V2.1設計に合わせて変更）
export const TASK_SUBSTATUSES = [
    // open 時のサブステータス
    "pending", // 未着手
    "assigned", // 割り当て済み
    "working", // 作業中
    "waiting", // 依存待ち
    "checkpoint", // 確認待ち
    // closed 時のサブステータス
    "completed", // 完了
];
// open 時の有効なサブステータス
export const OPEN_SUBSTATUSES = ["pending", "assigned", "working", "waiting", "checkpoint"];
// closed 時の有効なサブステータス
export const CLOSED_SUBSTATUSES = ["completed"];
// =============================================================================
// V2.1: Task サイズ（実行時定数）
// =============================================================================
export const TASK_SIZES = [
    "simple", // 0-1 works, typo修正、設定変更、調査のみ
    "standard", // 2-4 works, 機能追加、バグ修正
    "complex", // 5+ works, 大規模リファクタリング
];
// =============================================================================
// V2.1: レビューステータス（実行時定数）
// =============================================================================
export const REVIEW_STATUSES = [
    "pending", // レビュー待ち
    "in_review", // レビュー中
    "approved", // 承認済み
    "rejected", // 却下
];
// =============================================================================
// V2.1: 成果物 Retention レベル（実行時定数）
// =============================================================================
export const RETENTION_LEVELS = [
    "L1", // Work完了後 7日で削除
    "L2", // Task完了後 30日で削除
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
    "working",
    "checkpoint",
    "completed",
];
// タスクカテゴリ（V2.1: action_required は actionRequired に統合）
export const TASK_CATEGORIES = [
    "task", // 通常タスク（デフォルト）
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
            return { status: "open", substatus: "pending" };
        case "assigned":
            return { status: "open", substatus: "assigned" };
        case "working":
            return { status: "open", substatus: "working" };
        case "completed":
            return { status: "closed", substatus: "completed" };
        case "blocked":
            return { status: "open", substatus: "checkpoint" };
        default:
            logger.warn(`Unknown legacyStatus: ${legacyStatus}, defaulting to open/pending`);
            return { status: "open", substatus: "pending" };
    }
}
/**
 * V2.1 ステータスから旧ステータスへの変換（後方互換用）
 */
export function convertToLegacyStatus(status, substatus) {
    if (status === "closed" || status === "cancelled") {
        return "completed";
    }
    switch (substatus) {
        case "pending":
            return "idle";
        case "assigned":
            return "assigned";
        case "working":
            return "working";
        case "checkpoint":
        case "waiting":
            return "blocked";
        case "completed":
            return "completed";
        default:
            return "idle";
    }
}
// パス定数（レガシー - 動的パス解決に移行）
// プロジェクトパスは X-Maid-Project-Path ヘッダーで指定され、
// central-server.ts 内で動的に解決される
