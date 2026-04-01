/**
 * サーバー管理ユーティリティ
 *
 * 設計:
 * - multiplexer.type (tmux/psmux/auto) に基づいてサーバー実行環境を決定
 * - environments.xxx.status が 'ready' でなければエラー
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext } from '../types';
import { ENV, type ServerEnvironment } from './environment-context';
import {
    isEnvironmentReady,
    getReadyEnvironments,
} from './environment-status';

// =============================================================================
// 型定義
// =============================================================================

export type MultiplexerType = 'tmux' | 'psmux' | 'auto';

const PM2_PROCESS_NAME = 'maid-agent-messenger';

// =============================================================================
// デバッグ用出力チャンネル
// =============================================================================

let serverOutputChannel: vscode.OutputChannel | undefined;

function getServerLog(): (msg: string) => void {
    if (!serverOutputChannel) {
        // "Maid Agent" チャンネルに統一（VS Codeは同名チャンネルを共有）
        serverOutputChannel = vscode.window.createOutputChannel('Maid Agent');
    }
    return (msg: string) => {
        console.log(msg);
        serverOutputChannel?.appendLine(msg);
    };
}

// =============================================================================
// 環境決定ロジック
// =============================================================================

/**
 * multiplexer.type から実際に使用するサーバー環境を決定
 */
export function resolveServerEnvironment(multiplexerType: MultiplexerType): ServerEnvironment | null {
    const log = getServerLog();
    log(`[Server] resolveServerEnvironment: multiplexerType=${multiplexerType}, platform=${ENV.platform}`);

    // Mac/Linux の場合は常に local
    if (!ENV.isWindowsNative()) {
        log('[Server] Non-Windows environment, using local');
        return 'local';
    }

    // Windows の場合
    if (multiplexerType === 'tmux') {
        // tmux を指定 → WSL を使用
        if (!isEnvironmentReady('wsl')) {
            log('[Server] WSL environment is not ready');
            return null;
        }
        return 'wsl';
    }

    if (multiplexerType === 'psmux') {
        // psmux を指定 → Windows を使用
        if (!isEnvironmentReady('windows')) {
            log('[Server] Windows environment is not ready');
            return null;
        }
        return 'windows';
    }

    // auto の場合: ready な環境を優先
    const readyEnvs = getReadyEnvironments();
    log(`[Server] auto mode, ready environments: ${readyEnvs.join(', ')}`);

    if (readyEnvs.length === 0) {
        log('[Server] No ready environments');
        return null;
    }

    // Windows環境が ready ならそちらを優先（WSL不要で動作が軽い）
    if (readyEnvs.includes('windows')) {
        return 'windows';
    }
    if (readyEnvs.includes('wsl')) {
        return 'wsl';
    }

    return null;
}

// =============================================================================
// サーバー状態チェック
// =============================================================================

/**
 * 指定環境でサーバーが起動しているかチェック
 */
export function isServerRunningIn(env: ServerEnvironment): boolean {
    const log = getServerLog();
    log(`[Server] isServerRunningIn: env=${env}`);

    try {
        const output = ENV.execInServerEnvironment('pm2 jlist', env, { timeout: 5000 });

        const processes = JSON.parse(output);
        const running = processes.some((p: { name: string; pm2_env?: { status?: string } }) =>
            p.name === PM2_PROCESS_NAME && p.pm2_env?.status === 'online'
        );
        log(`[Server] pm2 check in ${env}: running=${running}`);
        return running;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`[Server] isServerRunningIn(${env}) error: ${errorMsg}`);
        return false;
    }
}

/**
 * サーバーが起動しているかチェック（multiplexer.type に基づく）
 */
export function isServerRunning(multiplexerType: MultiplexerType = 'auto'): boolean {
    const env = resolveServerEnvironment(multiplexerType);
    if (!env) {
        return false;
    }
    return isServerRunningIn(env);
}

// =============================================================================
// サーバー起動・停止
// =============================================================================

/**
 * 環境ごとの maid-agent-messenger パスを取得
 */
function getMessengerPath(env: ServerEnvironment): string {
    if (env === 'wsl') {
        return '~/.maid-agent/maid-agent-messenger';
    }
    if (env === 'windows') {
        return path.join(process.env.USERPROFILE || '', '.maid-agent', 'maid-agent-messenger');
    }
    return path.join(process.env.HOME || '', '.maid-agent', 'maid-agent-messenger');
}

/**
 * 指定環境でサーバーを起動
 */
export async function startServerIn(env: ServerEnvironment, ctx?: SetupContext): Promise<boolean> {
    const log = ctx?.log ?? getServerLog();
    log(`[Server] startServerIn: env=${env}`);

    const messengerPath = getMessengerPath(env);

    // Windows環境の場合、パスの存在チェック
    if (env === 'windows' && !fs.existsSync(messengerPath)) {
        log(`[Server] ERROR: Path does not exist: ${messengerPath}`);
        log(`[Server] maid-agent-messenger ディレクトリが存在しません。Init Global を実行してください。`);
        return false;
    }

    // Windows環境ではcwdオプションで作業ディレクトリを指定、それ以外はcdコマンドを使用
    const startCmd = env === 'windows'
        ? 'pm2 start ecosystem.config.cjs'
        : `cd "${messengerPath}" && pm2 start ecosystem.config.cjs`;
    const deleteAndStartCmd = env === 'windows'
        ? `pm2 delete ${PM2_PROCESS_NAME} & pm2 start ecosystem.config.cjs`
        : `pm2 delete ${PM2_PROCESS_NAME}; cd "${messengerPath}" && pm2 start ecosystem.config.cjs`;
    const execOpts = env === 'windows' ? { timeout: 30000, cwd: messengerPath } : { timeout: 30000 };

    // 1回目: 通常の pm2 start
    try {
        log(`[Server] Starting server in ${env}...`);
        const output = ENV.execInServerEnvironment(startCmd, env, execOpts);
        log(`[Server] pm2 start output: ${output}`);
        log(`[Server] ${env}でサーバーを起動しました`);
        return true;
    } catch (firstError) {
        const firstMsg = firstError instanceof Error ? firstError.message : String(firstError);
        log(`[Server] 1回目の起動失敗: ${firstMsg}`);
    }

    // 2回目: pm2 delete → pm2 start（stale プロセス登録をクリア）
    try {
        log(`[Server] pm2 delete → pm2 start でリトライ...`);
        const output = ENV.execInServerEnvironment(deleteAndStartCmd, env, execOpts);
        log(`[Server] pm2 retry output: ${output}`);
        log(`[Server] ${env}でサーバーを起動しました（リトライ成功）`);
        return true;
    } catch (retryError) {
        const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
        log(`[Server] サーバー起動失敗（リトライ後）: ${retryMsg}`);
        if (retryError instanceof Error && retryError.stack) {
            log(`[Server] Stack: ${retryError.stack}`);
        }
        return false;
    }
}

/**
 * サーバーを起動（multiplexer.type に基づく）
 */
export async function startServer(multiplexerType: MultiplexerType = 'auto', ctx?: SetupContext): Promise<boolean> {
    const log = ctx?.log ?? getServerLog();
    const env = resolveServerEnvironment(multiplexerType);

    if (!env) {
        const readyEnvs = getReadyEnvironments();
        log(`[Server] No suitable environment. Ready: ${readyEnvs.join(', ')}`);
        vscode.window.showErrorMessage(
            `サーバー起動環境がセットアップされていません。\n` +
            `multiplexer.type: ${multiplexerType}\n` +
            `Init Global を実行してください。`
        );
        return false;
    }

    return startServerIn(env, ctx);
}

/**
 * 指定環境でサーバーを停止
 */
export async function stopServerIn(env: ServerEnvironment, ctx?: SetupContext): Promise<boolean> {
    const log = ctx?.log ?? getServerLog();
    log(`[Server] stopServerIn: env=${env}`);

    try {
        ENV.execInServerEnvironment(`pm2 stop ${PM2_PROCESS_NAME}`, env, { timeout: 10000 });
        log(`[Server] ${env}のサーバーを停止しました`);
        return true;
    } catch {
        // 停止済みの場合はエラーになるが無視
        return true;
    }
}

/**
 * サーバーを停止（全環境）
 */
export async function stopServer(ctx?: SetupContext): Promise<boolean> {
    const log = ctx?.log ?? getServerLog();
    log('[Server] stopServer: stopping all environments');

    if (ENV.isWindowsNative()) {
        await stopServerIn('wsl', ctx);
        await stopServerIn('windows', ctx);
    } else {
        await stopServerIn('local', ctx);
    }

    return true;
}

// =============================================================================
// 統合API
// =============================================================================

/**
 * サーバーが起動していることを確認し、必要なら起動する
 * @param multiplexerType multiplexer.type の値
 */
export async function ensureServerRunning(
    multiplexerType: MultiplexerType = 'auto',
    ctx?: SetupContext
): Promise<boolean> {
    const log = ctx?.log ?? getServerLog();

    // Output チャンネルを表示（デバッグ用）
    if (serverOutputChannel) {
        serverOutputChannel.show(true);
    }

    log(`[Server] ensureServerRunning: multiplexerType=${multiplexerType}`);

    // 実行環境を解決
    const env = resolveServerEnvironment(multiplexerType);
    if (!env) {
        const readyEnvs = getReadyEnvironments();
        log(`[Server] No suitable environment. multiplexerType=${multiplexerType}, ready=${readyEnvs.join(',')}`);

        let message = 'サーバー起動環境がセットアップされていません。\n';
        if (multiplexerType === 'tmux') {
            message += 'WSL環境のセットアップが必要です。';
        } else if (multiplexerType === 'psmux') {
            message += 'Windows環境のセットアップが必要です。';
        } else {
            message += 'Init Global を実行してください。';
        }

        vscode.window.showErrorMessage(message);
        return false;
    }

    log(`[Server] Resolved environment: ${env}`);

    // 既に起動中かチェック
    if (isServerRunningIn(env)) {
        log('[Server] Server is already running');
        return true;
    }

    // サーバーを起動
    log('[Server] Server is not running. Starting...');
    const started = await startServerIn(env, ctx);
    log(`[Server] startServerIn returned: ${started}`);

    if (started) {
        // 起動完了を待つ（最大10秒）
        for (let i = 0; i < 10; i++) {
            log(`[Server] Waiting for server to be ready... (${i + 1}/10)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (isServerRunningIn(env)) {
                log('[Server] Server is now running');
                vscode.window.showInformationMessage('maid-agent-messenger サーバーを起動しました');
                return true;
            }
        }
        log('[Server] Server did not become ready within timeout');
    }

    log('[Server] Failed to start server');
    vscode.window.showErrorMessage(
        'maid-agent-messenger サーバーの起動に失敗しました。\n' +
        'Output パネルの "Maid Agent Server" を確認してください。'
    );
    return false;
}

/**
 * マルチプレクサ切替時のサーバー切替
 */
export async function switchServerForMultiplexer(
    newMultiplexerType: MultiplexerType,
    ctx?: SetupContext
): Promise<boolean> {
    const log = ctx?.log ?? getServerLog();
    log(`[Server] switchServerForMultiplexer: newType=${newMultiplexerType}`);

    // 全サーバーを停止
    await stopServer(ctx);

    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 新しい環境でサーバーを起動
    return await startServer(newMultiplexerType, ctx);
}
