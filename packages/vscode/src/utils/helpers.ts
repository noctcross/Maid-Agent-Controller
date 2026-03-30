import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { MaidConfig, RuntimeMode } from '../types';
import { ENV } from './environment';
import { GLOBAL_MAID_AGENT_DIR, TMUX_SESSION_PREFIX, MAIDS_MAP, DEFAULT_MAID_ORDER } from '../constants';

// =============================================================================
// パス関連ヘルパー関数
// =============================================================================

/**
 * グローバル設定用フォルダのパスを取得
 * Windows環境では常に %USERPROFILE%\.maid-agent を返す（設定の保存場所として）
 * Mac/Linux では ~/.maid-agent を返す
 */
export function getGlobalMaidAgentPath(): string {
    if (ENV.isWindowsNative()) {
        // Windows環境: 常にWindowsのホームディレクトリを使用（設定保存用）
        return path.join(process.env.USERPROFILE || os.homedir(), GLOBAL_MAID_AGENT_DIR);
    }
    return path.join(os.homedir(), GLOBAL_MAID_AGENT_DIR);
}

/**
 * WSL内の .maid-agent パスを取得（Windows環境からWSLにアクセスする場合）
 * @returns UNCパス形式（\\wsl.localhost\Ubuntu\home\user\.maid-agent）
 */
export function getWslMaidAgentPath(): string {
    if (!ENV.isWindowsNative()) {
        // Mac/Linux では通常のパスを返す
        return path.join(os.homedir(), GLOBAL_MAID_AGENT_DIR);
    }

    try {
        const wslHome = execSync("wsl bash -c 'echo $HOME'", { encoding: 'utf-8' }).trim();
        const distroRaw = execSync('wsl -l -q', { encoding: 'utf-8' });
        const distro = distroRaw.replace(/\0/g, '').split('\n')[0].trim();
        const windowsHome = wslHome.replace(/\//g, '\\');

        // Windows 11 (Build 22000+) では \\wsl.localhost\ を優先
        const win11Path = `\\\\wsl.localhost\\${distro}${windowsHome}\\${GLOBAL_MAID_AGENT_DIR}`;
        const win10Path = `\\\\wsl$\\${distro}${windowsHome}\\${GLOBAL_MAID_AGENT_DIR}`;

        try {
            const win11Parent = `\\\\wsl.localhost\\${distro}${windowsHome}`;
            if (fs.existsSync(win11Parent)) {
                return win11Path;
            }
        } catch {
            // win11 パスへのアクセス失敗時は win10 にフォールバック
        }
        return win10Path;
    } catch {
        // WSLが使えない場合はWindowsパスにフォールバック
        return path.join(process.env.USERPROFILE || os.homedir(), GLOBAL_MAID_AGENT_DIR);
    }
}

/**
 * 実行環境用の .maid-agent パスを取得（サーバー・ツール用）
 * @param runtimeMode ランタイムモード
 * @returns 実行環境に応じたパス
 */
export function getExecutionMaidAgentPath(runtimeMode: RuntimeMode): string {
    if (!ENV.isWindowsNative()) {
        // Mac/Linux: 常にローカルパス
        return path.join(os.homedir(), GLOBAL_MAID_AGENT_DIR);
    }

    // Windows環境
    if (runtimeMode === 'windows-native') {
        // Psmuxモード: Windowsパス
        return path.join(process.env.USERPROFILE || os.homedir(), GLOBAL_MAID_AGENT_DIR);
    } else {
        // WSLモード: WSL内のパス（UNC形式）
        return getWslMaidAgentPath();
    }
}

/**
 * 実行環境用の messenger サーバーパスを取得
 * @param runtimeMode ランタイムモード
 * @returns messenger サーバーのパス
 */
export function getMessengerPath(runtimeMode: RuntimeMode): string {
    return path.join(getExecutionMaidAgentPath(runtimeMode), 'maid-agent-messenger');
}

// =============================================================================
// その他のヘルパー関数
// =============================================================================

/**
 * 文字列から短いハッシュを生成
 */
export function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}

/**
 * ワークスペースパスからtmuxセッション名を生成
 * - ディレクトリ名を使用（読みやすさのため）
 * - 安全な文字のみにフィルタリング
 * - 短いハッシュを追加（衝突防止）
 */
export function getSessionNameFromPath(workspacePath: string): string {
    const dirName = path.basename(workspacePath);

    // 安全な文字のみ抽出（小文字アルファベット、数字、ハイフン、アンダースコア）
    const safeName = dirName.toLowerCase()
        .replace(/\s+/g, '-')           // スペースをハイフンに
        .replace(/[^a-z0-9_-]/g, '')    // 安全でない文字を除去
        .replace(/-+/g, '-')            // 連続ハイフンを1つに
        .replace(/^-|-$/g, '')          // 先頭・末尾のハイフンを除去
        .substring(0, 20);              // 長すぎる場合は切り詰め

    // 短いハッシュを追加（同名フォルダの衝突防止）
    const shortHash = hashString(workspacePath).substring(0, 4);

    if (safeName.length > 0) {
        return `${TMUX_SESSION_PREFIX}-${safeName}-${shortHash}`;
    }
    // 安全な文字が残らない場合（日本語のみのフォルダ名など）はハッシュのみ
    return `${TMUX_SESSION_PREFIX}-${hashString(workspacePath)}`;
}

/**
 * 設定からメイドの順序を取得
 */
export function getOrderedMaids(): MaidConfig[] {
    const config = vscode.workspace.getConfiguration('maidAgent');
    const maidOrder = config.get<string[]>('maidOrder', DEFAULT_MAID_ORDER);

    // 設定に基づいて順序付けされたメイドリストを作成
    const orderedMaids: MaidConfig[] = [];
    for (const id of maidOrder) {
        if (MAIDS_MAP[id]) {
            orderedMaids.push(MAIDS_MAP[id]);
        }
    }

    // 設定に含まれていないメイドを追加（安全のため）
    for (const id of DEFAULT_MAID_ORDER) {
        if (!maidOrder.includes(id) && MAIDS_MAP[id]) {
            orderedMaids.push(MAIDS_MAP[id]);
        }
    }

    return orderedMaids;
}

// =============================================================================
// エラーフォーマット
// =============================================================================

/**
 * エラーオブジェクトからユーザー向けメッセージを抽出
 * unknown 型の catch 変数を安全に文字列化する
 */
export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return String(error);
}
