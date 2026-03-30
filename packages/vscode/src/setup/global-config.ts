/**
 * グローバル設定ファイルの読み書き・環境状態管理
 *
 * 設定YAML（maid-agent-messenger.yaml）の読み書き、
 * ランタイムモードの保存・取得、環境のセットアップ状態管理を担当。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { SetupContext, RuntimeMode } from '../types';
import { getGlobalMaidAgentPath } from '../utils/helpers';

// =============================================================================
// 型定義
// =============================================================================

/**
 * グローバル設定ファイルの構造
 */
export interface GlobalConfig {
    server?: {
        port?: number;
        host?: string;
    };
    /** @deprecated Use environments instead */
    runtime?: {
        mode?: RuntimeMode;
    };
    /** 各環境のセットアップ状態 */
    environments?: {
        wsl?: { status: 'none' | 'target' | 'ready' };
        windows?: { status: 'none' | 'target' | 'ready' };
    };
    dashboard?: {
        editor?: string;
    };
    keepalive?: {
        http_keepalive_timeout?: number;
        http_headers_timeout?: number;
        ping_interval?: number;
    };
}

// =============================================================================
// 設定ファイルの読み書き
// =============================================================================

/**
 * グローバル設定ファイルのパスを取得
 */
export function getGlobalConfigPath(): string {
    const globalPath = getGlobalMaidAgentPath();
    return path.join(globalPath, 'system', 'config', 'maid-agent-messenger.yaml');
}

/**
 * グローバル設定を読み込む
 */
export function loadGlobalConfig(): GlobalConfig {
    const configPath = getGlobalConfigPath();
    console.log(`[Global] loadGlobalConfig: path=${configPath}`);
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            console.log(`[Global] loadGlobalConfig: content=${content}`);
            return YAML.parse(content) as GlobalConfig || {};
        } else {
            console.log(`[Global] loadGlobalConfig: file does not exist`);
        }
    } catch (error) {
        console.error('[Global] 設定ファイル読み込みエラー:', error);
    }
    return {};
}

/**
 * グローバル設定を保存
 */
export function saveGlobalConfig(config: GlobalConfig): void {
    const configPath = getGlobalConfigPath();
    const configDir = path.dirname(configPath);

    console.log(`[Global] saveGlobalConfig: path=${configPath}`);
    console.log(`[Global] saveGlobalConfig: content=${JSON.stringify(config)}`);

    // ディレクトリがなければ作成
    if (!fs.existsSync(configDir)) {
        console.log(`[Global] Creating directory: ${configDir}`);
        fs.mkdirSync(configDir, { recursive: true });
    }

    const content = YAML.stringify(config);
    fs.writeFileSync(configPath, content, 'utf-8');
    console.log(`[Global] Config saved successfully`);
}

/**
 * ランタイムモードを設定ファイルに保存
 */
export function saveRuntimeMode(mode: RuntimeMode, ctx: SetupContext): void {
    const config = loadGlobalConfig();
    if (!config.runtime) {
        config.runtime = {};
    }
    config.runtime.mode = mode;
    saveGlobalConfig(config);
    ctx.log(`[Global] ランタイムモード保存: ${mode}`);
}

/**
 * 保存されているランタイムモードを取得
 * @deprecated Use getEnvironmentStatus instead
 */
export function getSavedRuntimeMode(): RuntimeMode | undefined {
    const config = loadGlobalConfig();
    return config.runtime?.mode;
}

// =============================================================================
// 環境状態管理（新方式）
// =============================================================================

export type EnvironmentType = 'wsl' | 'windows';
export type EnvironmentStatus = 'none' | 'target' | 'ready';

/**
 * 環境のセットアップ状態を取得
 */
export function getEnvironmentStatus(env: EnvironmentType): EnvironmentStatus {
    const configPath = getGlobalConfigPath();
    const config = loadGlobalConfig();

    console.log(`[Global] getEnvironmentStatus: env=${env}, configPath=${configPath}`);
    console.log(`[Global] config.environments=${JSON.stringify(config.environments)}`);
    console.log(`[Global] config.runtime=${JSON.stringify(config.runtime)}`);

    // 新方式の environments があればそれを使う
    if (config.environments?.[env]?.status) {
        console.log(`[Global] Using new environments style: ${config.environments[env]!.status}`);
        return config.environments[env]!.status;
    }

    // 旧方式 runtime.mode からマイグレーション
    if (config.runtime?.mode) {
        const mode = config.runtime.mode;
        let status: EnvironmentStatus;
        if (env === 'wsl') {
            status = (mode === 'wsl' || mode === 'both') ? 'ready' : 'none';
        } else {
            status = (mode === 'windows-native' || mode === 'both') ? 'ready' : 'none';
        }
        console.log(`[Global] Migrating from runtime.mode=${mode}: ${env}=${status}`);
        return status;
    }

    console.log(`[Global] No config found, returning 'none'`);
    return 'none';
}

/**
 * 環境のセットアップ状態を設定
 */
export function setEnvironmentStatus(
    env: EnvironmentType,
    status: EnvironmentStatus,
    ctx?: SetupContext
): void {
    const config = loadGlobalConfig();

    if (!config.environments) {
        config.environments = {};
    }
    if (!config.environments[env]) {
        config.environments[env] = { status: 'none' };
    }
    config.environments[env]!.status = status;

    saveGlobalConfig(config);
    ctx?.log(`[Global] 環境状態更新: ${env} = ${status}`);
}

/**
 * ready 状態の環境一覧を取得
 */
export function getReadyEnvironments(): EnvironmentType[] {
    const result: EnvironmentType[] = [];
    if (getEnvironmentStatus('wsl') === 'ready') result.push('wsl');
    if (getEnvironmentStatus('windows') === 'ready') result.push('windows');
    return result;
}

/**
 * 指定した環境が使用可能かチェック
 */
export function isEnvironmentReady(env: EnvironmentType): boolean {
    return getEnvironmentStatus(env) === 'ready';
}
