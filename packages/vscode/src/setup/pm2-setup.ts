import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as nodePath from 'path';
import { execSync } from 'child_process';
import { SetupContext } from '../types';
import { ENV } from '../utils/environment';
import { checkPasswordlessSudo, setupPasswordlessSudo, promptWslPassword, showPasswordHelp } from './wsl-setup';
import { detectPackageManager, PM_CONFIG, PackageManager } from '../utils/package-manager';
import { assertNoShellMeta, escapeForDoubleQuote } from '../utils/shell-escape';

/**
 * WSLパスワードキャッシュ（モジュールスコープ）
 * セキュリティ: 必要最小限の期間のみ保持
 */
let cachedWslPassword: string | undefined;

/**
 * Mac/Linux用パスワードキャッシュ（startup設定で再利用）
 * セキュリティ: 必要最小限の期間のみ保持
 */
let cachedNativePassword: string | undefined;

/**
 * シェルコマンドを実行（OS環境に応じてWSL経由または直接実行）
 * ログインシェル（-l）で実行することで、nvm/nodenv/Homebrew等のPATH設定を読み込む
 * @param command 実行するコマンド
 * @param options execSyncのオプション
 */
export function runShellCommand(command: string, options?: { encoding?: BufferEncoding; timeout?: number; stdio?: 'pipe' | 'inherit' | 'ignore'; input?: string; cwd?: string }): string {
    const execOptions = {
        encoding: options?.encoding ?? 'utf-8' as BufferEncoding,
        timeout: options?.timeout,
        stdio: options?.stdio ?? 'pipe' as const,
        input: options?.input,
        cwd: options?.cwd
    };

    if (ENV.isWindowsNative()) {
        // Windows: WSL経由でログインシェルとして実行
        // -l: ログインシェル（.bash_profile/.profile を読み込む）
        return execSync(`wsl bash -lc "${escapeForDoubleQuote(command, 'bash')}"`, execOptions);
    } else {
        // Mac/Linux: ユーザーシェルをログインシェルとして実行
        // macOS 2019〜 のデフォルトは zsh なので対応必須
        const userShell = process.env.SHELL || '/bin/bash';
        const shellName = nodePath.basename(userShell);

        if (shellName === 'zsh' || shellName === 'bash') {
            // zsh/bash: ユーザーシェルを使用
            return execSync(`${userShell} -lc "${escapeForDoubleQuote(command, 'bash')}"`, execOptions);
        } else {
            // その他: bashにフォールバック
            return execSync(`bash -lc "${escapeForDoubleQuote(command, 'bash')}"`, execOptions);
        }
    }
}

/**
 * Mac/Linux環境でパスワードレスsudoが利用可能か確認
 * @returns true: パスワード不要でsudo実行可能
 */
export function checkPasswordlessSudoNative(): boolean {
    try {
        execSync('sudo -n true 2>/dev/null', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Mac/Linux環境でsudoパスワードを入力ダイアログで取得
 * @param purpose 用途（表示用）
 * @param attempt 試行回数
 * @param maxAttempts 最大試行回数
 * @returns パスワード文字列、キャンセル時はundefined
 */
async function promptNativePassword(
    purpose: string,
    attempt: number = 1,
    maxAttempts: number = 3
): Promise<string | undefined> {
    const message = attempt > 1
        ? `${purpose}のためsudoパスワードを入力してください（${attempt}/${maxAttempts}回目）`
        : `${purpose}のためsudoパスワードを入力してください`;

    return await vscode.window.showInputBox({
        prompt: message,
        password: true,
        ignoreFocusOut: true
    });
}

/**
 * サーバーのパスを取得（シェルコマンド用・Unix/WSLモード専用）
 * runShellCommand で使用するため、Unix形式のパスを返す
 *
 * 注意: この関数は Unix/WSL モード専用です
 * - Windows環境では WSL 内で使えるパス形式（~/...）を返す
 * - Psmux モードでは使用しないでください
 *
 * RuntimeMode を考慮したパス取得には helpers.ts の getMessengerPath(runtimeMode) を使用
 */
export function getMessengerShellPath(): string {
    if (ENV.isWindowsNative()) {
        // Windows (WSLモード): WSL内で使えるパス形式
        return '~/.maid-agent/maid-agent-messenger';
    } else {
        // Mac/Linux: ホームディレクトリを展開
        const homedir = require('os').homedir();
        return path.join(homedir, '.maid-agent', 'maid-agent-messenger');
    }
}

/**
 * サーバー（maid-agent-messenger）をセットアップ
 * - npm install
 * - pm2 start
 * - pm2 save
 * - pm2 startup（自動起動設定）
 */
export async function setupMessengerServer(ctx: SetupContext): Promise<void> {
    const messengerPath = getMessengerShellPath();
    const messengerPathForShell = ENV.isWindowsNative()
        ? '~/.maid-agent/maid-agent-messenger'  // WSL内では~が使える
        : messengerPath;
    cachedWslPassword = undefined; // 初期化

    try {
        // 0. パスワードレスsudo設定を確認・セットアップ（Windows WSLのみ）
        if (ENV.isWindowsNative()) {
            const hasPasswordlessSudo = checkPasswordlessSudo();
            if (!hasPasswordlessSudo) {
                await setupPasswordlessSudo(ctx);
            }
        }

        // 進捗表示
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'サーバーをセットアップ中...',
            cancellable: false
        }, async (progress) => {
            // 1. pm2 インストール確認
            progress.report({ message: 'pm2 を確認中...' });
            try {
                runShellCommand('which pm2', { stdio: 'pipe' });
                ctx.log('[PM2] pm2 確認OK');
            } catch {
                // pm2がない場合は自動インストール
                ctx.log('[PM2] pm2 が見つかりません。インストールします...');

                const installed = await installPm2(ctx);
                if (!installed) {
                    throw new Error('pm2 のインストールがキャンセルされました');
                }
            }

            // 1. 依存関係インストール
            const pm = detectPackageManager(messengerPath);
            progress.report({ message: `${PM_CONFIG[pm].displayName} install 実行中...` });
            try {
                runShellCommand(`cd ${messengerPathForShell} && ${PM_CONFIG[pm].install}`, {
                    timeout: 120000 // 2分タイムアウト
                });
                ctx.log(`[PM2] ${PM_CONFIG[pm].displayName} install 完了`);
            } catch (error) {
                ctx.log(`[PM2] ${PM_CONFIG[pm].displayName} install 失敗: ${error}`);
                throw new Error(`${PM_CONFIG[pm].displayName} install に失敗しました`);
            }

            // 2. pm2 start
            progress.report({ message: 'pm2 でサーバー起動中...' });
            try {
                // 既存のプロセスがあれば削除
                try {
                    runShellCommand('pm2 delete maid-agent-messenger 2>/dev/null || true');
                } catch { /* ignore */ }

                runShellCommand(`cd ${messengerPathForShell} && pm2 start ecosystem.config.cjs`);
                ctx.log('[PM2] pm2 start 完了');
            } catch (error) {
                ctx.log(`[PM2] pm2 start 失敗: ${error}`);
                throw new Error('pm2 start に失敗しました');
            }

            // 3. pm2 save
            progress.report({ message: 'pm2 状態を保存中...' });
            try {
                runShellCommand('pm2 save');
                ctx.log('[PM2] pm2 save 完了');
            } catch (error) {
                ctx.log(`[PM2] pm2 save 失敗: ${error}`);
                // saveの失敗は致命的ではないので続行
            }
        });

        vscode.window.showInformationMessage('✅ サーバーを起動しました');

        // 4. 自動起動設定の確認（キャッシュしたパスワードを渡す）
        await setupPm2Startup(ctx, cachedWslPassword);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`サーバーのセットアップに失敗: ${message}`);
        ctx.log(`[ERROR] サーバーセットアップ失敗: ${error}`);
    } finally {
        // セキュリティ: パスワードをクリア
        cachedWslPassword = undefined;
        cachedNativePassword = undefined;
    }
}

/**
 * pm2をグローバルインストール（sudo必要）
 * - パスワードレスsudoが設定されている場合は自動でインストール
 * - 未設定の場合はパスワード入力を求める（最大3回）
 * @returns インストール成功時true、キャンセル時false
 */
export async function installPm2(ctx: SetupContext): Promise<boolean> {
    // Mac/Linux環境の場合
    if (!ENV.isWindowsNative()) {
        return await installPm2Native(ctx);
    }

    // Windows (WSL) 環境の場合
    const pm = detectPackageManager(getMessengerShellPath());

    // パスワードレスsudoが設定されている場合
    if (checkPasswordlessSudo()) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(
                    `wsl bash -lc "sudo -n ${PM_CONFIG[pm].globalInstall('pm2')} 2>&1"`,
                    { encoding: 'utf-8', timeout: 120000, stdio: 'pipe' }
                );
            });

            ctx.log('[PM2] pm2 インストール完了（パスワードレス）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            return true;
        } catch (error) {
            ctx.log(`[PM2] pm2 インストール失敗（パスワードレス）: ${error}`);
            // パスワードレスで失敗した場合、パスワード入力にフォールバック
        }
    }

    // パスワード入力が必要な場合
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const password = await promptWslPassword('pm2 のインストール', attempt, MAX_ATTEMPTS);

        if (password === undefined) {
            ctx.log('[PM2] pm2 インストールがキャンセルされました');
            return false;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(
                    `wsl bash -lc "sudo -S ${PM_CONFIG[pm].globalInstall('pm2')} 2>&1"`,
                    { encoding: 'utf-8', timeout: 120000, input: password + '\n' }
                );
            });

            ctx.log('[PM2] pm2 インストール完了');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            cachedWslPassword = password; // startup用にキャッシュ
            return true;
        } catch (error) {
            ctx.log(`[PM2] pm2 インストール試行 ${attempt} 失敗: ${error}`);
        }
    }

    vscode.window.showErrorMessage(
        'pm2 のインストールに失敗しました。\n' +
        'WSL で以下を手動実行してください:\n' +
        `sudo ${PM_CONFIG[pm].globalInstall('pm2')}`
    );
    return false;
}

/**
 * pm2をMac/Linux環境でインストール
 */
async function installPm2Native(ctx: SetupContext): Promise<boolean> {
    const pm = detectPackageManager(getMessengerShellPath());
    const installCmd = PM_CONFIG[pm].globalInstall('pm2');

    // 1. パスワードレスsudoが利用可能か確認
    if (checkPasswordlessSudoNative()) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(`sudo -n ${installCmd} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 120000,
                    stdio: 'pipe'
                });
            });

            ctx.log('[PM2] pm2 インストール完了（パスワードレス・ネイティブ）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            return true;
        } catch (error) {
            ctx.log(`[PM2] pm2 インストール失敗（パスワードレス）: ${error}`);
            // フォールバック: パスワード入力へ
        }
    }

    // 2. パスワード入力が必要な場合
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const password = await promptNativePassword('pm2 のインストール', attempt, MAX_ATTEMPTS);

        if (password === undefined) {
            ctx.log('[PM2] pm2 インストールがキャンセルされました');
            return false;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(`sudo -S ${installCmd} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 120000,
                    input: password + '\n'
                });
            });

            ctx.log('[PM2] pm2 インストール完了（ネイティブ）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            // パスワードをキャッシュ（startup用）
            cachedNativePassword = password;
            return true;
        } catch (error) {
            ctx.log(`[PM2] pm2 インストール試行 ${attempt} 失敗: ${error}`);
        }
    }

    vscode.window.showErrorMessage(
        'pm2 のインストールに失敗しました。\n' +
        '以下を手動実行してください:\n' +
        `sudo ${installCmd}`
    );
    return false;
}

/**
 * pm2 startup を設定（システム起動時の自動起動）
 * - パスワードレスsudoが設定されている場合は自動で設定
 * - 未設定の場合はユーザーに確認してから設定
 * @param cachedPassword 既に取得済みのパスワード（あれば再利用）
 */
export async function setupPm2Startup(ctx: SetupContext, cachedPassword?: string): Promise<void> {
    // Mac/Linux環境の場合
    if (!ENV.isWindowsNative()) {
        await setupPm2StartupNative(ctx);
        return;
    }

    // Windows (WSL) 環境の場合
    // pm2 startup コマンドを取得（先に設定済みかどうかを確認）
    // 注意: pm2 startup はexit code 1を返すことがあるが、出力は正常
    let startupCommand: string;
    try {
        let output: string;
        try {
            output = execSync(`wsl bash -c "pm2 startup 2>&1"`, { encoding: 'utf-8' });
        } catch (execError: unknown) {
            if (execError && typeof execError === 'object' && 'stdout' in execError) {
                output = (execError as { stdout: string }).stdout || '';
            } else if (execError && typeof execError === 'object' && 'message' in execError) {
                const msg = (execError as Error).message;
                output = msg;
            } else {
                throw execError;
            }
        }

        ctx.log(`[PM2] pm2 startup 出力: ${output}`);

        const match = output.match(/sudo .+$/m);
        if (!match) {
            if (output.includes('already')) {
                // 既に設定済みの場合はポップアップを出さずに終了
                ctx.log('[PM2] pm2 startup 既に設定済み');
                return;
            }
            throw new Error('startup コマンドを取得できませんでした');
        }
        startupCommand = match[0];
        ctx.log(`[PM2] startup コマンド: ${startupCommand}`);
    } catch (error) {
        ctx.log(`[PM2] pm2 startup 取得失敗: ${error}`);
        vscode.window.showWarningMessage('自動起動設定の取得に失敗しました');
        return;
    }

    // sudo と env PATH=... の部分を除去（pm2は絶対パスで指定されているので不要）
    const command = startupCommand
        .replace(/^sudo\s+/, '')
        .replace(/env\s+PATH=[^\s]+\s+/, '');
    ctx.log(`[PM2] startup コマンド（整形後）: ${command}`);

    // シェルメタ文字の拒否（コマンドインジェクション防止）
    if (/[;&|`$()\n\r<>]/.test(command)) {
        ctx.log('[PM2] pm2 startup コマンドに不正な文字が含まれています');
        vscode.window.showErrorMessage('自動起動コマンドに不正な文字が含まれています');
        return;
    }

    // パスワードレスsudoが設定されている場合は自動で設定（ポップアップなし）
    if (checkPasswordlessSudo()) {
        try {
            execSync(
                `wsl bash -c "sudo -n ${command}"`,
                { encoding: 'utf-8', timeout: 30000, stdio: 'pipe' }
            );
            ctx.log('[PM2] pm2 startup 設定完了（パスワードレス・自動）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[PM2] pm2 startup 失敗（パスワードレス）: ${error}`);
            // パスワードレスで失敗した場合、ユーザーに確認してからパスワード入力にフォールバック
        }
    }

    // パスワードレスsudoが未設定、またはパスワードレス実行に失敗した場合は確認ダイアログを表示
    const choice = await vscode.window.showInformationMessage(
        'サーバーの自動起動を設定しますか？\n（WSL起動時に自動で起動します）',
        '設定する',
        'スキップ'
    );

    if (choice !== '設定する') {
        ctx.log('[PM2] pm2 startup をスキップ');
        return;
    }

    // パスワード入力（キャッシュがあれば使用、なければ新規取得）
    const maxAttempts = 3;
    let password = cachedPassword;
    let attempts = 0;

    while (attempts < maxAttempts) {
        // キャッシュがない場合のみ入力を求める
        if (!password) {
            password = await promptWslPassword('自動起動の設定', attempts + 1, maxAttempts);
            if (!password) {
                await showPasswordHelp(ctx);
                return;
            }
        }

        try {
            ctx.log(`[PM2] 実行コマンド: ${command}`);
            execSync(
                `wsl bash -c "sudo -S ${command}"`,
                { encoding: 'utf-8', timeout: 30000, input: password + '\n' }
            );
            ctx.log('[PM2] pm2 startup 設定完了');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            attempts++;
            ctx.log(`[PM2] pm2 startup 失敗 (${attempts}/${maxAttempts}): ${error}`);
            password = undefined; // 次回は新規入力
        }
    }

    vscode.window.showErrorMessage('パスワードの認証に失敗しました。手動で設定してください。');
    await showPasswordHelp(ctx);
}

/**
 * pm2 startupをMac/Linux環境で設定
 */
async function setupPm2StartupNative(ctx: SetupContext): Promise<void> {
    // pm2 startup コマンドを取得
    let output: string;
    try {
        output = runShellCommand('pm2 startup 2>&1');
    } catch (execError: unknown) {
        if (execError && typeof execError === 'object' && 'stdout' in execError) {
            output = (execError as { stdout: string }).stdout || '';
        } else if (execError && typeof execError === 'object' && 'message' in execError) {
            output = (execError as Error).message;
        } else {
            ctx.log(`[PM2] pm2 startup 取得失敗: ${execError}`);
            vscode.window.showWarningMessage('自動起動設定の取得に失敗しました');
            return;
        }
    }

    ctx.log(`[PM2] pm2 startup 出力: ${output}`);

    // 既に設定済みか確認
    if (output.includes('already')) {
        ctx.log('[PM2] pm2 startup 既に設定済み');
        return;
    }

    // sudoコマンドを抽出
    const match = output.match(/sudo .+$/m);
    if (!match) {
        ctx.log('[PM2] startup コマンドが見つかりません');
        return;
    }

    const startupCmd = match[0];

    // メタ文字チェック（pm2出力を信頼してそのまま実行するリスクを防止）
    try {
        assertNoShellMeta(startupCmd, 'pm2 startup command');
    } catch (error) {
        ctx.log(`[PM2] startup コマンドに危険なメタ文字が含まれています: ${error}`);
        vscode.window.showWarningMessage('自動起動設定のコマンドに不正な文字が含まれています');
        return;
    }

    // ユーザーに確認
    const choice = await vscode.window.showInformationMessage(
        'サーバーの自動起動を設定しますか？\n（システム起動時に自動で起動します）',
        '設定する',
        'スキップ'
    );

    if (choice !== '設定する') {
        ctx.log('[PM2] pm2 startup をスキップ');
        return;
    }

    // 1. パスワードレスsudoが利用可能か確認
    if (checkPasswordlessSudoNative()) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '自動起動を設定中...',
                cancellable: false
            }, async () => {
                // sudo -n に変換して実行
                const cmdWithN = startupCmd.replace(/^sudo\s+/, 'sudo -n ');
                execSync(`${cmdWithN} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    stdio: 'pipe'
                });
            });

            ctx.log('[PM2] pm2 startup 設定完了（パスワードレス・ネイティブ）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[PM2] pm2 startup 失敗（パスワードレス）: ${error}`);
            // フォールバック: パスワード入力へ
        }
    }

    // 2. キャッシュ済みパスワードがあれば使用
    if (cachedNativePassword) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '自動起動を設定中...',
                cancellable: false
            }, async () => {
                const cmdWithS = startupCmd.replace(/^sudo\s+/, 'sudo -S ');
                execSync(`${cmdWithS} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    input: cachedNativePassword + '\n'
                });
            });

            ctx.log('[PM2] pm2 startup 設定完了（キャッシュパスワード）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[PM2] pm2 startup 失敗（キャッシュパスワード）: ${error}`);
            cachedNativePassword = undefined; // キャッシュクリア
        }
    }

    // 3. パスワード入力が必要な場合
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const password = await promptNativePassword('pm2 startup 設定', attempt, MAX_ATTEMPTS);

        if (password === undefined) {
            ctx.log('[PM2] pm2 startup がキャンセルされました');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '自動起動を設定中...',
                cancellable: false
            }, async () => {
                const cmdWithS = startupCmd.replace(/^sudo\s+/, 'sudo -S ');
                execSync(`${cmdWithS} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    input: password + '\n'
                });
            });

            ctx.log('[PM2] pm2 startup 設定完了（ネイティブ）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[PM2] pm2 startup 試行 ${attempt} 失敗: ${error}`);
        }
    }

    vscode.window.showErrorMessage(
        '自動起動の設定に失敗しました。\n' +
        '以下を手動実行してください:\n' +
        startupCmd
    );
}
