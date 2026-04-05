/**
 * 環境検出ユーティリティ（後方互換ラッパー）
 *
 * 実際の環境判定ロジックは EnvironmentContext (environment-context.ts) に集約。
 * 本モジュールは後方互換のため、既存のエクスポートを維持する。
 *
 * 新規コードは EnvironmentContext (ENV) を直接使用すること。
 * @see environment-context.ts
 */
import { ENV, EnvironmentContext, IEnvironmentContext } from './environment-context';
import { ExecutionEnvironment } from '../types';

// =============================================================================
// EnvironmentContext の re-export
// =============================================================================

export { ENV, EnvironmentContext, IEnvironmentContext } from './environment-context';
export type { ShellType } from './shell-escape';

// =============================================================================
// 後方互換エクスポート（既存コードの import パスを維持）
// =============================================================================

/**
 * 現在の実行環境を検出
 * @deprecated ENV.platform を使用してください
 */
export function detectEnvironment(): ExecutionEnvironment {
    return ENV.platform;
}

/**
 * 現在の環境をキャッシュ
 * @deprecated ENV.platform を使用してください
 */
export const CURRENT_ENV = ENV.platform;

/**
 * WindowsパスをWSLパスに変換
 * @deprecated ENV.windowsToWslPath() を使用してください
 */
export function windowsToWslPath(windowsPath: string): string {
    return ENV.windowsToWslPath(windowsPath);
}

/**
 * RuntimeMode 型（循環参照回避のため再定義）
 */
type RuntimeModeType = 'wsl' | 'windows-native' | 'both';

/**
 * マルチプレクサが利用可能な環境かチェック
 * @deprecated ENV.isMultiplexerAvailable() を使用してください
 */
export function isMultiplexerAvailable(runtimeMode?: RuntimeModeType): boolean {
    // 後方互換: runtimeMode が指定された場合は一時的に内部状態を上書きして判定
    if (runtimeMode !== undefined) {
        const prev = ENV.getRuntimeMode();
        ENV.setRuntimeMode(runtimeMode as import('../types').RuntimeMode);
        const result = ENV.isMultiplexerAvailable();
        if (prev !== undefined) {
            ENV.setRuntimeMode(prev);
        }
        return result;
    }
    return ENV.isMultiplexerAvailable();
}

/**
 * マルチプレクサのバージョンを取得
 * @deprecated ENV.getMultiplexerVersion() を使用してください
 */
export function getMultiplexerVersion(runtimeMode?: RuntimeModeType): string | null {
    if (runtimeMode !== undefined) {
        const prev = ENV.getRuntimeMode();
        ENV.setRuntimeMode(runtimeMode as import('../types').RuntimeMode);
        const result = ENV.getMultiplexerVersion();
        if (prev !== undefined) {
            ENV.setRuntimeMode(prev);
        }
        return result;
    }
    return ENV.getMultiplexerVersion();
}

/**
 * tmuxが利用可能な環境かチェック
 * @deprecated ENV.isTmuxAvailable() を使用してください
 */
export function isTmuxAvailable(): boolean {
    return ENV.isTmuxAvailable();
}

/**
 * tmuxのバージョンを取得
 * @deprecated ENV.getMultiplexerVersion() を使用してください
 */
export function getTmuxVersion(): string | null {
    return ENV.getMultiplexerVersion();
}

/**
 * WSLが利用可能かチェック
 * @deprecated ENV.isWslAvailable() を使用してください
 */
export function isWslAvailable(): boolean {
    return ENV.isWslAvailable();
}

/**
 * 現在の環境とランタイムモードに基づいてマルチプレクサコマンドを取得
 * @deprecated ENV.getMultiplexerCommand() を使用してください
 */
export function getMultiplexerCommand(runtimeMode?: RuntimeModeType): string {
    // 後方互換: runtimeMode が指定された場合はインライン計算
    if (runtimeMode !== undefined) {
        if (ENV.platform === 'windows-native') {
            return runtimeMode === 'windows-native' ? 'psmux' : 'wsl tmux';
        }
        return 'tmux';
    }
    return ENV.getMultiplexerCommand();
}

/**
 * Psmux モードかどうかを判定
 * @deprecated ENV.isPsmux() を使用してください
 */
export function isPsmuxMode(runtimeMode?: RuntimeModeType): boolean {
    // 後方互換: runtimeMode が指定された場合はインライン計算
    if (runtimeMode !== undefined) {
        return ENV.platform === 'windows-native' && runtimeMode === 'windows-native';
    }
    return ENV.isPsmux();
}
