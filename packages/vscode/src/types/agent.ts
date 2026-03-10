// types/agent.ts
// エージェント関連の型定義

// 基本型は @maid-agent/constants から re-export
export type { MaidId, AgentId } from '@maid-agent/constants';

/**
 * エージェントの役割（VSCode拡張固有）
 */
export type AgentRole = 'butler' | 'chiefMaid' | 'maid';

/**
 * エージェント色設定（VSCode拡張固有: bg/accent形式）
 */
export interface AgentColorConfig {
    bg: string;      // 背景色
    accent: string;  // アクセント色
}

/**
 * エージェント設定（VSCode拡張固有: 色設定を拡張）
 */
export interface AgentConfig {
    id: import('@maid-agent/constants').AgentId;
    name: string;
    role: AgentRole;
    emoji: string;
    color: AgentColorConfig;
}

/**
 * メイド設定（AgentConfig の部分型）
 */
export interface MaidConfig extends AgentConfig {
    id: import('@maid-agent/constants').MaidId;
    role: 'maid';
}
