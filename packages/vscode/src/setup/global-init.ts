/**
 * グローバル設定モジュール（4フェーズ構造）
 *
 * フェーズ1: 事前調査（自動）
 * フェーズ2: 入力一括取得（ユーザー操作1回）
 * フェーズ3: 自動実行（進捗表示のみ）
 * フェーズ4: 結果表示
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SetupContext } from '../types';
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

    // jqインストール
    if (requirements.needs.jqInstall && !skipItems.includes('jqInstall')) {
        steps.push({
            id: 'jqInstall',
            progressMessage: 'jq をインストール中...',
            critical: false,
            execute: async (ctx, password) => {
                await installJq(ctx, password);
            },
        });
    }

    // yqインストール
    if (requirements.needs.yqInstall && !skipItems.includes('yqInstall')) {
        steps.push({
            id: 'yqInstall',
            progressMessage: 'yq をインストール中...',
            critical: false,
            execute: async (ctx, password) => {
                await installYq(ctx, password);
            },
        });
    }

    // pm2インストール
    if (requirements.needs.pm2Install && !skipItems.includes('pm2Install')) {
        steps.push({
            id: 'pm2Install',
            progressMessage: 'pm2 をインストール中...',
            critical: true,
            execute: async (ctx, password) => {
                await installPm2(ctx, password);
            },
        });
    }

    // MCPサーバーセットアップ（npm install, pm2 start）
    steps.push({
        id: 'mcpServerSetup',
        progressMessage: 'MCPサーバーをセットアップ中...',
        critical: true,
        execute: async (ctx) => {
            await setupMcpServer(ctx);
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

    // PATH設定
    if (requirements.needs.pathSetup && !skipItems.includes('pathSetup')) {
        steps.push({
            id: 'pathSetup',
            progressMessage: 'PATH を設定中...',
            critical: false,
            execute: async (ctx) => {
                await setupPath(ctx);
            },
        });
    }

    return steps;
}

// =============================================================================
// 各ステップの実行関数
// =============================================================================

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
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            ctx.log(`[Global] ディレクトリ作成: ${dir}`);
        }
    }

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
 */
async function installJq(ctx: SetupContext, password?: string): Promise<void> {
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
 */
async function installYq(ctx: SetupContext, password?: string): Promise<void> {
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
 */
async function installPm2(ctx: SetupContext, password?: string): Promise<void> {
    // pm2-setup.ts の installPm2 を呼び出すのではなく、ここで直接実行
    // パスワードは事前に取得済み
    const { runShellCommand } = await import('./pm2-setup');
    const { detectPackageManager, PM_CONFIG } = await import('../utils/package-manager');
    const { getMcpServerPath } = await import('./pm2-setup');

    const pm = detectPackageManager(getMcpServerPath());
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
 * MCPサーバーセットアップ（npm install, pm2 start, pm2 save）
 */
async function setupMcpServer(ctx: SetupContext): Promise<void> {
    const { runShellCommand } = await import('./pm2-setup');
    const { detectPackageManager, PM_CONFIG } = await import('../utils/package-manager');
    const { getMcpServerPath } = await import('./pm2-setup');

    const mcpServerPath = getMcpServerPath();
    const pm = detectPackageManager(mcpServerPath);

    // npm/pnpm/yarn install
    ctx.log('[Global] MCPサーバー依存関係インストール中...');
    const installCmd = PM_CONFIG[pm].install;
    runShellCommand(`cd "${mcpServerPath}" && ${installCmd}`, { stdio: 'pipe' });

    // pm2でプロセス起動
    ctx.log('[Global] MCPサーバー起動中...');
    try {
        // 既存プロセスを停止（エラーは無視）
        try {
            runShellCommand('pm2 delete maid-agent-messenger', { stdio: 'pipe' });
        } catch {
            // 存在しない場合のエラーは無視
        }

        // 新規起動
        runShellCommand(
            `pm2 start "${path.join(mcpServerPath, 'dist', 'index.js')}" --name maid-agent-messenger`,
            { stdio: 'pipe' }
        );

        // 設定を保存
        runShellCommand('pm2 save', { stdio: 'pipe' });
        ctx.log('[Global] MCPサーバーセットアップ完了');
    } catch (error) {
        ctx.log(`[Global] MCPサーバーセットアップ失敗: ${error}`);
        throw new Error('MCPサーバーセットアップに失敗しました');
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
 */
async function setupPath(ctx: SetupContext): Promise<void> {
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
 * グローバル設定を実行（新しい4フェーズ構造）
 */
export async function initializeGlobalSettingsNew(ctx: SetupContext): Promise<boolean> {
    ctx.log('[Global] === グローバル設定開始（新フロー） ===');

    // ========================================
    // フェーズ1: 事前調査
    // ========================================
    const requirements = await analyzeRequirements(ctx);

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

    return !hasCriticalFailure;
}
