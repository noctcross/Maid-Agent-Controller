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
import { ENV } from '../utils/environment';
import { ENV as ENV_CTX } from '../utils/environment-context';
import { detectPackageManager, PackageManager } from '../utils/package-manager';
import { runShellCommand } from './pm2-setup';
import { getMessengerPath } from '../utils/helpers';

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
        psmuxInstall: boolean;      // Windows only (psmuxモードのみ) - psmux
        nodeInstall: boolean;       // Windows only (psmuxモードのみ) - Node.js
        gitInstall: boolean;        // Windows only (psmuxモードのみ) - Git for Windows
        claudeCodeInstall: boolean; // Claude Code CLI
        passwordlessSudo: boolean;
        jqInstall: boolean;
        yqInstall: boolean;
        pm2Install: boolean;
        pathSetup: boolean;
        // pm2Startup は廃止（オンデマンド起動に変更）
    };

    // sudo操作が必要か（パスワード入力要否の判定）
    needsSudoPassword: boolean;

    // 再起動が必要か（WSLインストール時など）
    requiresReboot: boolean;
}

// =============================================================================
// チェック関数（個別エクスポート）
// =============================================================================

/**
 * WSLインストール済みか確認（Windows only）
 */
export function checkWslInstalled(): boolean {
    if (!ENV.isWindowsNative()) return true;

    try {
        execSync('wsl.exe --version', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        // wsl.exe が存在しない場合は未インストールと判定
        return false;
    }
}

/**
 * Ubuntuディストロインストール済みか確認（Windows only）
 */
export function checkUbuntuInstalled(): boolean {
    if (!ENV.isWindowsNative()) return true;

    try {
        const result = execSync('wsl.exe -l -q', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
        return result.toLowerCase().includes('ubuntu');
    } catch {
        // wsl.exe -l 実行失敗は未インストールと判定
        return false;
    }
}

/**
 * WSLが動作可能か確認（Ubuntu初期設定完了含む）
 * WSL/Ubuntuがインストール済みでも、初期設定が完了していないと動作しない
 */
export function checkWslOperational(): boolean {
    if (!ENV.isWindowsNative()) return true;

    try {
        execSync('wsl bash -c "echo ok"', { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 });
        return true;
    } catch {
        // WSLコマンド実行失敗は動作不可と判定
        return false;
    }
}

/**
 * パスワードレスsudoが設定済みか確認
 */
export function checkPasswordlessSudoConfigured(): boolean {
    try {
        ENV_CTX.commandExecutor.execWithSudoNoPassword('true', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        // sudo -n 失敗はパスワードレスsudo未設定と判定
        return false;
    }
}

/**
 * jqインストール済みか確認
 */
export function checkJqInstalledSimple(): boolean {
    return ENV_CTX.commandExecutor.commandExists('jq');
}

/**
 * yqインストール済みか確認
 */
export function checkYqInstalledSimple(): boolean {
    return ENV_CTX.commandExecutor.commandExists('yq');
}

/**
 * pm2インストール済みか確認
 */
export function checkPm2Installed(): boolean {
    try {
        runShellCommand('which pm2', { stdio: 'pipe' });
        return true;
    } catch {
        // which pm2 失敗は未インストールと判定
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
 * PATH設定済みか確認（WSL/Mac/Linux用）
 * Windows環境ではWSL内の設定を確認
 */
export function checkPathConfigured(): boolean {
    const maidAgentPath = '.maid-agent/bin';

    if (ENV.isWindowsNative()) {
        // Windows: WSL内の .bashrc/.zshrc を確認
        try {
            const result = ENV_CTX.commandExecutor.execInLoginShell(
                "grep -l '.maid-agent/bin' ~/.bashrc ~/.zshrc 2>/dev/null || true",
                { timeout: 5000 }
            );
            return result.length > 0;
        } catch {
            // WSLでのgrep実行失敗はPATH未設定と判定
            return false;
        }
    }

    // Mac/Linux: ローカルの設定ファイルを確認
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) return false;

    const shellConfigs = ['.zshrc', '.bashrc'];

    for (const config of shellConfigs) {
        const configPath = path.join(homeDir, config);
        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                if (content.includes(maidAgentPath)) {
                    return true;
                }
            } catch {
                // 設定ファイルの読み取り権限がない場合は無視して次の設定ファイルを確認
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
        // where jq 失敗は未インストールと判定
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
        // where yq 失敗は未インストールと判定
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
        // where pm2 失敗は未インストールと判定
        return false;
    }
}

/**
 * psmuxインストール済みか確認（psmuxモード用）
 * Windows native マルチプレクサ
 */
export function checkPsmuxInstalled(): boolean {
    try {
        // psmux は tmux エイリアスも提供するため、psmux コマンドで確認
        execSync('where psmux', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        // where psmux 失敗は未インストールと判定
        return false;
    }
}

/**
 * Node.js/npmインストール済みか確認（psmuxモード用）
 * pm2インストールの前提条件
 */
export function checkNodeInstalledPsmux(): boolean {
    try {
        execSync('where node', { stdio: 'pipe', timeout: 5000 });
        execSync('where npm', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        // where node/npm 失敗は未インストールと判定
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
                // プロファイルの読み取り権限がない場合は無視して次のプロファイルを確認
            }
        }
    }

    return false;
}

/**
 * Git for Windows インストール済みか確認（psmuxモード用）
 * Claude Code の前提条件
 */
export function checkGitInstalledPsmux(): boolean {
    try {
        execSync('where git', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        // where git 失敗は未インストールと判定
        return false;
    }
}

/**
 * Claude Code インストール済みか確認（psmuxモード用）
 * ネイティブインストーラでインストールされた claude コマンドを確認
 *
 * Note: `where claude` はcmd.exeのPATHしか見ないため、
 * PowerShellプロファイルで設定されたPATHは検出できない。
 * そのため、インストール先ディレクトリを直接確認する。
 */
export function checkClaudeCodeInstalledPsmux(): boolean {
    try {
        const userProfile = process.env.USERPROFILE || process.env.HOME || '';
        if (!userProfile) return false;

        // Claude Codeのインストール先（複数の可能性をチェック）
        const possiblePaths = [
            path.join(userProfile, '.local', 'bin', 'claude.exe'),  // 新しいインストール先
            path.join(userProfile, '.claude', 'local', 'claude.exe'),  // 古いインストール先
        ];

        return possiblePaths.some(p => fs.existsSync(p));
    } catch {
        // パス確認中のエラーは未インストールと判定
        return false;
    }
}

/**
 * Claude Code の実行パスを取得（psmuxモード用）
 */
export function getClaudeCodePathPsmux(): string | null {
    try {
        const userProfile = process.env.USERPROFILE || process.env.HOME || '';
        if (!userProfile) return null;

        const possiblePaths = [
            path.join(userProfile, '.local', 'bin', 'claude.exe'),
            path.join(userProfile, '.claude', 'local', 'claude.exe'),
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) return p;
        }
        return null;
    } catch {
        // パス確認中のエラーはパス不明と判定
        return null;
    }
}

/**
 * Claude Code インストール済みか確認（WSL/Unix用）
 */
export function checkClaudeCodeInstalledUnix(): boolean {
    return ENV_CTX.commandExecutor.commandExists('claude');
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
        platform: ENV.platform,
        packageManager: detectPackageManager(getMessengerPath(runtimeMode)),
        runtimeMode,
        needs: {
            wslInstall: false,
            ubuntuInstall: false,
            psmuxInstall: false,
            nodeInstall: false,
            gitInstall: false,
            claudeCodeInstall: false,
            passwordlessSudo: false,
            jqInstall: false,
            yqInstall: false,
            pm2Install: false,
            pathSetup: false,
        },
        needsSudoPassword: false,
        requiresReboot: false,
    };

    // モードに応じたWSLチェック
    const needsWslMode = runtimeMode === 'wsl' || runtimeMode === 'both';
    const needsPsmuxMode = runtimeMode === 'windows-native' || runtimeMode === 'both';

    // WSLが必要なモードの場合のチェック
    let wslAvailable = true;
    if (ENV.isWindowsNative() && needsWslMode) {
        const wslInstalled = checkWslInstalled();
        const ubuntuInstalled = wslInstalled && checkUbuntuInstalled();

        requirements.needs.wslInstall = !wslInstalled;
        requirements.needs.ubuntuInstall = wslInstalled && !ubuntuInstalled;

        // WSL未インストールの場合は再起動が必要
        if (!wslInstalled) {
            requirements.requiresReboot = true;
            wslAvailable = false;
            ctx.log('[Global] WSL未インストール: 再起動が必要');
        } else if (!ubuntuInstalled) {
            wslAvailable = false;
            ctx.log('[Global] Ubuntu未インストール');
        }
    }

    if (ENV.isWindowsNative() && needsPsmuxMode && !needsWslMode) {
        // psmuxのみモード: WSLチェックをスキップ
        ctx.log('[Global] psmuxモード: WSLチェックをスキップ');
    }

    // 各項目のチェック（モードに応じて分岐）
    const isPsmuxOnly = ENV.isWindowsNative() && runtimeMode === 'windows-native';

    if (isPsmuxOnly) {
        // psmuxのみモード: Windows-native環境で直接チェック
        requirements.needs.passwordlessSudo = false;
        ctx.log('[Global] パスワードレスsudo: psmuxモードでは不要');

        // psmux チェック（Windows用マルチプレクサ）
        requirements.needs.psmuxInstall = !checkPsmuxInstalled();
        ctx.log(`[Global] psmux: ${requirements.needs.psmuxInstall ? '未インストール' : 'インストール済み'}`);

        // Node.js/npm チェック（pm2インストールの前提条件）
        requirements.needs.nodeInstall = !checkNodeInstalledPsmux();
        ctx.log(`[Global] Node.js (psmux): ${requirements.needs.nodeInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needs.jqInstall = !checkJqInstalledPsmux();
        ctx.log(`[Global] jq (psmux): ${requirements.needs.jqInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needs.yqInstall = !checkYqInstalledPsmux();
        ctx.log(`[Global] yq (psmux): ${requirements.needs.yqInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needs.pm2Install = !checkPm2InstalledPsmux();
        ctx.log(`[Global] pm2 (psmux): ${requirements.needs.pm2Install ? '未インストール' : 'インストール済み'}`);

        requirements.needs.pathSetup = !checkPathConfiguredPsmux();
        ctx.log(`[Global] PATH (psmux): ${requirements.needs.pathSetup ? '未設定' : '設定済み'}`);

        // Git for Windows チェック（Claude Code の前提条件）
        requirements.needs.gitInstall = !checkGitInstalledPsmux();
        ctx.log(`[Global] Git (psmux): ${requirements.needs.gitInstall ? '未インストール' : 'インストール済み'}`);

        // Claude Code チェック
        requirements.needs.claudeCodeInstall = !checkClaudeCodeInstalledPsmux();
        ctx.log(`[Global] Claude Code (psmux): ${requirements.needs.claudeCodeInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needsSudoPassword = false;
    } else if (needsWslMode && !wslAvailable) {
        // WSLモードだがWSL未インストール: すべてインストール必要と仮定
        ctx.log('[Global] WSL未利用可能: WSL内ツールはすべてインストール必要と仮定');
        requirements.needs.passwordlessSudo = true;
        requirements.needs.jqInstall = true;
        requirements.needs.yqInstall = true;
        requirements.needs.pm2Install = true;
        requirements.needs.pathSetup = true;
        requirements.needs.claudeCodeInstall = true;
        // WSLインストール後に再度チェックするため、パスワードは後で確認
        requirements.needsSudoPassword = true;
    } else {
        // WSLモード（WSL利用可能）: 従来通りのチェック
        requirements.needs.passwordlessSudo = !checkPasswordlessSudoConfigured();
        ctx.log(`[Global] パスワードレスsudo: ${requirements.needs.passwordlessSudo ? '未設定' : '設定済み'}`);

        requirements.needs.jqInstall = !checkJqInstalledSimple();
        ctx.log(`[Global] jq: ${requirements.needs.jqInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needs.yqInstall = !checkYqInstalledSimple();
        ctx.log(`[Global] yq: ${requirements.needs.yqInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needs.pm2Install = !checkPm2Installed();
        ctx.log(`[Global] pm2: ${requirements.needs.pm2Install ? '未インストール' : 'インストール済み'}`);

        requirements.needs.pathSetup = !checkPathConfigured();
        ctx.log(`[Global] PATH: ${requirements.needs.pathSetup ? '未設定' : '設定済み'}`);

        // Claude Code チェック（WSL/Unix用）
        requirements.needs.claudeCodeInstall = !checkClaudeCodeInstalledUnix();
        ctx.log(`[Global] Claude Code: ${requirements.needs.claudeCodeInstall ? '未インストール' : 'インストール済み'}`);

        requirements.needsSudoPassword =
            !checkPasswordlessSudoConfigured() && (
                requirements.needs.passwordlessSudo ||
                requirements.needs.jqInstall ||
                requirements.needs.yqInstall ||
                requirements.needs.pm2Install
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
    if (requirements.needs.wslInstall) count++;
    if (requirements.needs.ubuntuInstall) count++;
    if (requirements.needs.psmuxInstall) count++;
    if (requirements.needs.nodeInstall) count++;
    if (requirements.needs.gitInstall) count++;
    if (requirements.needs.claudeCodeInstall) count++;
    if (requirements.needs.passwordlessSudo) count++;
    if (requirements.needs.jqInstall) count++;
    if (requirements.needs.yqInstall) count++;
    if (requirements.needs.pm2Install) count++;
    if (requirements.needs.pathSetup) count++;
    return count;
}

/**
 * すべて設定済みかどうか
 */
export function isAllConfigured(requirements: GlobalRequirements): boolean {
    return countRequiredSteps(requirements) === 0;
}
