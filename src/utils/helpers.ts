import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { MaidConfig } from '../types';
import { CURRENT_ENV } from './environment';
import { GLOBAL_MAID_AGENT_DIR, TMUX_SESSION_PREFIX, MAIDS_MAP, DEFAULT_MAID_ORDER } from '../constants';

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * グローバルフォルダのパスを取得
 * Windows環境ではWSLのホームディレクトリを使用
 */
export function getGlobalMaidAgentPath(): string {
    if (CURRENT_ENV === 'windows-native') {
        // Windows環境: WSLのホームディレクトリを使用
        try {
            // シングルクォートで囲んでWindowsシェルでの$HOME展開を防ぐ
            const wslHome = execSync("wsl bash -c 'echo $HOME'", { encoding: 'utf-8' }).trim();
            // WSLディストリビューション名を取得（UTF-16のヌルバイトと空白を除去）
            const distroRaw = execSync('wsl -l -q', { encoding: 'utf-8' });
            const distro = distroRaw.replace(/\0/g, '').split('\n')[0].trim();
            // スラッシュをバックスラッシュに変換してパスを構築
            const windowsHome = wslHome.replace(/\//g, '\\');
            return `\\\\wsl$\\${distro}${windowsHome}\\${GLOBAL_MAID_AGENT_DIR}`;
        } catch {
            // フォールバック: Windowsのホームディレクトリ
            return path.join(os.homedir(), GLOBAL_MAID_AGENT_DIR);
        }
    }
    return path.join(os.homedir(), GLOBAL_MAID_AGENT_DIR);
}

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
