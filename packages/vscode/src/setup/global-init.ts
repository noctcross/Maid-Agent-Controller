/**
 * グローバル設定モジュール（4フェーズ構造）
 *
 * フェーズ0: モード選択（Windows環境のみ）
 * フェーズ1: 事前調査（自動）
 * フェーズ2: 入力一括取得（ユーザー操作1回）
 * フェーズ3: 自動実行（進捗表示のみ）
 * フェーズ4: 結果表示
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as YAML from 'yaml';
import { SetupContext, RuntimeMode } from '../types';
import { CURRENT_ENV } from '../utils/environment';
import {
    analyzeRequirements,
    GlobalRequirements,
    isAllConfigured,
    countRequiredSteps,
} from './requirements-analyzer';
import {
    showGlobalConfirmation,
    showGlobalSetupResult,
    showRuntimeModeSelection,
    GlobalUserInput,
} from './setup-ui';
import { getGlobalMaidAgentPath } from '../utils/helpers';

// =============================================================================
// 型定義
// =============================================================================

interface StepResult {
    stepId: string;
    success: boolean;
    error?: string;
}

/**
 * グローバル設定ファイルの構造
 */
interface GlobalConfig {
    server?: {
        port?: number;
        host?: string;
    };
    runtime?: {
        mode?: RuntimeMode;
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
function getGlobalConfigPath(): string {
    const globalPath = getGlobalMaidAgentPath();
    return path.join(globalPath, 'system', 'config', 'maid-agent-messenger.yaml');
}

/**
 * グローバル設定を読み込む
 */
function loadGlobalConfig(): GlobalConfig {
    const configPath = getGlobalConfigPath();
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            return YAML.parse(content) as GlobalConfig || {};
        }
    } catch (error) {
        console.error('[Global] 設定ファイル読み込みエラー:', error);
    }
    return {};
}

/**
 * グローバル設定を保存
 */
function saveGlobalConfig(config: GlobalConfig): void {
    const configPath = getGlobalConfigPath();
    const configDir = path.dirname(configPath);

    // ディレクトリがなければ作成
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    const content = YAML.stringify(config);
    fs.writeFileSync(configPath, content, 'utf-8');
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
 */
export function getSavedRuntimeMode(): RuntimeMode | undefined {
    const config = loadGlobalConfig();
    return config.runtime?.mode;
}

interface ExecutionStep {
    id: string;
    progressMessage: string;
    critical: boolean;  // trueなら失敗時に中断
    execute: (ctx: SetupContext, password?: string) => Promise<void>;
}

// =============================================================================
// 実行ステップの定義
// =============================================================================

/**
 * 実行ステップを構築
 */
function buildExecutionSteps(
    requirements: GlobalRequirements,
    skipItems: string[]
): ExecutionStep[] {
    const steps: ExecutionStep[] = [];

    // グローバルテンプレートのコピー（常に実行、最優先）
    steps.push({
        id: 'copyGlobalTemplates',
        progressMessage: 'テンプレートをコピー中...',
        critical: true,
        execute: async (ctx) => {
            await copyGlobalTemplates(ctx);
        },
    });

    // パスワードレスsudo設定
    if (requirements.needs.passwordlessSudo && !skipItems.includes('passwordlessSudo')) {
        steps.push({
            id: 'passwordlessSudo',
            progressMessage: 'パスワードレスsudoを設定中...',
            critical: false,
            execute: async (ctx, password) => {
                await setupPasswordlessSudo(ctx, password);
            },
        });
    }

    // jqインストール（psmuxモードではwinget経由）
    if (requirements.needs.jqInstall && !skipItems.includes('jqInstall')) {
        const runtimeMode = requirements.runtimeMode;
        steps.push({
            id: 'jqInstall',
            progressMessage: runtimeMode === 'windows-native' ? 'jq をwinget経由でインストール中...' : 'jq をインストール中...',
            critical: false,
            execute: async (ctx, password) => {
                await installJq(ctx, password, runtimeMode);
            },
        });
    }

    // yqインストール（psmuxモードではwinget経由）
    if (requirements.needs.yqInstall && !skipItems.includes('yqInstall')) {
        const runtimeMode = requirements.runtimeMode;
        steps.push({
            id: 'yqInstall',
            progressMessage: runtimeMode === 'windows-native' ? 'yq をwinget経由でインストール中...' : 'yq をインストール中...',
            critical: false,
            execute: async (ctx, password) => {
                await installYq(ctx, password, runtimeMode);
            },
        });
    }

    // pm2インストール（psmuxモードではsudo不要）
    if (requirements.needs.pm2Install && !skipItems.includes('pm2Install')) {
        const runtimeMode = requirements.runtimeMode;
        steps.push({
            id: 'pm2Install',
            progressMessage: runtimeMode === 'windows-native' ? 'pm2 をnpm経由でインストール中...' : 'pm2 をインストール中...',
            critical: true,
            execute: async (ctx, password) => {
                await installPm2(ctx, password, runtimeMode);
            },
        });
    }

    // サーバーセットアップ（npm install, pm2 start）
    steps.push({
        id: 'messengerServerSetup',
        progressMessage: 'サーバーをセットアップ中...',
        critical: true,
        execute: async (ctx) => {
            await setupMessengerServer(ctx);
        },
    });

    // pm2 startup設定
    if (requirements.needs.pm2Startup && !skipItems.includes('pm2Startup')) {
        steps.push({
            id: 'pm2Startup',
            progressMessage: '自動起動を設定中...',
            critical: false,
            execute: async (ctx, password) => {
                await setupPm2Startup(ctx, password);
            },
        });
    }

    // maidctlデプロイ
    steps.push({
        id: 'deployMaidctl',
        progressMessage: 'maidctl をデプロイ中...',
        critical: false,
        execute: async (ctx) => {
            await deployMaidctl(ctx);
        },
    });

    // PATH設定（psmuxモードではPowerShell $PROFILEに追加）
    if (requirements.needs.pathSetup && !skipItems.includes('pathSetup')) {
        const runtimeMode = requirements.runtimeMode;
        steps.push({
            id: 'pathSetup',
            progressMessage: runtimeMode === 'windows-native' ? 'PATH をPowerShellプロファイルに設定中...' : 'PATH を設定中...',
            critical: false,
            execute: async (ctx) => {
                await setupPath(ctx, runtimeMode);
            },
        });
    }

    return steps;
}

// =============================================================================
// 各ステップの実行関数
// =============================================================================

/**
 * 設定ファイルの移行
 * mcp-server.yaml → maid-agent-messenger.yaml
 */
function migrateConfigFile(globalPath: string, ctx: SetupContext): void {
    const configDir = path.join(globalPath, 'system', 'config');
    const oldPath = path.join(configDir, 'mcp-server.yaml');
    const newPath = path.join(configDir, 'maid-agent-messenger.yaml');

    // 旧ファイルが存在し、新ファイルが存在しない場合のみ移行
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        try {
            const oldContent = fs.readFileSync(oldPath, 'utf-8');

            // YAML をパース（簡易的にキー・値を抽出）
            const portMatch = oldContent.match(/^\s*port:\s*(\d+)/m);
            const httpKeepaliveMatch = oldContent.match(/^\s*http_keepalive_timeout:\s*(\d+)/m);
            const httpHeadersMatch = oldContent.match(/^\s*http_headers_timeout:\s*(\d+)/m);
            const pingIntervalMatch = oldContent.match(/^\s*ping_interval:\s*(\d+)/m);

            // 新しい形式で設定ファイルを生成
            const newContent = `# Maid Agent Messenger グローバル設定ファイル
# ~/.maid-agent/system/config/maid-agent-messenger.yaml
#
# mcp-server.yaml から自動移行されました

server:
  port: ${portMatch ? portMatch[1] : '3100'}
  host: 127.0.0.1

dashboard:
  # エディタのURIスキーム: vscode | windsurf | cursor
  editor: vscode

keepalive:
  # HTTP Keep-Alive タイムアウト（プロキシの60秒より長く設定）
  http_keepalive_timeout: ${httpKeepaliveMatch ? httpKeepaliveMatch[1] : '65000'}  # 65秒
  http_headers_timeout: ${httpHeadersMatch ? httpHeadersMatch[1] : '66000'}    # 66秒

  # サーバー→クライアント Ping間隔（ミリ秒）
  ping_interval: ${pingIntervalMatch ? pingIntervalMatch[1] : '30000'}  # 30秒間隔
`;

            // 新ファイルを作成
            fs.writeFileSync(newPath, newContent, 'utf-8');
            ctx.log(`[Migration] 設定ファイル移行: ${oldPath} → ${newPath}`);

            // 旧ファイルを .bak にリネーム
            const backupPath = oldPath + '.bak';
            fs.renameSync(oldPath, backupPath);
            ctx.log(`[Migration] 旧ファイルバックアップ: ${backupPath}`);
        } catch (error) {
            ctx.log(`[Migration] 設定ファイル移行失敗: ${error}`);
            // 移行失敗してもコピー処理は続行（新ファイルがテンプレートからコピーされる）
        }
    }
}

/**
 * グローバルテンプレートをコピー
 */
async function copyGlobalTemplates(ctx: SetupContext): Promise<void> {
    const globalPath = getGlobalMaidAgentPath();

    // ディレクトリ作成
    const dirs = [
        globalPath,
        path.join(globalPath, 'bin'),
        path.join(globalPath, 'maid-agent-messenger'),
        path.join(globalPath, 'system', 'config'),
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            ctx.log(`[Global] ディレクトリ作成: ${dir}`);
        }
    }

    // 設定ファイルの移行（テンプレートコピー前に実行）
    // mcp-server.yaml → maid-agent-messenger.yaml
    migrateConfigFile(globalPath, ctx);

    // global-templates からコピー
    const templatesPath = path.join(ctx.extensionPath, 'global-templates');
    if (fs.existsSync(templatesPath)) {
        copyDirRecursive(templatesPath, globalPath, ctx);
        ctx.log('[Global] テンプレートコピー完了');
    }
}

/**
 * ディレクトリを再帰的にコピー
 */
function copyDirRecursive(src: string, dest: string, ctx: SetupContext): void {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, ctx);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * パスワードレスsudo設定
 */
async function setupPasswordlessSudo(ctx: SetupContext, password?: string): Promise<void> {
    if (!password) {
        throw new Error('パスワードが必要です');
    }

    const sudoersLine = '%sudo ALL=(ALL) NOPASSWD: ALL';
    const sudoersFile = '/etc/sudoers.d/maid-agent';

    const cmd = CURRENT_ENV === 'windows-native'
        ? `wsl bash -lc "echo '${password}' | sudo -S sh -c 'echo \\"${sudoersLine}\\" > ${sudoersFile} && chmod 440 ${sudoersFile}'"`
        : `echo '${password}' | sudo -S sh -c 'echo "${sudoersLine}" > ${sudoersFile} && chmod 440 ${sudoersFile}'`;

    try {
        execSync(cmd, { stdio: 'pipe', timeout: 30000 });
        ctx.log('[Global] パスワードレスsudo設定完了');
    } catch (error) {
        ctx.log(`[Global] パスワードレスsudo設定失敗: ${error}`);
        throw new Error('パスワードレスsudo設定に失敗しました');
    }
}

/**
 * jqインストール
 * @param runtimeMode psmuxモード時は winget 経由でインストール
 */
async function installJq(ctx: SetupContext, password?: string, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    const isPsmuxMode = CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native';

    if (isPsmuxMode) {
        // psmuxモード: winget経由でインストール
        ctx.log('[Global] jq をwinget経由でインストール中...');
        try {
            execSync('winget install jqlang.jq --accept-source-agreements --accept-package-agreements', {
                stdio: 'pipe',
                timeout: 120000,
            });
            ctx.log('[Global] jqインストール完了（winget）');
        } catch (error) {
            ctx.log(`[Global] jqインストール失敗（winget）: ${error}`);
            throw new Error('jqインストールに失敗しました（winget install jqlang.jq を手動実行してください）');
        }
        return;
    }

    // WSLモード: 従来通り
    if (!password && CURRENT_ENV !== 'macos') {
        throw new Error('パスワードが必要です');
    }

    const installCmd = CURRENT_ENV === 'windows-native'
        ? `wsl bash -lc "echo '${password}' | sudo -S apt-get update && echo '${password}' | sudo -S apt-get install -y jq"`
        : CURRENT_ENV === 'macos'
            ? 'brew install jq'
            : `echo '${password}' | sudo -S apt-get update && echo '${password}' | sudo -S apt-get install -y jq`;

    try {
        execSync(installCmd, { stdio: 'pipe', timeout: 120000 });
        ctx.log('[Global] jqインストール完了');
    } catch (error) {
        ctx.log(`[Global] jqインストール失敗: ${error}`);
        throw new Error('jqインストールに失敗しました');
    }
}

/**
 * yqインストール
 * yq はYAML処理ツール（Mike Farah版を使用）
 * @param runtimeMode psmuxモード時は winget 経由でインストール
 */
async function installYq(ctx: SetupContext, password?: string, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    const isPsmuxMode = CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native';

    if (isPsmuxMode) {
        // psmuxモード: winget経由でインストール
        ctx.log('[Global] yq をwinget経由でインストール中...');
        try {
            execSync('winget install MikeFarah.yq --accept-source-agreements --accept-package-agreements', {
                stdio: 'pipe',
                timeout: 120000,
            });
            ctx.log('[Global] yqインストール完了（winget）');
        } catch (error) {
            ctx.log(`[Global] yqインストール失敗（winget）: ${error}`);
            throw new Error('yqインストールに失敗しました（winget install MikeFarah.yq を手動実行してください）');
        }
        return;
    }

    // WSLモード: 従来通り
    if (!password && CURRENT_ENV !== 'macos') {
        throw new Error('パスワードが必要です');
    }

    // yq v4のインストール方法
    // - macOS: brew install yq
    // - Linux: バイナリダウンロード（apt-getにはない）
    // - WSL: バイナリダウンロード
    let installCmd: string;

    if (CURRENT_ENV === 'macos') {
        installCmd = 'brew install yq';
    } else if (CURRENT_ENV === 'windows-native') {
        // WSL経由でバイナリをダウンロード
        installCmd = `wsl bash -lc "echo '${password}' | sudo -S wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && echo '${password}' | sudo -S chmod +x /usr/local/bin/yq"`;
    } else {
        // Linux: バイナリダウンロード
        installCmd = `echo '${password}' | sudo -S wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 && echo '${password}' | sudo -S chmod +x /usr/local/bin/yq`;
    }

    try {
        execSync(installCmd, { stdio: 'pipe', timeout: 120000 });
        ctx.log('[Global] yqインストール完了');
    } catch (error) {
        ctx.log(`[Global] yqインストール失敗: ${error}`);
        throw new Error('yqインストールに失敗しました');
    }
}

/**
 * pm2インストール
 * @param runtimeMode psmuxモード時は sudo 不要で直接インストール
 */
async function installPm2(ctx: SetupContext, password?: string, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    const isPsmuxMode = CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native';

    if (isPsmuxMode) {
        // psmuxモード: Windows環境で直接 npm install -g（sudo不要）
        ctx.log('[Global] pm2 をnpm経由でインストール中...');
        try {
            execSync('npm install -g pm2', {
                stdio: 'pipe',
                timeout: 120000,
            });
            ctx.log('[Global] pm2インストール完了（npm global）');
        } catch (error) {
            ctx.log(`[Global] pm2インストール失敗（npm）: ${error}`);
            throw new Error('pm2インストールに失敗しました（npm install -g pm2 を手動実行してください）');
        }
        return;
    }

    // WSLモード: 従来通り（sudo必要）
    // pm2-setup.ts の installPm2 を呼び出すのではなく、ここで直接実行
    // パスワードは事前に取得済み
    const { runShellCommand } = await import('./pm2-setup');
    const { detectPackageManager, PM_CONFIG } = await import('../utils/package-manager');
    const { getMessengerPath } = await import('./pm2-setup');

    const pm = detectPackageManager(getMessengerPath());
    const installCmd = PM_CONFIG[pm].globalInstall('pm2');

    try {
        if (password) {
            if (CURRENT_ENV === 'windows-native') {
                execSync(
                    `wsl bash -lc "sudo -S ${installCmd} 2>&1"`,
                    { encoding: 'utf-8', timeout: 120000, input: password + '\n' }
                );
            } else {
                execSync(
                    `sudo -S ${installCmd} 2>&1`,
                    { encoding: 'utf-8', timeout: 120000, input: password + '\n' }
                );
            }
        } else {
            // パスワードレスの場合
            runShellCommand(`sudo -n ${installCmd}`, { stdio: 'pipe' });
        }
        ctx.log('[Global] pm2インストール完了');
    } catch (error) {
        ctx.log(`[Global] pm2インストール失敗: ${error}`);
        throw new Error('pm2インストールに失敗しました');
    }
}

/**
 * サーバーセットアップ（npm install, pm2 start, pm2 save）
 */
async function setupMessengerServer(ctx: SetupContext): Promise<void> {
    const { runShellCommand } = await import('./pm2-setup');
    const { detectPackageManager, PM_CONFIG } = await import('../utils/package-manager');
    const { getMessengerPath } = await import('./pm2-setup');

    const messengerPath = getMessengerPath();
    const pm = detectPackageManager(messengerPath);

    // npm/pnpm/yarn install
    ctx.log('[Global] サーバー依存関係インストール中...');
    const installCmd = PM_CONFIG[pm].install;
    runShellCommand(`cd "${messengerPath}" && ${installCmd}`, { stdio: 'pipe' });

    // pm2でプロセス起動
    ctx.log('[Global] サーバー起動中...');
    try {
        // 既存プロセスを停止（エラーは無視）
        try {
            runShellCommand('pm2 delete maid-agent-messenger', { stdio: 'pipe' });
        } catch {
            // 存在しない場合のエラーは無視
        }

        // 新規起動
        runShellCommand(
            `pm2 start "${path.join(messengerPath, 'dist', 'index.js')}" --name maid-agent-messenger`,
            { stdio: 'pipe' }
        );

        // 設定を保存
        runShellCommand('pm2 save', { stdio: 'pipe' });
        ctx.log('[Global] サーバーセットアップ完了');
    } catch (error) {
        ctx.log(`[Global] サーバーセットアップ失敗: ${error}`);
        throw new Error('サーバーセットアップに失敗しました');
    }
}

/**
 * pm2 startup設定
 */
async function setupPm2Startup(ctx: SetupContext, password?: string): Promise<void> {
    const { runShellCommand } = await import('./pm2-setup');

    try {
        // pm2 startup コマンドを取得
        const output = runShellCommand('pm2 startup 2>&1');

        // 既に設定済みか確認
        if (output.includes('already')) {
            ctx.log('[Global] pm2 startup 既に設定済み');
            return;
        }

        // sudoコマンドを抽出
        const match = output.match(/sudo .+$/m);
        if (!match) {
            ctx.log('[Global] pm2 startup コマンドが見つかりません');
            return;
        }

        const startupCmd = match[0];

        if (password) {
            // パスワード付きで実行
            const cmdWithS = startupCmd.replace(/^sudo\s+/, 'sudo -S ');
            if (CURRENT_ENV === 'windows-native') {
                execSync(
                    `wsl bash -lc "${cmdWithS}"`,
                    { encoding: 'utf-8', timeout: 30000, input: password + '\n' }
                );
            } else {
                execSync(cmdWithS, { encoding: 'utf-8', timeout: 30000, input: password + '\n' });
            }
        } else {
            // パスワードレス
            const cmdWithN = startupCmd.replace(/^sudo\s+/, 'sudo -n ');
            runShellCommand(cmdWithN, { stdio: 'pipe' });
        }

        ctx.log('[Global] pm2 startup 設定完了');
    } catch (error) {
        ctx.log(`[Global] pm2 startup 設定失敗: ${error}`);
        throw new Error('pm2 startup 設定に失敗しました');
    }
}

/**
 * maidctlをグローバルbinにデプロイ
 */
async function deployMaidctl(ctx: SetupContext): Promise<void> {
    const globalBinPath = path.join(getGlobalMaidAgentPath(), 'bin');
    const maidctlSrc = path.join(ctx.extensionPath, 'global-templates', 'bin', 'maidctl');
    const maidctlDest = path.join(globalBinPath, 'maidctl');

    if (!fs.existsSync(globalBinPath)) {
        fs.mkdirSync(globalBinPath, { recursive: true });
    }

    if (fs.existsSync(maidctlSrc)) {
        fs.copyFileSync(maidctlSrc, maidctlDest);
        // 実行権限を付与
        fs.chmodSync(maidctlDest, 0o755);
        ctx.log('[Global] maidctlデプロイ完了');
    }
}

/**
 * PATH設定を追加
 * @param runtimeMode psmuxモード時は PowerShell $PROFILE にパスを追加
 */
async function setupPath(ctx: SetupContext, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    const isPsmuxMode = CURRENT_ENV === 'windows-native' && runtimeMode === 'windows-native';

    if (isPsmuxMode) {
        // psmuxモード: PowerShell $PROFILE にパスを追加
        const userProfile = process.env.USERPROFILE;
        if (!userProfile) {
            throw new Error('USERPROFILEが見つかりません');
        }

        // PowerShell $PROFILE のパス
        const profilePaths = [
            path.join(userProfile, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
            path.join(userProfile, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        ];

        const pathLine = '$env:PATH = "$env:USERPROFILE\\.maid-agent\\bin;$env:PATH"';
        const comment = '# Maid Agent CLI (maidctl)';

        for (const profilePath of profilePaths) {
            const profileDir = path.dirname(profilePath);
            // ディレクトリがなければ作成
            if (!fs.existsSync(profileDir)) {
                fs.mkdirSync(profileDir, { recursive: true });
            }

            // ファイルが存在しなければ作成
            if (!fs.existsSync(profilePath)) {
                fs.writeFileSync(profilePath, `${comment}\n${pathLine}\n`, 'utf-8');
                ctx.log(`[Global] PATH設定追加（新規作成）: ${profilePath}`);
            } else {
                const content = fs.readFileSync(profilePath, 'utf-8');
                if (!content.includes('.maid-agent\\bin')) {
                    fs.appendFileSync(profilePath, `\n${comment}\n${pathLine}\n`);
                    ctx.log(`[Global] PATH設定追加: ${profilePath}`);
                }
            }
        }

        // Git Bash の .bashrc にも追加（maidctl は bash スクリプトのため）
        const gitBashRc = path.join(userProfile, '.bashrc');
        const bashPathLine = 'export PATH="$HOME/.maid-agent/bin:$PATH"';
        const bashComment = '# Maid Agent CLI (maidctl)';

        if (!fs.existsSync(gitBashRc)) {
            fs.writeFileSync(gitBashRc, `${bashComment}\n${bashPathLine}\n`, 'utf-8');
            ctx.log(`[Global] PATH設定追加（Git Bash）: ${gitBashRc}`);
        } else {
            const content = fs.readFileSync(gitBashRc, 'utf-8');
            if (!content.includes('.maid-agent/bin')) {
                fs.appendFileSync(gitBashRc, `\n${bashComment}\n${bashPathLine}\n`);
                ctx.log(`[Global] PATH設定追加（Git Bash）: ${gitBashRc}`);
            }
        }

        ctx.log('[Global] PATH設定完了（psmuxモード）');
        return;
    }

    // WSLモード: 従来通り
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
        throw new Error('ホームディレクトリが見つかりません');
    }

    const pathLine = 'export PATH="$HOME/.maid-agent/bin:$PATH"';
    const comment = '# Maid Agent CLI (maidctl)';

    // .zshrc または .bashrc に追加
    const shellConfigs = ['.zshrc', '.bashrc'];

    for (const config of shellConfigs) {
        const configPath = path.join(homeDir, config);
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            if (!content.includes('.maid-agent/bin')) {
                fs.appendFileSync(configPath, `\n${comment}\n${pathLine}\n`);
                ctx.log(`[Global] PATH設定追加: ${config}`);
            }
        }
    }

    ctx.log('[Global] PATH設定完了');
}

// =============================================================================
// メイン関数（4フェーズ構造）
// =============================================================================

/**
 * グローバル設定を実行（5フェーズ構造）
 */
export async function initializeGlobalSettingsNew(ctx: SetupContext): Promise<boolean> {
    ctx.log('[Global] === グローバル設定開始（新フロー） ===');

    // ========================================
    // フェーズ0: モード選択（Windows環境のみ）
    // ========================================
    let runtimeMode: RuntimeMode = 'wsl';

    if (CURRENT_ENV === 'windows-native') {
        // 既存の設定を確認
        const savedMode = getSavedRuntimeMode();
        if (savedMode) {
            ctx.log(`[Global] 保存済みランタイムモード: ${savedMode}`);
            // 既存設定がある場合は確認ダイアログ
            const modeDisplayName = savedMode === 'wsl' ? 'WSL' : savedMode === 'both' ? 'WSL + Windows' : 'Windows直接実行';
            const changeMode = await vscode.window.showQuickPick(
                ['現在の設定を使用', 'モードを変更'],
                {
                    title: `現在のモード: ${modeDisplayName}`,
                    placeHolder: '実行モードを変更しますか？',
                }
            );

            if (changeMode === undefined) {
                ctx.log('[Global] ユーザーがキャンセル');
                return false;
            }

            if (changeMode === '現在の設定を使用') {
                runtimeMode = savedMode;
            } else {
                // モード選択ダイアログを表示
                const selection = await showRuntimeModeSelection();
                if (!selection) {
                    ctx.log('[Global] ユーザーがキャンセル');
                    return false;
                }
                runtimeMode = selection.mode;
                saveRuntimeMode(runtimeMode, ctx);
            }
        } else {
            // 初回: モード選択ダイアログを表示
            const selection = await showRuntimeModeSelection();
            if (!selection) {
                ctx.log('[Global] ユーザーがキャンセル');
                return false;
            }
            runtimeMode = selection.mode;
            saveRuntimeMode(runtimeMode, ctx);
        }

        ctx.log(`[Global] 選択されたランタイムモード: ${runtimeMode}`);
    }

    // 'both' モードの場合、まずWSLセットアップを実行し、その後psmuxセットアップを実行
    const isBothMode = runtimeMode === 'both';
    const primaryMode: RuntimeMode = isBothMode ? 'wsl' : runtimeMode;

    if (isBothMode) {
        ctx.log('[Global] 両方モード: まずWSLセットアップを実行します');
    }

    // ========================================
    // フェーズ1: 事前調査
    // ========================================
    const requirements = await analyzeRequirements(ctx, primaryMode);

    // 致命的エラーがある場合は中断
    if (requirements.fatalError) {
        await vscode.window.showErrorMessage(
            `❌ ${requirements.fatalError.message}\n\n${requirements.fatalError.guidance}`,
            { modal: true }
        );
        return false;
    }

    // すべて設定済みの場合はスキップ
    if (isAllConfigured(requirements)) {
        ctx.log('[Global] すべて設定済み - スキップ');
        vscode.window.showInformationMessage('✅ グローバル設定は既に完了しています');
        return true;
    }

    const requiredCount = countRequiredSteps(requirements);
    ctx.log(`[Global] 必要な設定: ${requiredCount}項目`);

    // ========================================
    // フェーズ2: 入力一括取得
    // ========================================
    const userInput = await showGlobalConfirmation(requirements);

    if (!userInput || !userInput.approved) {
        ctx.log('[Global] ユーザーがキャンセル');
        return false;
    }

    ctx.log(`[Global] スキップ項目: ${userInput.skipItems.join(', ') || 'なし'}`);

    // ========================================
    // フェーズ3: 自動実行
    // ========================================
    const steps = buildExecutionSteps(requirements, userInput.skipItems);
    const results: StepResult[] = [];

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '🔄 グローバル設定中...',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const percentage = Math.round(((i + 1) / steps.length) * 100);

            progress.report({
                message: `ステップ ${i + 1}/${steps.length}: ${step.progressMessage}`,
                increment: i === 0 ? 0 : (100 / steps.length)
            });

            try {
                await step.execute(ctx, userInput.password);
                results.push({ stepId: step.id, success: true });
                ctx.log(`[Global] ステップ完了: ${step.id}`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push({ stepId: step.id, success: false, error: errorMsg });
                ctx.log(`[Global] ステップ失敗: ${step.id} - ${errorMsg}`);

                // 重大エラーの場合は中断
                if (step.critical) {
                    ctx.log('[Global] 重大エラーのため中断');
                    break;
                }
            }
        }
    });

    // ========================================
    // フェーズ4: 結果表示
    // ========================================
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    const errors = results.filter(r => !r.success).map(r => `${r.stepId}: ${r.error}`);

    await showGlobalSetupResult(
        successCount,
        totalCount,
        userInput.skipItems,
        errors
    );

    const hasFailure = errors.length > 0;
    const hasCriticalFailure = results.some(r => !r.success && steps.find(s => s.id === r.stepId)?.critical);

    ctx.log(`[Global] === グローバル設定完了: ${successCount}/${totalCount} 成功 ===`);

    // ========================================
    // 両方モード: psmuxセットアップも実行
    // ========================================
    if (isBothMode && !hasCriticalFailure) {
        ctx.log('[Global] 両方モード: 続いてWindows環境（psmux）のセットアップを実行します');

        const continueWithPsmux = await vscode.window.showInformationMessage(
            '✅ WSL環境のセットアップが完了しました。\n続いてWindows環境（psmux）のセットアップを行いますか？',
            { modal: true },
            'セットアップする',
            'スキップ'
        );

        if (continueWithPsmux === 'セットアップする') {
            // psmuxモードで再度実行
            const psmuxRequirements = await analyzeRequirements(ctx, 'windows-native');

            if (!psmuxRequirements.fatalError && !isAllConfigured(psmuxRequirements)) {
                const psmuxInput = await showGlobalConfirmation(psmuxRequirements);

                if (psmuxInput && psmuxInput.approved) {
                    const psmuxSteps = buildExecutionSteps(psmuxRequirements, psmuxInput.skipItems);

                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: '🔄 Windows環境セットアップ中...',
                        cancellable: false
                    }, async (progress) => {
                        for (let i = 0; i < psmuxSteps.length; i++) {
                            const step = psmuxSteps[i];
                            progress.report({
                                message: `ステップ ${i + 1}/${psmuxSteps.length}: ${step.progressMessage}`,
                                increment: i === 0 ? 0 : (100 / psmuxSteps.length)
                            });

                            try {
                                await step.execute(ctx, psmuxInput.password);
                                ctx.log(`[Global] psmuxステップ完了: ${step.id}`);
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : String(error);
                                ctx.log(`[Global] psmuxステップ失敗: ${step.id} - ${errorMsg}`);
                            }
                        }
                    });

                    vscode.window.showInformationMessage('✅ 両方の環境のセットアップが完了しました！');
                }
            } else if (isAllConfigured(psmuxRequirements)) {
                vscode.window.showInformationMessage('✅ Windows環境は既にセットアップ済みです');
            }
        } else {
            ctx.log('[Global] 両方モード: psmuxセットアップをスキップ');
        }
    }

    return !hasCriticalFailure;
}
