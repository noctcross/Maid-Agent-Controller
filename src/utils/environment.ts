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
 * tmuxが利用可能な環境かチェック
 */
export function isTmuxAvailable(): boolean {
    try {
        if (CURRENT_ENV === 'windows-native') {
            execSync('wsl tmux -V', { encoding: 'utf-8', stdio: 'pipe' });
        } else {
            execSync('tmux -V', { encoding: 'utf-8', stdio: 'pipe' });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * tmuxのバージョンを取得
 */
export function getTmuxVersion(): string | null {
    try {
        if (CURRENT_ENV === 'windows-native') {
            return execSync('wsl tmux -V', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        } else {
            return execSync('tmux -V', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        }
    } catch {
        return null;
    }
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
