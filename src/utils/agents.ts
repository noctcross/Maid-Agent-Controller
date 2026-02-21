// utils/agents.ts
// エージェント関連定数の唯一の情報源（Single Source of Truth）

import type { AgentConfig, AgentId, MaidId, AgentColorConfig } from '../types/agent';

/**
 * 全エージェント情報のマスターデータ
 * - 唯一の情報源（Single Source of Truth）
 */
export const AGENTS_MAP: Record<AgentId, AgentConfig> = {
    butler: {
        id: 'butler',
        name: 'シルヴィア',
        role: 'butler',
        emoji: '🎩',
        color: { bg: '#1a1a2e', accent: '#008080' }  // ティール
    },
    chief: {
        id: 'chief',
        name: 'ビオラ',
        role: 'chiefMaid',
        emoji: '👑',
        color: { bg: '#1a1a2e', accent: '#008080' }  // ティール
    },
    emma: {
        id: 'emma',
        name: 'エマ',
        role: 'maid',
        emoji: '☕',
        color: { bg: '#1a1a2e', accent: '#8B5A2B' }  // ブラウン
    },
    sophia: {
        id: 'sophia',
        name: 'ソフィア',
        role: 'maid',
        emoji: '❄️',
        color: { bg: '#1a1a2e', accent: '#4169E1' }  // ブルー
    },
    lily: {
        id: 'lily',
        name: 'リリー',
        role: 'maid',
        emoji: '🎀',
        color: { bg: '#1a1a2e', accent: '#FFB6C1' }  // ピンク
    },
    rose: {
        id: 'rose',
        name: 'ローズ',
        role: 'maid',
        emoji: '🌹',
        color: { bg: '#1a1a2e', accent: '#DC143C' }  // レッド
    },
    alice: {
        id: 'alice',
        name: 'アリス',
        role: 'maid',
        emoji: '✨',
        color: { bg: '#1a1a2e', accent: '#DAA520' }  // ゴールド
    },
    may: {
        id: 'may',
        name: 'メイ',
        role: 'maid',
        emoji: '🕊️',
        color: { bg: '#1a1a2e', accent: '#808080' }  // グレー
    },
    flora: {
        id: 'flora',
        name: 'フローラ',
        role: 'maid',
        emoji: '🌿',
        color: { bg: '#1a1a2e', accent: '#228B22' }  // グリーン
    },
    luna: {
        id: 'luna',
        name: 'ルナ',
        role: 'maid',
        emoji: '🌙',
        color: { bg: '#1a1a2e', accent: '#800080' }  // パープル
    }
};

/**
 * メイドのみのマップ（MAIDS_MAP 後方互換）
 * 注: 後方互換のため string インデックスアクセスを許可
 */
export const MAIDS_MAP: { [key: string]: AgentConfig } = Object.fromEntries(
    Object.entries(AGENTS_MAP).filter(([_, v]) => v.role === 'maid')
);

/**
 * メイドIDの配列（DEFAULT_MAID_ORDER 後方互換）
 */
export const DEFAULT_MAID_ORDER: MaidId[] = [
    'emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'
];

/**
 * エージェント色マップ（AGENT_COLORS 後方互換）
 * 注: 後方互換のため string インデックスアクセスを許可
 */
export const AGENT_COLORS: { [key: string]: AgentColorConfig } = Object.fromEntries(
    Object.entries(AGENTS_MAP).map(([id, config]) => [id, config.color])
);

// ユーティリティ関数
export function getAgent(id: AgentId): AgentConfig | undefined {
    return AGENTS_MAP[id];
}

export function getMaids(): AgentConfig[] {
    return DEFAULT_MAID_ORDER.map(id => AGENTS_MAP[id]);
}

export function isValidAgentId(id: string): id is AgentId {
    return id in AGENTS_MAP;
}

export function isValidMaidId(id: string): id is MaidId {
    return id in MAIDS_MAP;
}
