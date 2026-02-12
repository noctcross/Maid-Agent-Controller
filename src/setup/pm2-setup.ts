import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SetupContext } from '../types';
import { CURRENT_ENV } from '../utils/environment';
import { windowsToWslPath } from '../utils/environment';
import { DASHBOARD_SERVER_URL } from '../constants';
import { checkPasswordlessSudo, setupPasswordlessSudo, promptWslPassword, showPasswordHelp } from './wsl-setup';

/**
 * WSLパスワードキャッシュ（モジュールスコープ）
 * セキュリティ: 必要最小限の期間のみ保持
 */
let cachedWslPassword: string | undefined;

/**
 * シェルコマンドを実行（OS環境に応じてWSL経由または直接実行）
 * @param command 実行するコマンド
 * @param options execSyncのオプション
 */
function runShellCommand(command: string, options?: { encoding?: BufferEncoding; timeout?: number; stdio?: 'pipe' | 'inherit' | 'ignore'; input?: string; cwd?: string }): string {
    const execOptions = {
        encoding: options?.encoding ?? 'utf-8' as BufferEncoding,
        timeout: options?.timeout,
        stdio: options?.stdio ?? 'pipe' as const,
        input: options?.input,
        cwd: options?.cwd
    };

    if (CURRENT_ENV === 'windows-native') {
        // Windows: WSL経由で実行
        return execSync(`wsl bash -c "${command.replace(/"/g, '\\"')}"`, execOptions);
    } else {
        // Mac/Linux: 直接実行
        return execSync(`bash -c "${command.replace(/"/g, '\\"')}"`, execOptions);
    }
}

/**
 * MCPサーバーのパスを取得（OS環境に応じた形式）
 */
function getMcpServerPath(): string {
    if (CURRENT_ENV === 'windows-native') {
        // Windows: WSL内のパス
        return '~/.maid-agent/maid-agent-messenger';
    } else {
        // Mac/Linux: ホームディレクトリを展開
        const homedir = require('os').homedir();
        return path.join(homedir, '.maid-agent', 'maid-agent-messenger');
    }
}

/**
 * MCPサーバー（maid-agent-messenger）をセットアップ
 * - npm install
 * - pm2 start
 * - pm2 save
 * - pm2 startup（自動起動設定）
 */
export async function setupMcpServer(ctx: SetupContext): Promise<void> {
    const messengerPath = getMcpServerPath();
    const messengerPathForShell = CURRENT_ENV === 'windows-native'
        ? '~/.maid-agent/maid-agent-messenger'  // WSL内では~が使える
        : messengerPath;
    cachedWslPassword = undefined; // 初期化

    try {
        // 0. パスワードレスsudo設定を確認・セットアップ（Windows WSLのみ）
        if (CURRENT_ENV === 'windows-native') {
            const hasPasswordlessSudo = checkPasswordlessSudo();
            if (!hasPasswordlessSudo) {
                await setupPasswordlessSudo(ctx);
            }
        }

        // 進捗表示
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'MCPサーバーをセットアップ中...',
            cancellable: false
        }, async (progress) => {
            // 1. pm2 インストール確認
            progress.report({ message: 'pm2 を確認中...' });
            try {
                runShellCommand('which pm2', { stdio: 'pipe' });
                ctx.log('[MCP] pm2 確認OK');
            } catch {
                // pm2がない場合は自動インストール
                ctx.log('[MCP] pm2 が見つかりません。インストールします...');

                const installed = await installPm2(ctx);
                if (!installed) {
                    throw new Error('pm2 のインストールがキャンセルされました');
                }
            }

            // 1. npm install
            progress.report({ message: 'npm install 実行中...' });
            try {
                runShellCommand(`cd ${messengerPathForShell} && npm install`, {
                    timeout: 120000 // 2分タイムアウト
                });
                ctx.log('[MCP] npm install 完了');
            } catch (error) {
                ctx.log(`[MCP] npm install 失敗: ${error}`);
                throw new Error('npm install に失敗しました');
            }

            // 2. pm2 start
            progress.report({ message: 'pm2 でサーバー起動中...' });
            try {
                // 既存のプロセスがあれば削除
                try {
                    runShellCommand('pm2 delete maid-agent-messenger 2>/dev/null || true');
                } catch { /* ignore */ }

                runShellCommand(`cd ${messengerPathForShell} && pm2 start ecosystem.config.cjs`);
                ctx.log('[MCP] pm2 start 完了');
            } catch (error) {
                ctx.log(`[MCP] pm2 start 失敗: ${error}`);
                throw new Error('pm2 start に失敗しました');
            }

            // 3. pm2 save
            progress.report({ message: 'pm2 状態を保存中...' });
            try {
                runShellCommand('pm2 save');
                ctx.log('[MCP] pm2 save 完了');
            } catch (error) {
                ctx.log(`[MCP] pm2 save 失敗: ${error}`);
                // saveの失敗は致命的ではないので続行
            }
        });

        vscode.window.showInformationMessage('✅ MCPサーバーを起動しました');

        // 4. 自動起動設定の確認（キャッシュしたパスワードを渡す）
        await setupPm2Startup(ctx, cachedWslPassword);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`MCPサーバーのセットアップに失敗: ${message}`);
        ctx.log(`[ERROR] MCPサーバーセットアップ失敗: ${error}`);
    } finally {
        // セキュリティ: パスワードをクリア
        cachedWslPassword = undefined;
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
    if (CURRENT_ENV !== 'windows-native') {
        return await installPm2Native(ctx);
    }

    // Windows (WSL) 環境の場合
    // パスワードレスsudoが設定されている場合
    if (checkPasswordlessSudo()) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(
                    `wsl bash -c "sudo -n npm install -g pm2 2>&1"`,
                    { encoding: 'utf-8', timeout: 120000, stdio: 'pipe' }
                );
            });

            ctx.log('[MCP] pm2 インストール完了（パスワードレス）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            return true;
        } catch (error) {
            ctx.log(`[MCP] pm2 インストール失敗（パスワードレス）: ${error}`);
            // パスワードレスで失敗した場合、パスワード入力にフォールバック
        }
    }

    // パスワード入力が必要な場合
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const password = await promptWslPassword('pm2 のインストール', attempt, MAX_ATTEMPTS);

        if (password === undefined) {
            ctx.log('[MCP] pm2 インストールがキャンセルされました');
            return false;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(
                    `wsl bash -c "sudo -S npm install -g pm2 2>&1"`,
                    { encoding: 'utf-8', timeout: 120000, input: password + '\n' }
                );
            });

            ctx.log('[MCP] pm2 インストール完了');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            cachedWslPassword = password; // startup用にキャッシュ
            return true;
        } catch (error) {
            ctx.log(`[MCP] pm2 インストール試行 ${attempt} 失敗: ${error}`);
        }
    }

    vscode.window.showErrorMessage(
        'pm2 のインストールに失敗しました。\n' +
        'WSL で以下を手動実行してください:\n' +
        'sudo npm install -g pm2'
    );
    return false;
}

/**
 * pm2をMac/Linux環境でインストール
 */
async function installPm2Native(ctx: SetupContext): Promise<boolean> {
    // ターミナルでインストール（sudoパスワード入力が必要な場合があるため）
    const terminal = vscode.window.createTerminal({
        name: '📦 pm2 インストール'
    });
    terminal.show();
    terminal.sendText('sudo npm install -g pm2');

    const result = await vscode.window.showInformationMessage(
        'pm2のインストールを開始しました。\n' +
        'インストールが完了したら「完了」を押してください。\n' +
        '（sudoパスワードの入力が必要な場合があります）',
        '完了',
        'キャンセル'
    );

    if (result === '完了') {
        try {
            runShellCommand('which pm2', { stdio: 'pipe' });
            ctx.log('[MCP] pm2 インストール完了（ネイティブ）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            return true;
        } catch {
            vscode.window.showErrorMessage('pm2 のインストールに失敗したようです。手動でインストールしてください。');
            return false;
        }
    }

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
    if (CURRENT_ENV !== 'windows-native') {
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

        ctx.log(`[MCP] pm2 startup 出力: ${output}`);

        const match = output.match(/sudo .+$/m);
        if (!match) {
            if (output.includes('already')) {
                // 既に設定済みの場合はポップアップを出さずに終了
                ctx.log('[MCP] pm2 startup 既に設定済み');
                return;
            }
            throw new Error('startup コマンドを取得できませんでした');
        }
        startupCommand = match[0];
        ctx.log(`[MCP] startup コマンド: ${startupCommand}`);
    } catch (error) {
        ctx.log(`[MCP] pm2 startup 取得失敗: ${error}`);
        vscode.window.showWarningMessage('自動起動設定の取得に失敗しました');
        return;
    }

    // sudo と env PATH=... の部分を除去（pm2は絶対パスで指定されているので不要）
    const command = startupCommand
        .replace(/^sudo\s+/, '')
        .replace(/env\s+PATH=[^\s]+\s+/, '');
    ctx.log(`[MCP] startup コマンド（整形後）: ${command}`);

    // シェルメタ文字の拒否（コマンドインジェクション防止）
    if (/[;&|`$()\n\r<>]/.test(command)) {
        ctx.log('[MCP] pm2 startup コマンドに不正な文字が含まれています');
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
            ctx.log('[MCP] pm2 startup 設定完了（パスワードレス・自動）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[MCP] pm2 startup 失敗（パスワードレス）: ${error}`);
            // パスワードレスで失敗した場合、ユーザーに確認してからパスワード入力にフォールバック
        }
    }

    // パスワードレスsudoが未設定、またはパスワードレス実行に失敗した場合は確認ダイアログを表示
    const choice = await vscode.window.showInformationMessage(
        'MCPサーバーの自動起動を設定しますか？\n（WSL起動時に自動で起動します）',
        '設定する',
        'スキップ'
    );

    if (choice !== '設定する') {
        ctx.log('[MCP] pm2 startup をスキップ');
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
            ctx.log(`[MCP] 実行コマンド: ${command}`);
            execSync(
                `wsl bash -c "sudo -S ${command}"`,
                { encoding: 'utf-8', timeout: 30000, input: password + '\n' }
            );
            ctx.log('[MCP] pm2 startup 設定完了');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            attempts++;
            ctx.log(`[MCP] pm2 startup 失敗 (${attempts}/${maxAttempts}): ${error}`);
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
            ctx.log(`[MCP] pm2 startup 取得失敗: ${execError}`);
            vscode.window.showWarningMessage('自動起動設定の取得に失敗しました');
            return;
        }
    }

    ctx.log(`[MCP] pm2 startup 出力: ${output}`);

    // 既に設定済みか確認
    if (output.includes('already')) {
        ctx.log('[MCP] pm2 startup 既に設定済み');
        return;
    }

    // sudoコマンドを抽出
    const match = output.match(/sudo .+$/m);
    if (!match) {
        ctx.log('[MCP] startup コマンドが見つかりません');
        return;
    }

    // ユーザーに確認
    const choice = await vscode.window.showInformationMessage(
        'MCPサーバーの自動起動を設定しますか？\n（システム起動時に自動で起動します）',
        '設定する',
        'スキップ'
    );

    if (choice !== '設定する') {
        ctx.log('[MCP] pm2 startup をスキップ');
        return;
    }

    // ターミナルでstartupコマンドを実行（sudoパスワード入力が必要）
    const terminal = vscode.window.createTerminal({
        name: '⚙️ pm2 startup'
    });
    terminal.show();
    terminal.sendText(match[0]);

    const result = await vscode.window.showInformationMessage(
        'pm2 startupの設定を開始しました。\n' +
        '設定が完了したら「完了」を押してください。\n' +
        '（sudoパスワードの入力が必要な場合があります）',
        '完了',
        'キャンセル'
    );

    if (result === '完了') {
        ctx.log('[MCP] pm2 startup 設定完了（ネイティブ）');
        vscode.window.showInformationMessage('✅ 自動起動を設定しました');
    }
}

/**
 * MCPサーバーが起動しているか確認し、起動していなければ起動する
 * - /health エンドポイントでヘルスチェック
 * - 応答がなければ pm2 start/restart を実行
 */
export async function ensureMcpServerRunning(ctx: SetupContext): Promise<void> {
    const healthUrl = `${DASHBOARD_SERVER_URL}/health`;
    const messengerPath = getMcpServerPath();
    const messengerPathForShell = CURRENT_ENV === 'windows-native'
        ? '~/.maid-agent/maid-agent-messenger'
        : messengerPath;

    try {
        // ヘルスチェック（タイムアウト3秒）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            const response = await fetch(healthUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                ctx.log('[MCP] サーバーは起動中');
                return;
            }
        } catch {
            clearTimeout(timeoutId);
        }

        // サーバーが起動していない場合、起動を試みる
        ctx.log('[MCP] サーバーが応答しません。起動を試みます...');

        try {
            runShellCommand(
                `cd ${messengerPathForShell} && pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart maid-agent-messenger 2>/dev/null`,
                { timeout: 10000 }
            );
            ctx.log('[MCP] サーバーを起動しました');

            // 起動待機（最大5秒）
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    const checkController = new AbortController();
                    const checkTimeoutId = setTimeout(() => checkController.abort(), 2000);
                    const checkResponse = await fetch(healthUrl, { signal: checkController.signal });
                    clearTimeout(checkTimeoutId);
                    if (checkResponse.ok) {
                        ctx.log('[MCP] サーバー起動確認完了');
                        return;
                    }
                } catch {
                    // 再試行
                }
            }

            vscode.window.showWarningMessage(
                'MCPサーバーの起動に時間がかかっています。エージェント間通信が不安定になる可能性があります。'
            );
        } catch (error) {
            ctx.log(`[MCP] サーバー起動失敗: ${error}`);
            vscode.window.showWarningMessage(
                'MCPサーバーを起動できませんでした。Init Global を実行してセットアップしてください。'
            );
        }
    } catch (error) {
        ctx.log(`[MCP] ヘルスチェックエラー: ${error}`);
    }
}
