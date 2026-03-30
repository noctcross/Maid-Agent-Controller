/**
 * サーバー管理ユーティリティ
 *
 * 設計:
 * - multiplexer.type (tmux/psmux/auto) に基づいてサーバー実行環境を決定
 * - environments.xxx.status が 'ready' でなければエラー
 */
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext } from '../types';
import { CURRENT_ENV } from './environment';
import {
    getEnvironmentStatus,
    isEnvironmentReady,
    getReadyEnvironments,
    EnvironmentType,
} from '../setup/global-init';

// =============================================================================
// 型定義
// =============================================================================

export type MultiplexerType = 'tmux' | 'psmux' | 'auto';

/**
 * サーバー実行環境
 * - 'wsl': WSL内でpm2実行
 * - 'windows': Windowsネイティブでpm2実行
 * - 'local': Mac/Linuxで直接pm2実行
 */
export type ServerEnvironment = 'wsl' | 'windows' | 'local';

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
    log(`[Server] resolveServerEnvironment: multiplexerType=${multiplexerType}, CURRENT_ENV=${CURRENT_ENV}`);

    // Mac/Linux の場合は常に local
    if (CURRENT_ENV !== 'windows-native') {
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
        let output: string;

        if (env === 'wsl') {
            output = execSync('wsl bash -lc "pm2 jlist 2>/dev/null"', {
                encoding: 'utf-8',
                timeout: 5000
            });
        } else if (env === 'windows') {
            output = execSync('cmd.exe /c "pm2 jlist 2>nul"', {
                encoding: 'utf-8',
                timeout: 5000,
                windowsHide: true,
            });
        } else {
            output = execSync('pm2 jlist 2>/dev/null', {
                encoding: 'utf-8',
                timeout: 5000
            });
        }

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

interface Pm2Commands {
    start: string;
    deleteAndStart: string;
    cwd?: string;
}

/**
 * 環境ごとの pm2 start コマンドを生成
 */
function buildPm2StartCommand(env: ServerEnvironment): Pm2Commands {
    if (env === 'wsl') {
        const wslPath = '~/.maid-agent/maid-agent-messenger';
        return {
            start: `wsl bash -lc "cd ${wslPath} && pm2 start ecosystem.config.cjs 2>&1"`,
            deleteAndStart: `wsl bash -lc "pm2 delete ${PM2_PROCESS_NAME} 2>/dev/null; cd ${wslPath} && pm2 start ecosystem.config.cjs 2>&1"`,
        };
    }

    if (env === 'windows') {
        const homeDir = process.env.USERPROFILE || '';
        const messengerPath = path.join(homeDir, '.maid-agent', 'maid-agent-messenger');
        return {
            start: 'cmd.exe /c "pm2 start ecosystem.config.cjs"',
            deleteAndStart: `cmd.exe /c "pm2 delete ${PM2_PROCESS_NAME} 2>nul & pm2 start ecosystem.config.cjs"`,
            cwd: messengerPath,
        };
    }

    // local (Mac/Linux)
    const homeDir = process.env.HOME || '';
    const messengerPath = path.join(homeDir, '.maid-agent', 'maid-agent-messenger');
    return {
        start: `cd "${messengerPath}" && pm2 start ecosystem.config.cjs 2>&1`,
        deleteAndStart: `pm2 delete ${PM2_PROCESS_NAME} 2>/dev/null; cd "${messengerPath}" && pm2 start ecosystem.config.cjs 2>&1`,
    };
}

/**
 * 指定環境でサーバーを起動
 */
export async function startServerIn(env: ServerEnvironment, ctx?: SetupContext): Promise<boolean> {
    const log = ctx?.log ?? getServerLog();
    log(`[Server] startServerIn: env=${env}`);

    // Windows環境の場合、パスの存在チェック
    if (env === 'windows') {
        const homeDir = process.env.USERPROFILE || '';
        const messengerPath = path.join(homeDir, '.maid-agent', 'maid-agent-messenger');
        if (!fs.existsSync(messengerPath)) {
            log(`[Server] ERROR: Path does not exist: ${messengerPath}`);
            log(`[Server] maid-agent-messenger ディレクトリが存在しません。Init Global を実行してください。`);
            return false;
        }
    }

    const commands = buildPm2StartCommand(env);
    const execOpts = {
        encoding: 'utf-8' as const,
        timeout: 30000,
        ...(env === 'windows' ? { windowsHide: true } : {}),
        ...(commands.cwd ? { cwd: commands.cwd } : {}),
    };

    // 1回目: 通常の pm2 start
    try {
        log(`[Server] Starting server in ${env}...`);
        const output = execSync(commands.start, execOpts);
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
        const output = execSync(commands.deleteAndStart, execOpts);
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
        if (env === 'wsl') {
            execSync(`wsl bash -lc "pm2 stop ${PM2_PROCESS_NAME} 2>&1"`, {
                encoding: 'utf-8',
                timeout: 10000
            });
            log('[Server] WSL内のサーバーを停止しました');
        } else if (env === 'windows') {
            execSync(`cmd.exe /c "pm2 stop ${PM2_PROCESS_NAME} 2>nul"`, {
                encoding: 'utf-8',
                timeout: 10000,
                windowsHide: true,
            });
            log('[Server] Windowsのサーバーを停止しました');
        } else {
            execSync(`pm2 stop ${PM2_PROCESS_NAME} 2>&1`, {
                encoding: 'utf-8',
                timeout: 10000
            });
            log('[Server] サーバーを停止しました');
        }
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

    if (CURRENT_ENV === 'windows-native') {
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
