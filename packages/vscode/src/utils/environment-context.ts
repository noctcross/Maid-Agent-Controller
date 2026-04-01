/**
 * EnvironmentContext - 環境判定の一元化
 *
 * 50箇所以上に散在する CURRENT_ENV 判定と関連関数を統合。
 * シングルトンとして提供し、全モジュールから参照可能にする。
 *
 * Phase 2.5 の shell-escape.ts を統合し、エスケープ関連メソッドも提供。
 */
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { ExecutionEnvironment, RuntimeMode } from '../types';
import type { MultiplexerType } from '../multiplexer/interfaces';
import { ShellType, escapeForSendKeys, quoteArg } from './shell-escape';

// =============================================================================
// Interface
// =============================================================================

export interface IEnvironmentContext {
    /** 現在のプラットフォーム */
    readonly platform: ExecutionEnvironment;

    // ─── 判定 ───
    /** Windows-native + windows-native ランタイムモードか */
    isPsmux(runtimeMode?: RuntimeMode): boolean;
    /** WSL環境で動作しているか */
    isWsl(): boolean;
    /** Windows-native環境か */
    isWindowsNative(): boolean;
    /** macOS環境か */
    isMacOS(): boolean;

    // ─── マルチプレクサ ───
    /** マルチプレクサコマンドを取得 */
    getMultiplexerCommand(runtimeMode?: RuntimeMode): string;
    /** マルチプレクサが利用可能か */
    isMultiplexerAvailable(runtimeMode?: RuntimeMode): boolean;
    /** マルチプレクサのバージョンを取得 */
    getMultiplexerVersion(runtimeMode?: RuntimeMode): string | null;
    /** WSLが利用可能か（Windows環境のみ） */
    isWslAvailable(): boolean;
    /** tmux互換チェック（後方互換） */
    isTmuxAvailable(): boolean;

    // ─── パス ───
    /** WindowsパスをWSLパスに変換 */
    windowsToWslPath(windowsPath: string): string;
    /** プロジェクトパスをサーバー（WSL側）向けに正規化 */
    normalizePathForServer(path: string): string;
    /** WSL前置が必要か */
    needsWslPrefix(runtimeMode?: RuntimeMode): boolean;

    // ─── シェルエスケープ ───
    /** 現在の環境に対応するシェル種別 */
    getShellType(runtimeMode?: RuntimeMode): ShellType;
    /** send-keys用エスケープ */
    escapeSendKeys(value: string, multiplexerType: MultiplexerType): string;
    /** コマンド引数のクォーティング */
    quoteCommandArg(value: string, runtimeMode?: RuntimeMode): string;
}

// =============================================================================
// Implementation
// =============================================================================

export class EnvironmentContext implements IEnvironmentContext {
    readonly platform: ExecutionEnvironment;

    constructor() {
        this.platform = this.detectEnvironment();
    }

    // ─── 環境検出（private） ───

    private detectEnvironment(): ExecutionEnvironment {
        const platform = os.platform();

        if (platform === 'linux') {
            try {
                const release = fs.readFileSync('/proc/version', 'utf-8').toLowerCase();
                if (release.includes('microsoft') || release.includes('wsl')) {
                    return 'wsl';
                }
            } catch {
                // /proc/versionが読めない場合はネイティブLinuxと判断
            }
            return 'linux';
        } else if (platform === 'win32') {
            return 'windows-native';
        } else if (platform === 'darwin') {
            return 'macos';
        }

        return 'linux'; // フォールバック
    }

    // ─── 判定 ───

    isPsmux(runtimeMode?: RuntimeMode): boolean {
        return this.platform === 'windows-native' && runtimeMode === 'windows-native';
    }

    isWsl(): boolean {
        return this.platform === 'wsl';
    }

    isWindowsNative(): boolean {
        return this.platform === 'windows-native';
    }

    isMacOS(): boolean {
        return this.platform === 'macos';
    }

    // ─── マルチプレクサ ───

    getMultiplexerCommand(runtimeMode?: RuntimeMode): string {
        if (this.platform === 'windows-native') {
            if (runtimeMode === 'windows-native') {
                return 'psmux';
            }
            return 'wsl tmux';
        }
        return 'tmux';
    }

    isMultiplexerAvailable(runtimeMode?: RuntimeMode): boolean {
        try {
            const muxCmd = this.getMultiplexerCommand(runtimeMode);
            if (muxCmd === 'psmux') {
                execSync('powershell.exe -NoProfile -Command "psmux -V"', {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    windowsHide: true,
                });
            } else {
                execSync(`${muxCmd} -V`, { encoding: 'utf-8', stdio: 'pipe' });
            }
            return true;
        } catch {
            // マルチプレクサコマンド実行失敗は未インストールと判定
            return false;
        }
    }

    getMultiplexerVersion(runtimeMode?: RuntimeMode): string | null {
        try {
            const muxCmd = this.getMultiplexerCommand(runtimeMode);
            if (muxCmd === 'psmux') {
                return execSync('powershell.exe -NoProfile -Command "psmux -V"', {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    windowsHide: true,
                }).trim();
            }
            return execSync(`${muxCmd} -V`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        } catch {
            // バージョン取得失敗
            return null;
        }
    }

    isWslAvailable(): boolean {
        if (this.platform !== 'windows-native') {
            return true;
        }

        try {
            execSync('wsl --status', { encoding: 'utf-8', stdio: 'pipe' });
            return true;
        } catch {
            try {
                execSync('wsl echo ok', { encoding: 'utf-8', stdio: 'pipe' });
                return true;
            } catch {
                // WSLが利用不可
                return false;
            }
        }
    }

    isTmuxAvailable(): boolean {
        return this.isMultiplexerAvailable();
    }

    // ─── パス ───

    windowsToWslPath(windowsPath: string): string {
        if (windowsPath.startsWith('/')) {
            return windowsPath;
        }

        const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
        if (match) {
            const driveLetter = match[1].toLowerCase();
            const restPath = match[2].replace(/\\/g, '/');
            return `/mnt/${driveLetter}/${restPath}`;
        }

        return windowsPath.replace(/\\/g, '/');
    }

    normalizePathForServer(path: string): string {
        return this.isWindowsNative() ? this.windowsToWslPath(path) : path;
    }

    needsWslPrefix(runtimeMode?: RuntimeMode): boolean {
        return this.platform === 'windows-native' && !this.isPsmux(runtimeMode);
    }

    // ─── シェルエスケープ ───

    getShellType(runtimeMode?: RuntimeMode): ShellType {
        if (this.isPsmux(runtimeMode)) {
            return 'powershell';
        }
        return 'bash';
    }

    escapeSendKeys(value: string, multiplexerType: MultiplexerType): string {
        return escapeForSendKeys(value, multiplexerType);
    }

    quoteCommandArg(value: string, runtimeMode?: RuntimeMode): string {
        return quoteArg(value, this.getShellType(runtimeMode));
    }
}

// =============================================================================
// シングルトンインスタンス
// =============================================================================

/** グローバル EnvironmentContext インスタンス */
export const ENV = new EnvironmentContext();
