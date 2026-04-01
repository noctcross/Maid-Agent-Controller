/**
 * cleanup.ts - Maid Agent クリーンアップ機能
 *
 * Phase 2のcleanup.shロジックをVSCode UI（QuickPick、確認ダイアログ）で実装
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getGlobalMaidAgentPath, getSessionNameFromPath } from '../utils/helpers';
import { MultiplexerFactory } from '../multiplexer';

// =============================================================================
// 型定義
// =============================================================================

interface CleanupTarget {
    path: string;
    description: string;
    size?: number;
    requiresConfirm: boolean;  // true = ユーザーデータの可能性あり
}

interface CleanupResult {
    deleted: string[];
    skipped: string[];
    errors: string[];
}

type CleanupMode = 'tmux' | 'global' | 'project' | 'all';

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * ディレクトリサイズを取得（バイト）
 */
function getDirSize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;

    let totalSize = 0;
    try {
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
            const filePath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                totalSize += getDirSize(filePath);
            } else {
                try {
                    totalSize += fs.statSync(filePath).size;
                } catch {
                    // ファイルアクセスエラーは無視
                }
            }
        }
    } catch {
        // ディレクトリアクセスエラーは無視
    }
    return totalSize;
}

/**
 * バイトを人間が読みやすい形式に変換
 */
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

/**
 * 安全な削除（存在チェック付き）
 */
function safeDelete(targetPath: string): boolean {
    if (!fs.existsSync(targetPath)) return false;

    try {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(targetPath);
        }
        return true;
    } catch (error) {
        console.error(`削除エラー: ${targetPath}`, error);
        return false;
    }
}

// =============================================================================
// tmuxセッション管理
// =============================================================================

/**
 * Maid Agent関連のtmuxセッション一覧を取得
 */
function listMaidAgentSessions(): string[] {
    try {
        const factory = new MultiplexerFactory();
        const { sessions } = factory.countMaidAgentSessions();
        return sessions;
    } catch {
        return [];
    }
}

/**
 * tmuxセッションを終了
 */
function killTmuxSession(sessionName: string): boolean {
    try {
        const factory = new MultiplexerFactory();
        return factory.killSessionByName(sessionName);
    } catch {
        return false;
    }
}

// =============================================================================
// クリーンアップ対象の収集
// =============================================================================

/**
 * グローバル設定のクリーンアップ対象を収集
 */
function collectGlobalTargets(): CleanupTarget[] {
    const globalDir = getGlobalMaidAgentPath();
    const targets: CleanupTarget[] = [];

    if (!fs.existsSync(globalDir)) return targets;

    // 削除推奨（再生成可能）
    const safeTargets = [
        { subPath: 'maid-agent-messenger/node_modules', desc: 'node_modules (パッケージ)' },
        { subPath: 'maid-agent-messenger/dist', desc: 'dist (ビルド成果物)' },
        { subPath: 'maid-agent-messenger/logs', desc: 'logs (ログファイル)' },
    ];

    for (const { subPath, desc } of safeTargets) {
        const fullPath = path.join(globalDir, subPath);
        if (fs.existsSync(fullPath)) {
            targets.push({
                path: fullPath,
                description: desc,
                size: getDirSize(fullPath),
                requiresConfirm: false,
            });
        }
    }

    // 確認が必要（ユーザーデータの可能性）
    const userDataTargets = [
        { subPath: 'rules', desc: 'rules/ (ユーザー作成ルール)' },
        { subPath: 'skills', desc: 'skills/ (ユーザー作成スキル)' },
        { subPath: 'system/config', desc: 'system/config/ (設定ファイル)' },
        { subPath: 'reports', desc: 'reports/ (グローバルレポート)' },
    ];

    for (const { subPath, desc } of userDataTargets) {
        const fullPath = path.join(globalDir, subPath);
        if (fs.existsSync(fullPath)) {
            targets.push({
                path: fullPath,
                description: desc,
                size: getDirSize(fullPath),
                requiresConfirm: true,
            });
        }
    }

    return targets;
}

/**
 * プロジェクト設定のクリーンアップ対象を収集
 */
function collectProjectTargets(projectPath: string): CleanupTarget[] {
    const maidAgentDir = path.join(projectPath, '.maid-agent');
    const targets: CleanupTarget[] = [];

    if (!fs.existsSync(maidAgentDir)) return targets;

    // 削除推奨（一時ファイル）
    const tempTargets = [
        { subPath: 'system/data/maid', desc: 'maid/ (状態ファイル)' },
        { subPath: 'system/data/reports', desc: 'reports/ (現在の報告書)' },
        { subPath: 'system/data/notifications', desc: 'notifications/ (通知ファイル)' },
        { subPath: 'system/config/.session-name', desc: '.session-name (セッション名)' },
    ];

    for (const { subPath, desc } of tempTargets) {
        const fullPath = path.join(maidAgentDir, subPath);
        if (fs.existsSync(fullPath)) {
            targets.push({
                path: fullPath,
                description: desc,
                size: getDirSize(fullPath),
                requiresConfirm: false,
            });
        }
    }

    // 確認が必要（ユーザーデータの可能性）
    const userDataTargets = [
        { subPath: 'master', desc: 'master/ (ご主人様のメモ・報告書)' },
        { subPath: 'agents', desc: 'agents/ (エージェント設定・カスタマイズ)' },
        { subPath: 'system/data/tasks.yaml', desc: 'tasks.yaml (作業履歴)' },
    ];

    for (const { subPath, desc } of userDataTargets) {
        const fullPath = path.join(maidAgentDir, subPath);
        if (fs.existsSync(fullPath)) {
            targets.push({
                path: fullPath,
                description: desc,
                size: fs.statSync(fullPath).isDirectory() ? getDirSize(fullPath) : fs.statSync(fullPath).size,
                requiresConfirm: true,
            });
        }
    }

    return targets;
}

// =============================================================================
// メインのクリーンアップ関数（VSCode UI）
// =============================================================================

/**
 * クリーンアップコマンド（VSCode QuickPick UI）
 */
export async function showCleanupQuickPick(
    workspaceRoot: string | undefined,
    log: (msg: string) => void
): Promise<void> {
    // モード選択
    const modeItems: vscode.QuickPickItem[] = [
        {
            label: '$(trash) tmuxセッションのみ',
            description: 'Maid Agent関連のtmuxセッションを終了',
            detail: 'maid-agent-* パターンに一致するセッションを終了します',
        },
        {
            label: '$(home) グローバル設定',
            description: '~/.maid-agent/ の一時ファイルを削除',
            detail: 'node_modules, dist, logs などの再生成可能なファイルを削除',
        },
        {
            label: '$(folder) プロジェクト設定',
            description: '.maid-agent/ の一時ファイルを削除',
            detail: 'maid/, reports/, notifications/ などの一時ファイルを削除',
        },
        {
            label: '$(warning) 全リソース',
            description: 'tmux + グローバル + プロジェクト',
            detail: '全てのMaid Agentリソースをクリーンアップ',
        },
    ];

    const modeSelection = await vscode.window.showQuickPick(modeItems, {
        title: '🧹 Maid Agent クリーンアップ',
        placeHolder: 'クリーンアップ対象を選択してください',
    });

    if (!modeSelection) return;

    // モードを判定
    let mode: CleanupMode;
    if (modeSelection.label.includes('tmux')) {
        mode = 'tmux';
    } else if (modeSelection.label.includes('グローバル')) {
        mode = 'global';
    } else if (modeSelection.label.includes('プロジェクト')) {
        mode = 'project';
    } else {
        mode = 'all';
    }

    // Dry-runオプション
    const dryRunOption = await vscode.window.showQuickPick([
        { label: '$(play) 実行', description: '実際に削除を実行' },
        { label: '$(eye) プレビュー', description: '削除対象を確認のみ（dry-run）' },
    ], {
        title: '実行モード',
        placeHolder: '実行モードを選択してください',
    });

    if (!dryRunOption) return;

    const isDryRun = dryRunOption.label.includes('プレビュー');

    // クリーンアップ実行
    const result = await executeCleanup(mode, workspaceRoot, isDryRun, log);

    // 結果表示
    showCleanupResult(result, isDryRun);
}

/**
 * クリーンアップ実行
 */
async function executeCleanup(
    mode: CleanupMode,
    workspaceRoot: string | undefined,
    isDryRun: boolean,
    log: (msg: string) => void
): Promise<CleanupResult> {
    const result: CleanupResult = {
        deleted: [],
        skipped: [],
        errors: [],
    };

    log(`[Cleanup] モード: ${mode}, dry-run: ${isDryRun}`);

    // tmuxセッションのクリーンアップ
    if (mode === 'tmux' || mode === 'all') {
        await cleanupTmuxSessions(result, isDryRun, log);
    }

    // グローバル設定のクリーンアップ
    if (mode === 'global' || mode === 'all') {
        await cleanupGlobal(result, isDryRun, log);
    }

    // プロジェクト設定のクリーンアップ
    if ((mode === 'project' || mode === 'all') && workspaceRoot) {
        await cleanupProject(workspaceRoot, result, isDryRun, log);
    } else if (mode === 'project' && !workspaceRoot) {
        result.errors.push('ワークスペースが開かれていません');
    }

    return result;
}

/**
 * tmuxセッションのクリーンアップ
 */
async function cleanupTmuxSessions(
    result: CleanupResult,
    isDryRun: boolean,
    log: (msg: string) => void
): Promise<void> {
    const sessions = listMaidAgentSessions();

    if (sessions.length === 0) {
        log('[Cleanup] Maid Agent関連のtmuxセッションはありません');
        result.skipped.push('tmuxセッション: なし');
        return;
    }

    log(`[Cleanup] 検出されたtmuxセッション: ${sessions.length}件`);

    // セッション選択（複数選択可能）
    const sessionItems = sessions.map(s => ({
        label: s,
        picked: true,  // デフォルトで全選択
    }));

    const selected = await vscode.window.showQuickPick(sessionItems, {
        title: 'tmuxセッションを選択',
        placeHolder: '終了するセッションを選択してください（複数選択可）',
        canPickMany: true,
    });

    if (!selected || selected.length === 0) {
        result.skipped.push('tmuxセッション: キャンセル');
        return;
    }

    for (const item of selected) {
        if (isDryRun) {
            log(`[Cleanup] [DRY-RUN] 終了予定: ${item.label}`);
            result.deleted.push(`tmux: ${item.label} (dry-run)`);
        } else {
            if (killTmuxSession(item.label)) {
                log(`[Cleanup] 終了: ${item.label}`);
                result.deleted.push(`tmux: ${item.label}`);
            } else {
                log(`[Cleanup] 終了失敗: ${item.label}`);
                result.errors.push(`tmux: ${item.label}`);
            }
        }
    }
}

/**
 * グローバル設定のクリーンアップ
 */
async function cleanupGlobal(
    result: CleanupResult,
    isDryRun: boolean,
    log: (msg: string) => void
): Promise<void> {
    const targets = collectGlobalTargets();

    if (targets.length === 0) {
        log('[Cleanup] グローバル設定に削除対象がありません');
        result.skipped.push('グローバル設定: なし');
        return;
    }

    // 安全なターゲット（確認不要）
    const safeTargets = targets.filter(t => !t.requiresConfirm);
    // ユーザーデータ（確認必要）
    const userDataTargets = targets.filter(t => t.requiresConfirm);

    // 安全なターゲットを削除
    for (const target of safeTargets) {
        const sizeStr = target.size ? ` (${formatSize(target.size)})` : '';
        if (isDryRun) {
            log(`[Cleanup] [DRY-RUN] 削除予定: ${target.description}${sizeStr}`);
            result.deleted.push(`${target.description}${sizeStr} (dry-run)`);
        } else {
            if (safeDelete(target.path)) {
                log(`[Cleanup] 削除: ${target.description}${sizeStr}`);
                result.deleted.push(`${target.description}${sizeStr}`);
            } else {
                result.errors.push(target.description);
            }
        }
    }

    // ユーザーデータは個別確認
    if (userDataTargets.length > 0) {
        const userDataItems = userDataTargets.map(t => ({
            label: t.description,
            description: t.size ? formatSize(t.size) : '',
            detail: t.path,
            target: t,
            picked: false,  // デフォルトで未選択
        }));

        const selected = await vscode.window.showQuickPick(userDataItems, {
            title: '⚠️ ユーザーデータの削除確認',
            placeHolder: '削除するユーザーデータを選択（慎重に選択してください）',
            canPickMany: true,
        });

        if (selected && selected.length > 0) {
            for (const item of selected) {
                const target = (item as any).target as CleanupTarget;
                const sizeStr = target.size ? ` (${formatSize(target.size)})` : '';

                if (isDryRun) {
                    log(`[Cleanup] [DRY-RUN] 削除予定: ${target.description}${sizeStr}`);
                    result.deleted.push(`${target.description}${sizeStr} (dry-run)`);
                } else {
                    if (safeDelete(target.path)) {
                        log(`[Cleanup] 削除: ${target.description}${sizeStr}`);
                        result.deleted.push(`${target.description}${sizeStr}`);
                    } else {
                        result.errors.push(target.description);
                    }
                }
            }
        } else {
            for (const t of userDataTargets) {
                result.skipped.push(t.description);
            }
        }
    }
}

/**
 * プロジェクト設定のクリーンアップ
 */
async function cleanupProject(
    projectPath: string,
    result: CleanupResult,
    isDryRun: boolean,
    log: (msg: string) => void
): Promise<void> {
    const targets = collectProjectTargets(projectPath);

    if (targets.length === 0) {
        log('[Cleanup] プロジェクト設定に削除対象がありません');
        result.skipped.push('プロジェクト設定: なし');
        return;
    }

    // 安全なターゲット（確認不要）
    const safeTargets = targets.filter(t => !t.requiresConfirm);
    // ユーザーデータ（確認必要）
    const userDataTargets = targets.filter(t => t.requiresConfirm);

    // 安全なターゲットを削除
    for (const target of safeTargets) {
        const sizeStr = target.size ? ` (${formatSize(target.size)})` : '';
        if (isDryRun) {
            log(`[Cleanup] [DRY-RUN] 削除予定: ${target.description}${sizeStr}`);
            result.deleted.push(`${target.description}${sizeStr} (dry-run)`);
        } else {
            if (safeDelete(target.path)) {
                log(`[Cleanup] 削除: ${target.description}${sizeStr}`);
                result.deleted.push(`${target.description}${sizeStr}`);
            } else {
                result.errors.push(target.description);
            }
        }
    }

    // ユーザーデータは個別確認
    if (userDataTargets.length > 0) {
        const userDataItems = userDataTargets.map(t => ({
            label: t.description,
            description: t.size ? formatSize(t.size) : '',
            detail: t.path,
            target: t,
            picked: false,
        }));

        const selected = await vscode.window.showQuickPick(userDataItems, {
            title: '⚠️ ユーザーデータの削除確認（プロジェクト）',
            placeHolder: '削除するユーザーデータを選択（慎重に選択してください）',
            canPickMany: true,
        });

        if (selected && selected.length > 0) {
            for (const item of selected) {
                const target = (item as any).target as CleanupTarget;
                const sizeStr = target.size ? ` (${formatSize(target.size)})` : '';

                if (isDryRun) {
                    log(`[Cleanup] [DRY-RUN] 削除予定: ${target.description}${sizeStr}`);
                    result.deleted.push(`${target.description}${sizeStr} (dry-run)`);
                } else {
                    if (safeDelete(target.path)) {
                        log(`[Cleanup] 削除: ${target.description}${sizeStr}`);
                        result.deleted.push(`${target.description}${sizeStr}`);
                    } else {
                        result.errors.push(target.description);
                    }
                }
            }
        } else {
            for (const t of userDataTargets) {
                result.skipped.push(t.description);
            }
        }
    }
}

/**
 * クリーンアップ結果を表示
 */
function showCleanupResult(result: CleanupResult, isDryRun: boolean): void {
    const prefix = isDryRun ? '[プレビュー] ' : '';

    let message = `${prefix}クリーンアップ完了\n\n`;

    if (result.deleted.length > 0) {
        message += `✅ ${isDryRun ? '削除予定' : '削除済み'}: ${result.deleted.length}件\n`;
    }

    if (result.skipped.length > 0) {
        message += `⏭️ スキップ: ${result.skipped.length}件\n`;
    }

    if (result.errors.length > 0) {
        message += `❌ エラー: ${result.errors.length}件\n`;
    }

    // 詳細表示オプション
    const showDetails = result.deleted.length + result.errors.length > 0;

    if (showDetails) {
        vscode.window.showInformationMessage(
            message.trim(),
            '詳細を表示'
        ).then(choice => {
            if (choice === '詳細を表示') {
                const details = [
                    '=== クリーンアップ結果 ===',
                    '',
                    isDryRun ? '--- 削除予定 ---' : '--- 削除済み ---',
                    ...result.deleted,
                    '',
                    '--- スキップ ---',
                    ...result.skipped,
                    '',
                    '--- エラー ---',
                    ...result.errors,
                ].join('\n');

                vscode.workspace.openTextDocument({ content: details, language: 'markdown' })
                    .then(doc => vscode.window.showTextDocument(doc));
            }
        });
    } else {
        vscode.window.showInformationMessage(message.trim());
    }
}
