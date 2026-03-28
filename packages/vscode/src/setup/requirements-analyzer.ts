/**
 * グローバル設定の事前調査モジュール
 *
 * フェーズ1: 事前調査（自動・ユーザー操作なし）
 * - 各種インストール状況を自動判定
 * - 必要な操作リストを生成
 * - ランタイムモード対応
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext, ExecutionEnvironment, RuntimeMode } from '../types';
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
    runtimeMode: RuntimeMode;  // 選択されたランタイムモード

    // 必要な操作（trueなら実行が必要）
    needs: {
        wslInstall: boolean;        // Windows only (WSLモードのみ)
        ubuntuInstall: boolean;     // Windows only (WSLモードのみ)
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
// psmuxモード用チェック関数（Windows-native直接実行）
// =============================================================================

/**
 * jqインストール済みか確認（psmuxモード用）
 * winget経由でインストールされたjqをWindowsのPATHから検索
 */
export function checkJqInstalledPsmux(): boolean {
    try {
        execSync('where jq', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * yqインストール済みか確認（psmuxモード用）
 * winget経由でインストールされたyqをWindowsのPATHから検索
 */
export function checkYqInstalledPsmux(): boolean {
    try {
        execSync('where yq', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * pm2インストール済みか確認（psmuxモード用）
 * npm install -g pm2 でインストールされたpm2をWindowsのPATHから検索
 */
export function checkPm2InstalledPsmux(): boolean {
    try {
        execSync('where pm2', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * PATH設定済みか確認（psmuxモード用）
 * PowerShell $PROFILE に maid-agent/bin パスが設定されているか確認
 */
export function checkPathConfiguredPsmux(): boolean {
    const userProfile = process.env.USERPROFILE;
    if (!userProfile) return false;

    // PowerShell $PROFILE の場所
    // Windows PowerShell: Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1
    // PowerShell Core: Documents\PowerShell\Microsoft.PowerShell_profile.ps1
    const profilePaths = [
        path.join(userProfile, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
        path.join(userProfile, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    ];

    const maidAgentPath = '.maid-agent\\bin';

    for (const profilePath of profilePaths) {
        if (fs.existsSync(profilePath)) {
            try {
                const content = fs.readFileSync(profilePath, 'utf-8');
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
 * @param runtimeMode ランタイムモード（Windows環境でのみ使用）
 * @returns GlobalRequirements
 */
export async function analyzeRequirements(
    ctx: SetupContext,
    runtimeMode: RuntimeMode = 'wsl'
): Promise<GlobalRequirements> {
    ctx.log(`[Global] 事前調査開始 (モード: ${runtimeMode})`);

    const requirements: GlobalRequirements = {
        platform: CURRENT_ENV,
        packageManager: detectPackageManager(getMessengerPath()),
        runtimeMode,
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

    // Windows環境のWSLチェック（WSLモードのみ）
    if (CURRENT_ENV === 'windows-native' && runtimeMode === 'wsl') {
        const wslInstalled = checkWslInstalled();
        const ubuntuInstalled = wslInstalled && checkUbuntuInstalled();

        requirements.needs.wslInstall = !wslInstalled;
        requirements.needs.ubuntuInstall = wslInstalled && !ubuntuInstalled;

        // WSL/Ubuntu未インストールは致命的エラー（WSLモードのみ）
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
    } else if (CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native') {
        // psmuxモード: WSLチェックをスキップ
        ctx.log('[Global] psmuxモード: WSLチェックをスキップ');
    }

    // 各項目のチェック（psmuxモードとWSLモードで分岐）
    const isPsmuxMode = CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native';

    if (isPsmuxMode) {
        // psmuxモード: Windows-native環境で直接チェック
        // passwordlessSudo: Windowsでは不要
        requirements.needs.passwordlessSudo = false;
        ctx.log('[Global] パスワードレスsudo: psmuxモードでは不要');

        requirements.needs.jqInstall = !checkJqInstalledPsmux();
        ctx.log(`[Global] jq (psmux): ${requirements.needs.jqInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needs.yqInstall = !checkYqInstalledPsmux();
        ctx.log(`[Global] yq (psmux): ${requirements.needs.yqInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needs.pm2Install = !checkPm2InstalledPsmux();
        ctx.log(`[Global] pm2 (psmux): ${requirements.needs.pm2Install ? '未インストール' : 'インストール済み'}`);

        // pm2 startup: psmuxモードでは Task Scheduler 設定（Phase 3）
        // 現時点では手動設定を想定してスキップ
        requirements.needs.pm2Startup = false;
        ctx.log('[Global] pm2 startup (psmux): 手動設定を想定（スキップ）');

        requirements.needs.pathSetup = !checkPathConfiguredPsmux();
        ctx.log(`[Global] PATH (psmux): ${requirements.needs.pathSetup ? '未設定' : '設定済み'}`);

        // psmuxモードではsudoパスワード不要
        requirements.needsSudoPassword = false;
    } else {
        // WSLモード: 従来通りのチェック
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
    }

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
