// types/agent.ts
// エージェント関連の型定義（Single Source of Truth）

/**
 * エージェントの役割
 */
export type AgentRole = 'butler' | 'chiefMaid' | 'maid';

/**
 * メイドID（8人）
 * ⚠️ 一貫性注意: この定義は packages/maid-agent-messenger/src/types/index.ts の
 *    MAID_IDS と同じ値・同じ順序を維持する必要があります。
 *    変更時は両方を更新してください。
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
 * ⚠️ 一貫性注意: この定義は packages/maid-agent-messenger/src/types/index.ts の
 *    ALL_AGENT_IDS と同じ値を維持する必要があります。
 *    変更時は両方を更新してください。
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
