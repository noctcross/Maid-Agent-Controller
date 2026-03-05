// =============================================================================
// 定数
// =============================================================================

export const MAID_AGENT_DIR = '.maid-agent';
export const GLOBAL_MAID_AGENT_DIR = '.maid-agent';  // ~/.maid-agent/
export const TMUX_SESSION_PREFIX = 'maid-agent';  // tmuxセッション名のプレフィックス
export const WEB_DASHBOARD_POLLING_INTERVAL = 10000;  // Webダッシュボード自動更新間隔（10秒）
export const DASHBOARD_MAX_CONSECUTIVE_FAILURES = 3;  // エラー画面表示までの連続失敗回数
export const DASHBOARD_SERVER_PORT = 3100;
export const DASHBOARD_SERVER_URL = `http://localhost:${DASHBOARD_SERVER_PORT}`;

// B案ディレクトリ構造のサブパス
export const NOTIFICATIONS_SUBDIR = 'system/data/notifications';
export const MAID_DATA_SUBDIR = 'system/data/maid';
export const INSTRUCTIONS_SUBDIR = 'agents/instructions';
export const CONFIG_SUBDIR = 'system/config';

// =============================================================================
// エージェント関連定数（utils/agents.ts から re-export）
// =============================================================================
export {
    AGENTS_MAP,
    MAIDS_MAP,
    DEFAULT_MAID_ORDER,
    AGENT_COLORS,
    getAgent,
    getMaids,
    isValidAgentId,
    isValidMaidId
} from './utils/agents';

export type {
    AgentId,
    MaidId,
    AgentRole,
    AgentConfig,
    AgentColorConfig,
    MaidConfig
} from './types/agent';

// 後方互換性のためのエイリアス
import { getMaids } from './utils/agents';
export const MAIDS = getMaids();
