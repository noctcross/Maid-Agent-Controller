/**
 * 環境状態管理ユーティリティ
 *
 * 環境（WSL/Windows）のセットアップ状態を管理する関数群。
 * 元々 setup/global-config.ts に定義されていたが、
 * utils/server-manager.ts からの循環依存を解消するために分離。
 *
 * 依存方向: environment-status.ts → setup/global-config.ts（一方向のみ）
 */
import { loadGlobalConfig, getGlobalConfigPath, saveGlobalConfig } from '../setup/global-config';
import type { SetupContext, RuntimeMode } from '../types';

// =============================================================================
// 型定義
// =============================================================================

export type EnvironmentType = 'wsl' | 'windows';
export type EnvironmentStatus = 'none' | 'target' | 'ready';

// =============================================================================
// 環境状態の取得
// =============================================================================

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

// =============================================================================
// 環境状態の設定
// =============================================================================

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
 * RuntimeMode に対応する環境すべてにステータスを設定
 *
 * runtimeMode の値に応じて、対応する環境（wsl / windows / 両方）の
 * ステータスを一括で設定する。重複パターンの解消用ヘルパー。
 */
export function setEnvironmentStatusForMode(
    runtimeMode: RuntimeMode,
    status: EnvironmentStatus,
    ctx?: SetupContext,
): void {
    if (runtimeMode === 'wsl' || runtimeMode === 'both') {
        setEnvironmentStatus('wsl', status, ctx);
    }
    if (runtimeMode === 'windows-native' || runtimeMode === 'both') {
        setEnvironmentStatus('windows', status, ctx);
    }
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
