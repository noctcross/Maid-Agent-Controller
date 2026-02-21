// types/agent.ts
// エージェント関連の型定義（Single Source of Truth）

/**
 * エージェントの役割
 */
export type AgentRole = 'butler' | 'chiefMaid' | 'maid';

/**
 * メイドID（8人）
 */
export type MaidId =
    | 'emma'
    | 'sophia'
    | 'lily'
    | 'rose'
    | 'alice'
    | 'may'
    | 'flora'
    | 'luna';

/**
 * 全エージェントID（butler + chief + メイド8人）
 */
export type AgentId = 'butler' | 'chief' | MaidId;

/**
 * エージェント色設定
 */
export interface AgentColorConfig {
    bg: string;      // 背景色
    accent: string;  // アクセント色
}

/**
 * エージェント設定
 */
export interface AgentConfig {
    id: AgentId;
    name: string;
    role: AgentRole;
    emoji: string;
    color: AgentColorConfig;
}

/**
 * メイド設定（AgentConfig の部分型）
 */
export interface MaidConfig extends AgentConfig {
    id: MaidId;
    role: 'maid';
}
