import { MaidConfig } from './types';

// =============================================================================
// 定数
// =============================================================================

export const MAID_AGENT_DIR = '.maid-agent';
export const GLOBAL_MAID_AGENT_DIR = '.maid-agent';  // ~/.maid-agent/
export const TMUX_SESSION_PREFIX = 'maid-agent';  // tmuxセッション名のプレフィックス

export const MAIDS_MAP: { [key: string]: MaidConfig } = {
    emma: { name: 'エマ', id: 'emma', emoji: '🌸' },
    sophia: { name: 'ソフィア', id: 'sophia', emoji: '📚' },
    lily: { name: 'リリー', id: 'lily', emoji: '🎨' },
    rose: { name: 'ローズ', id: 'rose', emoji: '🌹' },
    alice: { name: 'アリス', id: 'alice', emoji: '🔧' },
    may: { name: 'メイ', id: 'may', emoji: '🍰' },
    flora: { name: 'フローラ', id: 'flora', emoji: '🌷' },
    luna: { name: 'ルナ', id: 'luna', emoji: '🌙' },
};

export const DEFAULT_MAID_ORDER = ['emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'];

// 後方互換性のためのエイリアス（内部で getOrderedMaids() を使用）
export const MAIDS = DEFAULT_MAID_ORDER.map(id => MAIDS_MAP[id]);

// エージェントごとの色設定
export const AGENT_COLORS: { [key: string]: { bg: string; accent: string } } = {
    butler: { bg: '#1a1a2e', accent: '#008080' },      // ティール
    chief: { bg: '#1a1a2e', accent: '#008080' },       // ティール
    emma: { bg: '#1a1a2e', accent: '#8B5A2B' },        // ブラウン
    sophia: { bg: '#1a1a2e', accent: '#4169E1' },      // ブルー
    lily: { bg: '#1a1a2e', accent: '#FFB6C1' },        // ピンク
    rose: { bg: '#1a1a2e', accent: '#DC143C' },        // レッド
    alice: { bg: '#1a1a2e', accent: '#DAA520' },       // ゴールド
    may: { bg: '#1a1a2e', accent: '#808080' },         // グレー
    flora: { bg: '#1a1a2e', accent: '#228B22' },       // グリーン
    luna: { bg: '#1a1a2e', accent: '#800080' },        // パープル
};
