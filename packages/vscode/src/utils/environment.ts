import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { ExecutionEnvironment } from '../types';

// =============================================================================
// 環境検出
// =============================================================================

/**
 * 現在の実行環境を検出
 */
export function detectEnvironment(): ExecutionEnvironment {
    const platform = os.platform();

    if (platform === 'linux') {
        // WSL内かネイティブLinuxかを判定
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

/**
 * WindowsパスをWSLパスに変換
 * C:\Users\... → /mnt/c/Users/...
 */
export function windowsToWslPath(windowsPath: string): string {
    // 既にWSLパスの場合はそのまま返す
    if (windowsPath.startsWith('/')) {
        return windowsPath;
    }

    // C:\path\to\file → /mnt/c/path/to/file
    const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
    if (match) {
        const driveLetter = match[1].toLowerCase();
        const restPath = match[2].replace(/\\/g, '/');
        return `/mnt/${driveLetter}/${restPath}`;
    }

    // UNCパスなどの場合はそのまま返す
    return windowsPath.replace(/\\/g, '/');
}

/**
 * 現在の環境をキャッシュ
 */
export const CURRENT_ENV = detectEnvironment();

/**
 * マルチプレクサが利用可能な環境かチェック
 * @param runtimeMode ランタイムモード（Windows環境でのみ使用）
 */
export function isMultiplexerAvailable(runtimeMode?: RuntimeModeType): boolean {
    try {
        const muxCmd = getMultiplexerCommand(runtimeMode);
        if (muxCmd === 'psmux') {
            // psmux: PowerShell経由でチェック
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
        return false;
    }
}

/**
 * マルチプレクサのバージョンを取得
 * @param runtimeMode ランタイムモード（Windows環境でのみ使用）
 */
export function getMultiplexerVersion(runtimeMode?: RuntimeModeType): string | null {
    try {
        const muxCmd = getMultiplexerCommand(runtimeMode);
        if (muxCmd === 'psmux') {
            // psmux: PowerShell経由で取得
            return execSync('powershell.exe -NoProfile -Command "psmux -V"', {
                encoding: 'utf-8',
                stdio: 'pipe',
                windowsHide: true,
            }).trim();
        }
        return execSync(`${muxCmd} -V`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch {
        return null;
    }
}

/**
 * tmuxが利用可能な環境かチェック（後方互換）
 * @deprecated isMultiplexerAvailable を使用してください
 */
export function isTmuxAvailable(): boolean {
    return isMultiplexerAvailable();
}

/**
 * tmuxのバージョンを取得（後方互換）
 * @deprecated getMultiplexerVersion を使用してください
 */
export function getTmuxVersion(): string | null {
    return getMultiplexerVersion();
}

/**
 * WSLが利用可能かチェック（Windows環境のみ）
 */
export function isWslAvailable(): boolean {
    if (CURRENT_ENV !== 'windows-native') {
        return true; // Windows以外では常にtrue
    }

    try {
        // WSLが動作しているかチェック
        execSync('wsl --status', { encoding: 'utf-8', stdio: 'pipe' });
        return true;
    } catch {
        try {
            // --statusがない古いバージョン用フォールバック
            execSync('wsl echo ok', { encoding: 'utf-8', stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    }
}

// =============================================================================
// マルチプレクサコマンド
// =============================================================================

/**
 * RuntimeMode 型（循環参照回避のため再定義）
 */
type RuntimeModeType = 'wsl' | 'windows-native' | 'both';

/**
 * 現在の環境とランタイムモードに基づいてマルチプレクサコマンドを取得
 * @param runtimeMode ランタイムモード（Windows環境でのみ使用）
 * @returns 'tmux' | 'psmux' | 'wsl tmux'
 */
export function getMultiplexerCommand(runtimeMode?: RuntimeModeType): string {
    if (CURRENT_ENV === 'windows-native') {
        // Windows環境: ランタイムモードに応じて切り替え
        if (runtimeMode === 'windows-native') {
            return 'psmux';
        }
        // WSL モードまたは未指定の場合は wsl tmux
        return 'wsl tmux';
    }
    // Mac/Linux: ネイティブ tmux
    return 'tmux';
}

/**
 * Psmux モードかどうかを判定
 * @param runtimeMode ランタイムモード
 * @returns Psmux モードの場合 true
 */
export function isPsmuxMode(runtimeMode?: RuntimeModeType): boolean {
    return CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native';
}
