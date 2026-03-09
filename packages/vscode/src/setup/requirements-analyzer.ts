/**
 * グローバル設定の事前調査モジュール
 *
 * フェーズ1: 事前調査（自動・ユーザー操作なし）
 * - 各種インストール状況を自動判定
 * - 必要な操作リストを生成
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext, ExecutionEnvironment } from '../types';
import { CURRENT_ENV } from '../utils/environment';
import { detectPackageManager, PackageManager } from '../utils/package-manager';
import { runShellCommand, getMessengerPath } from './pm2-setup';

// =============================================================================
// 型定義
// =============================================================================

export interface GlobalRequirements {
    // 環境情報
    platform: ExecutionEnvironment;
    packageManager: PackageManager;

    // 必要な操作（trueなら実行が必要）
    needs: {
        wslInstall: boolean;        // Windows only
        ubuntuInstall: boolean;     // Windows only
        passwordlessSudo: boolean;
        jqInstall: boolean;
        yqInstall: boolean;
        pm2Install: boolean;
        pm2Startup: boolean;
        pathSetup: boolean;
    };

    // sudo操作が必要か（パスワード入力要否の判定）
    needsSudoPassword: boolean;

    // 致命的エラー（続行不可）
    fatalError?: {
        type: 'wsl_not_installed' | 'ubuntu_not_installed' | 'node_not_found';
        message: string;
        guidance: string;
    };
}

// =============================================================================
// チェック関数（個別エクスポート）
// =============================================================================

/**
 * WSLインストール済みか確認（Windows only）
 */
export function checkWslInstalled(): boolean {
    if (CURRENT_ENV !== 'windows-native') return true;

    try {
        execSync('wsl.exe --version', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Ubuntuディストロインストール済みか確認（Windows only）
 */
export function checkUbuntuInstalled(): boolean {
    if (CURRENT_ENV !== 'windows-native') return true;

    try {
        const result = execSync('wsl.exe -l -q', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
        return result.toLowerCase().includes('ubuntu');
    } catch {
        return false;
    }
}

/**
 * パスワードレスsudoが設定済みか確認
 */
export function checkPasswordlessSudoConfigured(): boolean {
    try {
        if (CURRENT_ENV === 'windows-native') {
            // WSL経由
            execSync('wsl bash -lc "sudo -n true 2>/dev/null"', { stdio: 'pipe', timeout: 5000 });
        } else {
            // ネイティブ
            execSync('sudo -n true 2>/dev/null', { stdio: 'pipe', timeout: 5000 });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * jqインストール済みか確認
 */
export function checkJqInstalledSimple(): boolean {
    try {
        if (CURRENT_ENV === 'windows-native') {
            execSync('wsl bash -lc "which jq"', { stdio: 'pipe', timeout: 5000 });
        } else {
            execSync('which jq', { stdio: 'pipe', timeout: 5000 });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * yqインストール済みか確認
 */
export function checkYqInstalledSimple(): boolean {
    try {
        if (CURRENT_ENV === 'windows-native') {
            execSync('wsl bash -lc "which yq"', { stdio: 'pipe', timeout: 5000 });
        } else {
            execSync('which yq', { stdio: 'pipe', timeout: 5000 });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * pm2インストール済みか確認
 */
export function checkPm2Installed(): boolean {
    try {
        runShellCommand('which pm2', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * pm2 startup設定済みか確認
 */
export function checkPm2StartupConfigured(): boolean {
    try {
        const output = runShellCommand('pm2 startup 2>&1');
        // 'already' が含まれていれば設定済み
        return output.includes('already');
    } catch {
        // pm2がない場合も含め、未設定扱い
        return false;
    }
}

/**
 * PATH設定済みか確認
 */
export function checkPathConfigured(): boolean {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) return false;

    // .zshrc または .bashrc に PATH 設定があるか確認
    const shellConfigs = ['.zshrc', '.bashrc'];
    const maidAgentPath = '.maid-agent/bin';

    for (const config of shellConfigs) {
        const configPath = path.join(homeDir, config);
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                if (content.includes(maidAgentPath)) {
                    return true;
                }
            } catch {
                // 読み取りエラーは無視
            }
        }
    }

    return false;
}

// =============================================================================
// メイン分析関数
// =============================================================================

/**
 * グローバル設定の事前調査を実行
 * @param ctx SetupContext
 * @returns GlobalRequirements
 */
export async function analyzeRequirements(ctx: SetupContext): Promise<GlobalRequirements> {
    ctx.log('[Global] 事前調査開始');

    const requirements: GlobalRequirements = {
        platform: CURRENT_ENV,
        packageManager: detectPackageManager(getMessengerPath()),
        needs: {
            wslInstall: false,
            ubuntuInstall: false,
            passwordlessSudo: false,
            jqInstall: false,
            yqInstall: false,
            pm2Install: false,
            pm2Startup: false,
            pathSetup: false,
        },
        needsSudoPassword: false,
    };

    // Windows環境のWSLチェック
    if (CURRENT_ENV === 'windows-native') {
        const wslInstalled = checkWslInstalled();
        const ubuntuInstalled = wslInstalled && checkUbuntuInstalled();

        requirements.needs.wslInstall = !wslInstalled;
        requirements.needs.ubuntuInstall = wslInstalled && !ubuntuInstalled;

        // WSL/Ubuntu未インストールは致命的エラー
        if (!wslInstalled) {
            requirements.fatalError = {
                type: 'wsl_not_installed',
                message: 'WSL2がインストールされていません',
                guidance: '以下を管理者権限のPowerShellで実行後、再起動してください:\nwsl --install',
            };
            ctx.log('[Global] 致命的エラー: WSL未インストール');
            return requirements;
        }

        if (!ubuntuInstalled) {
            requirements.fatalError = {
                type: 'ubuntu_not_installed',
                message: 'Ubuntuがインストールされていません',
                guidance: 'Microsoft Storeから「Ubuntu」をインストールしてください',
            };
            ctx.log('[Global] 致命的エラー: Ubuntu未インストール');
            return requirements;
        }
    }

    // 各項目のチェック
    requirements.needs.passwordlessSudo = !checkPasswordlessSudoConfigured();
    ctx.log(`[Global] パスワードレスsudo: ${requirements.needs.passwordlessSudo ? '未設定' : '設定済み'}`);

    requirements.needs.jqInstall = !checkJqInstalledSimple();
    ctx.log(`[Global] jq: ${requirements.needs.jqInstall ? '未インストール' : 'インストール済み'}`);

    requirements.needs.yqInstall = !checkYqInstalledSimple();
    ctx.log(`[Global] yq: ${requirements.needs.yqInstall ? '未インストール' : 'インストール済み'}`);

    requirements.needs.pm2Install = !checkPm2Installed();
    ctx.log(`[Global] pm2: ${requirements.needs.pm2Install ? '未インストール' : 'インストール済み'}`);

    // pm2がインストール済みの場合のみstartup確認
    if (!requirements.needs.pm2Install) {
        requirements.needs.pm2Startup = !checkPm2StartupConfigured();
        ctx.log(`[Global] pm2 startup: ${requirements.needs.pm2Startup ? '未設定' : '設定済み'}`);
    } else {
        requirements.needs.pm2Startup = true; // pm2がないならstartupも必要
    }

    requirements.needs.pathSetup = !checkPathConfigured();
    ctx.log(`[Global] PATH: ${requirements.needs.pathSetup ? '未設定' : '設定済み'}`);

    // sudo操作が必要かどうか
    requirements.needsSudoPassword =
        !checkPasswordlessSudoConfigured() && (
            requirements.needs.passwordlessSudo ||
            requirements.needs.jqInstall ||
            requirements.needs.yqInstall ||
            requirements.needs.pm2Install ||
            requirements.needs.pm2Startup
        );

    ctx.log(`[Global] sudoパスワード必要: ${requirements.needsSudoPassword ? 'はい' : 'いいえ'}`);
    ctx.log('[Global] 事前調査完了');

    return requirements;
}

/**
 * 実行が必要な項目数を取得
 */
export function countRequiredSteps(requirements: GlobalRequirements): number {
    let count = 0;
    if (requirements.needs.passwordlessSudo) count++;
    if (requirements.needs.jqInstall) count++;
    if (requirements.needs.yqInstall) count++;
    if (requirements.needs.pm2Install) count++;
    if (requirements.needs.pm2Startup) count++;
    if (requirements.needs.pathSetup) count++;
    return count;
}

/**
 * すべて設定済みかどうか
 */
export function isAllConfigured(requirements: GlobalRequirements): boolean {
    return countRequiredSteps(requirements) === 0;
}
