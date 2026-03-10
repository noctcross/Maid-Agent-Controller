// utils/agents.ts
// エージェント関連定数（@maid-agent/constants を拡張）

import {
    AGENTS,
    MAID_IDS,
    type AgentId,
    type MaidId,
    isValidAgentId as constantsIsValidAgentId,
    isValidMaidId as constantsIsValidMaidId,
} from '@maid-agent/constants';
import type { AgentConfig, AgentColorConfig } from '../types/agent';

/**
 * エージェントカラーパレット（VSCode拡張固有）
 * 各エージェント固有のアクセントカラーを定義
 */
export const AGENT_COLOR_PALETTE = {
    // 共通背景色
    BG_PRIMARY: '#1a1a2e',

    // エージェント固有アクセントカラー（@maid-agent/constants と同期）
    BUTLER_TEAL: AGENTS.butler.color,
    CHIEF_TEAL: AGENTS.chief.color,
    EMMA_BROWN: AGENTS.emma.color,
    SOPHIA_BLUE: AGENTS.sophia.color,
    LILY_PINK: AGENTS.lily.color,
    ROSE_RED: AGENTS.rose.color,
    ALICE_GOLD: AGENTS.alice.color,
    MAY_GREY: AGENTS.may.color,
    FLORA_GREEN: AGENTS.flora.color,
    LUNA_PURPLE: AGENTS.luna.color,
} as const;

/**
 * エージェントの役割をVSCode形式に変換
 */
function toVSCodeRole(role: string): 'butler' | 'chiefMaid' | 'maid' {
    if (role === '執事') return 'butler';
    if (role === 'メイド長') return 'chiefMaid';
    return 'maid';
}

/**
 * 全エージェント情報のマスターデータ（VSCode拡張形式）
 * @maid-agent/constants の情報を拡張（色を bg/accent 形式に変換）
 */
export const AGENTS_MAP: Record<AgentId, AgentConfig> = Object.fromEntries(
    Object.entries(AGENTS).map(([id, agent]) => [
        id,
        {
            id: agent.id,
            name: agent.name,
            role: toVSCodeRole(agent.role),
            emoji: agent.emoji,
            color: {
                bg: AGENT_COLOR_PALETTE.BG_PRIMARY,
                accent: agent.color,
            },
        } as AgentConfig,
    ])
) as Record<AgentId, AgentConfig>;

/**
 * メイドのみのマップ（後方互換）
 */
export const MAIDS_MAP: { [key: string]: AgentConfig } = Object.fromEntries(
    MAID_IDS.map(id => [id, AGENTS_MAP[id]])
);

/**
 * メイドIDの配列（後方互換）
 * @maid-agent/constants の MAID_IDS を使用
 */
export const DEFAULT_MAID_ORDER: MaidId[] = [...MAID_IDS];

/**
 * エージェント色マップ（後方互換）
 */
export const AGENT_COLORS: { [key: string]: AgentColorConfig } = Object.fromEntries(
    Object.entries(AGENTS_MAP).map(([id, config]) => [id, config.color])
);

// ユーティリティ関数
export function getAgent(id: AgentId): AgentConfig | undefined {
    return AGENTS_MAP[id];
}

export function getMaids(): AgentConfig[] {
    return MAID_IDS.map(id => AGENTS_MAP[id]);
}

export function isValidAgentId(id: string): id is AgentId {
    return constantsIsValidAgentId(id);
}

export function isValidMaidId(id: string): id is MaidId {
    return constantsIsValidMaidId(id);
}
