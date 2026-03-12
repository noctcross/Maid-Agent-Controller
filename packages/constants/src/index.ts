/**
 * @maid-agent/constants
 * Maid Agent System のエージェント定数定義
 */

// =============================================================================
// 型定義
// =============================================================================

/**
 * メイドID（8名）
 */
export type MaidId =
  | "emma"
  | "sophia"
  | "lily"
  | "rose"
  | "alice"
  | "may"
  | "flora"
  | "luna";

/**
 * 全エージェントID（butler + chief + メイド8名 = 10名）
 */
export type AgentId = "butler" | "chief" | MaidId;

/**
 * エージェント情報
 */
export interface AgentInfo {
  /** システムID */
  id: AgentId;
  /** 役職名（日本語） */
  role: string;
  /** キャラクター名（UI表示用） */
  name: string;
  /** 絵文字 */
  emoji: string;
  /** テーマカラー（hex） */
  color: string;
}

// =============================================================================
// 定数配列
// =============================================================================

/**
 * メイドIDの配列（順序保証）
 */
export const MAID_IDS = [
  "emma",
  "sophia",
  "lily",
  "rose",
  "alice",
  "may",
  "flora",
  "luna",
] as const;

/**
 * 全エージェントIDの配列（順序保証）
 */
export const ALL_AGENT_IDS = ["butler", "chief", ...MAID_IDS] as const;

// =============================================================================
// エージェント情報定義（全10名）
// =============================================================================

/**
 * 全エージェント情報のマスターデータ
 */
export const AGENTS: Record<AgentId, AgentInfo> = {
  butler: {
    id: "butler",
    role: "執事",
    name: "シルヴィア",
    emoji: "🎩",
    color: "#008080",
  },
  chief: {
    id: "chief",
    role: "メイド長",
    name: "ビオラ",
    emoji: "👑",
    color: "#008080",
  },
  emma: {
    id: "emma",
    role: "メイド",
    name: "エマ",
    emoji: "☕",
    color: "#8B5A2B",
  },
  sophia: {
    id: "sophia",
    role: "メイド",
    name: "ソフィア",
    emoji: "❄️",
    color: "#4169E1",
  },
  lily: {
    id: "lily",
    role: "メイド",
    name: "リリー",
    emoji: "🎀",
    color: "#FFB6C1",
  },
  rose: {
    id: "rose",
    role: "メイド",
    name: "ローズ",
    emoji: "🌹",
    color: "#DC143C",
  },
  alice: {
    id: "alice",
    role: "メイド",
    name: "アリス",
    emoji: "✨",
    color: "#DAA520",
  },
  may: {
    id: "may",
    role: "メイド",
    name: "メイ",
    emoji: "🕊️",
    color: "#808080",
  },
  flora: {
    id: "flora",
    role: "メイド",
    name: "フローラ",
    emoji: "🌿",
    color: "#228B22",
  },
  luna: {
    id: "luna",
    role: "メイド",
    name: "ルナ",
    emoji: "🌙",
    color: "#800080",
  },
};

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * エージェント情報を取得
 */
export function getAgent(id: AgentId): AgentInfo {
  return AGENTS[id];
}

/**
 * メイド一覧を取得（順序保証）
 */
export function getMaids(): AgentInfo[] {
  return MAID_IDS.map((id) => AGENTS[id]);
}

/**
 * 全エージェント一覧を取得（順序保証）
 */
export function getAllAgents(): AgentInfo[] {
  return ALL_AGENT_IDS.map((id) => AGENTS[id]);
}

/**
 * 有効なエージェントIDかどうかを判定
 */
export function isValidAgentId(id: string): id is AgentId {
  return id in AGENTS;
}

/**
 * 有効なメイドIDかどうかを判定
 */
export function isValidMaidId(id: string): id is MaidId {
  return MAID_IDS.includes(id as MaidId);
}
