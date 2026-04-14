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

export interface ProviderBedrockConfig {
    region?: string;
    profile?: string;
    base_url?: string;
}

export interface ProviderVertexConfig {
    project_id?: string;
    region?: string;
    base_url?: string;
}

export interface ProviderCustomConfig {
    base_url?: string;
    /** ANTHROPIC_AUTH_TOKEN を解決するための環境変数名 */
    auth_token_env?: string;
}

export interface ProviderConfig {
    type?: 'anthropic' | 'bedrock' | 'vertex' | 'custom';
    bedrock?: ProviderBedrockConfig;
    vertex?: ProviderVertexConfig;
    custom?: ProviderCustomConfig;
}

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
    provider?: ProviderConfig;
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
            provider: parsed.provider,
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
 * settings.yaml の provider 設定から Claude Code に渡す環境変数を生成する
 * - anthropic / 未設定: 空オブジェクト（デフォルト動作を維持）
 * - bedrock: CLAUDE_CODE_USE_BEDROCK=1 + AWS 関連変数
 * - vertex: CLAUDE_CODE_USE_VERTEX=1 + GCP 関連変数
 * - custom: ANTHROPIC_BASE_URL + 任意の AUTH_TOKEN
 */
export function getProviderEnvVars(settings: MaidAgentSettings | undefined): Record<string, string> {
    const provider = settings?.provider;
    if (!provider?.type || provider.type === 'anthropic') {
        return {};
    }

    switch (provider.type) {
        case 'bedrock': {
            const envVars: Record<string, string> = { CLAUDE_CODE_USE_BEDROCK: '1' };
            if (provider.bedrock?.region) {
                envVars['AWS_REGION'] = provider.bedrock.region;
            }
            if (provider.bedrock?.profile) {
                envVars['AWS_PROFILE'] = provider.bedrock.profile;
            }
            if (provider.bedrock?.base_url) {
                envVars['ANTHROPIC_BEDROCK_BASE_URL'] = provider.bedrock.base_url;
            }
            return envVars;
        }
        case 'vertex': {
            const envVars: Record<string, string> = { CLAUDE_CODE_USE_VERTEX: '1' };
            if (provider.vertex?.region) {
                envVars['CLOUD_ML_REGION'] = provider.vertex.region;
            }
            if (provider.vertex?.project_id) {
                envVars['ANTHROPIC_VERTEX_PROJECT_ID'] = provider.vertex.project_id;
            }
            if (provider.vertex?.base_url) {
                envVars['ANTHROPIC_VERTEX_BASE_URL'] = provider.vertex.base_url;
            }
            return envVars;
        }
        case 'custom': {
            const envVars: Record<string, string> = {};
            if (provider.custom?.base_url) {
                envVars['ANTHROPIC_BASE_URL'] = provider.custom.base_url;
            }
            if (provider.custom?.auth_token_env) {
                const token = process.env[provider.custom.auth_token_env];
                if (token) {
                    envVars['ANTHROPIC_AUTH_TOKEN'] = token;
                }
            }
            return envVars;
        }
        default:
            return {};
    }
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
