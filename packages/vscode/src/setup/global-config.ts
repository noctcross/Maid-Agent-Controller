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
// 環境状態管理
// =============================================================================
// EnvironmentType, EnvironmentStatus, getEnvironmentStatus, setEnvironmentStatus,
// getReadyEnvironments, isEnvironmentReady は utils/environment-status.ts に移動
// （循環依存解消: utils/ → setup/ の依存方向逆転を修正）
