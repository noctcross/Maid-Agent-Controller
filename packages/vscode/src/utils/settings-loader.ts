/**
 * settings.yaml のパーサー・モデル解決ユーティリティ
 * Phase 1: LLM指定オプション機能（#146）
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// =============================================================================
// 型定義
// =============================================================================

export interface MaidAgentSettings {
    language: string;
    multiplexer?: {
        type?: 'tmux' | 'psmux' | 'auto';
    };
    model?: {
        default?: string;
        roles?: {
            butler?: string;
            chief?: string;
            maid?: string;
        };
        agents?: Record<string, string>;
    };
}

// =============================================================================
// 定数
// =============================================================================

const DEFAULT_SETTINGS: MaidAgentSettings = {
    language: 'ja',
};

/** settings.yaml の役割名マッピング（コード上の役割名 → settings.yaml のキー） */
const ROLE_KEY_MAP: Record<string, keyof NonNullable<NonNullable<MaidAgentSettings['model']>['roles']>> = {
    butler: 'butler',
    chiefMaid: 'chief',
    maid: 'maid',
};

// =============================================================================
// 関数
// =============================================================================

/**
 * settings.yaml を読み込んでパースする
 * ファイルが存在しない場合やパースエラー時はデフォルト設定を返す
 */
export function loadSettings(maidAgentPath: string): MaidAgentSettings {
    const settingsPath = path.join(maidAgentPath, 'system', 'config', 'settings.yaml');

    try {
        if (!fs.existsSync(settingsPath)) {
            return { ...DEFAULT_SETTINGS };
        }

        const content = fs.readFileSync(settingsPath, 'utf-8');
        const parsed = parseYaml(content);

        if (!parsed || typeof parsed !== 'object') {
            return { ...DEFAULT_SETTINGS };
        }

        return {
            language: parsed.language || DEFAULT_SETTINGS.language,
            multiplexer: parsed.multiplexer,
            model: parsed.model,
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * エージェントに適用するモデルを解決する
 * 優先順位: エージェント個別 > 役割別 > グローバルデフォルト > undefined
 */
export function getModelForAgent(
    settings: MaidAgentSettings | undefined,
    agentId: string,
    role: string,
): string | undefined {
    if (!settings?.model) {
        return undefined;
    }

    const { model } = settings;

    // 1. エージェント個別指定
    if (model.agents?.[agentId]) {
        return model.agents[agentId];
    }

    // 2. 役割別指定
    const roleKey = ROLE_KEY_MAP[role] || role;
    if (model.roles?.[roleKey as keyof typeof model.roles]) {
        return model.roles[roleKey as keyof typeof model.roles];
    }

    // 3. グローバルデフォルト
    if (model.default) {
        return model.default;
    }

    return undefined;
}

/**
 * マルチプレクサの種類を設定に保存する
 */
export function saveMultiplexerType(
    maidAgentPath: string,
    type: 'tmux' | 'psmux' | 'auto'
): boolean {
    const settingsPath = path.join(maidAgentPath, 'system', 'config', 'settings.yaml');
    const configDir = path.dirname(settingsPath);

    try {
        // ディレクトリがなければ作成
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // 既存の設定を読み込み
        let settings: Record<string, unknown> = {};
        if (fs.existsSync(settingsPath)) {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            settings = parseYaml(content) || {};
        }

        // multiplexer.type を更新
        if (!settings.multiplexer) {
            settings.multiplexer = {};
        }
        (settings.multiplexer as Record<string, unknown>).type = type;

        // 保存
        fs.writeFileSync(settingsPath, stringifyYaml(settings), 'utf-8');
        return true;
    } catch (error) {
        console.error('[Settings] マルチプレクサ設定の保存に失敗:', error);
        return false;
    }
}
