/**
 * settings.yaml のパーサー・モデル解決ユーティリティ
 * Phase 1: LLM指定オプション機能（#146）
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

// =============================================================================
// 型定義
// =============================================================================

export interface MaidAgentSettings {
    language: string;
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
