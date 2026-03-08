// utils/agents.ts
// エージェント関連定数の唯一の情報源（Single Source of Truth）

import type { AgentConfig, AgentId, MaidId, AgentColorConfig } from '../types/agent';

/**
 * エージェントカラーパレット
 * 各エージェント固有のアクセントカラーを定義
 */
export const AGENT_COLOR_PALETTE = {
    // 共通背景色
    BG_PRIMARY: '#1a1a2e',

    // エージェント固有アクセントカラー
    BUTLER_TEAL: '#008080',
    CHIEF_TEAL: '#008080',
    EMMA_BROWN: '#8B5A2B',
    SOPHIA_BLUE: '#4169E1',
    LILY_PINK: '#FFB6C1',
    ROSE_RED: '#DC143C',
    ALICE_GOLD: '#DAA520',
    MAY_GREY: '#808080',
    FLORA_GREEN: '#228B22',
    LUNA_PURPLE: '#800080',
} as const;

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
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.BUTLER_TEAL }
    },
    chief: {
        id: 'chief',
        name: 'ビオラ',
        role: 'chiefMaid',
        emoji: '👑',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.CHIEF_TEAL }
    },
    emma: {
        id: 'emma',
        name: 'エマ',
        role: 'maid',
        emoji: '☕',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.EMMA_BROWN }
    },
    sophia: {
        id: 'sophia',
        name: 'ソフィア',
        role: 'maid',
        emoji: '❄️',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.SOPHIA_BLUE }
    },
    lily: {
        id: 'lily',
        name: 'リリー',
        role: 'maid',
        emoji: '🎀',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.LILY_PINK }
    },
    rose: {
        id: 'rose',
        name: 'ローズ',
        role: 'maid',
        emoji: '🌹',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.ROSE_RED }
    },
    alice: {
        id: 'alice',
        name: 'アリス',
        role: 'maid',
        emoji: '✨',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.ALICE_GOLD }
    },
    may: {
        id: 'may',
        name: 'メイ',
        role: 'maid',
        emoji: '🕊️',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.MAY_GREY }
    },
    flora: {
        id: 'flora',
        name: 'フローラ',
        role: 'maid',
        emoji: '🌿',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.FLORA_GREEN }
    },
    luna: {
        id: 'luna',
        name: 'ルナ',
        role: 'maid',
        emoji: '🌙',
        color: { bg: AGENT_COLOR_PALETTE.BG_PRIMARY, accent: AGENT_COLOR_PALETTE.LUNA_PURPLE }
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
 *
 * ⚠️ 一貫性注意: この定義は maid-agent-messenger パッケージ
 *    (packages/maid-agent-messenger/src/types/index.ts の MAID_IDS) と
 *    同じ値・同じ順序を維持する必要があります。変更時は両方を更新してください。
 *    一貫性テスト: src/utils/__tests__/maid-id-consistency.test.ts
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
