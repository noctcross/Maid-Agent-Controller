/**
 * ファイル監視モジュール
 *
 * .maid-agent ディレクトリ内のファイル変更を監視し、
 * 報告書の更新時にメイドへのリマインドを行う。
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../types';
import { NOTIFICATIONS_SUBDIR } from '../constants';

/**
 * ファイル監視に必要なコンテキスト
 */
export interface FileWatcherContext {
    maidAgentPath: string | undefined;
    agents: Map<string, Agent>;
    context: vscode.ExtensionContext | undefined;
    log: (msg: string) => void;
    updateController: () => void;
    sendMessageToAgent: (agentId: string, message: string) => Promise<boolean>;
}

/**
 * ファイル監視の状態
 */
export interface FileWatcherState {
    fileWatcher: vscode.FileSystemWatcher | undefined;
    pendingReportChecks: Map<string, NodeJS.Timeout>;
}

/**
 * ファイル監視の状態を初期化
 */
export function createFileWatcherState(): FileWatcherState {
    return {
        fileWatcher: undefined,
        pendingReportChecks: new Map(),
    };
}

/**
 * ファイル監視を開始
 */
export function startWatchingFiles(
    ctx: FileWatcherContext,
    state: FileWatcherState,
    silent: boolean = false
): void {
    if (!ctx.maidAgentPath) return;

    // 既に監視中なら何もしない
    if (state.fileWatcher) {
        if (!silent) {
            vscode.window.showInformationMessage('📁 ファイル監視・通知システムは既に動作中です');
        }
        return;
    }

    // queue/*.yaml と reports/*.md を監視
    const pattern = new vscode.RelativePattern(
        ctx.maidAgentPath,
        '{queue/*.yaml,reports/*.md}'
    );

    state.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    state.fileWatcher.onDidChange((uri) => {
        const fileName = path.basename(uri.fsPath);
        ctx.log(`[ファイル変更] ${fileName}`);
        ctx.updateController();

        // reports/*.md が更新されたらメイド長への報告チェック
        const reportsDir = `${path.sep}reports${path.sep}`;
        if (uri.fsPath.includes(reportsDir) && fileName.endsWith('.md') && fileName !== '.gitkeep') {
            const maidName = fileName.replace('.md', '');
            checkMaidReportToChief(ctx, state, maidName);
        }
    });

    ctx.context?.subscriptions.push(state.fileWatcher);
    ctx.log('[ファイル監視] 開始');

    if (!silent) {
        vscode.window.showInformationMessage('📁 ファイル監視を開始しました');
    }
}

/**
 * ファイル監視を停止
 */
export function stopWatchingFiles(
    ctx: FileWatcherContext,
    state: FileWatcherState
): void {
    if (state.fileWatcher) {
        state.fileWatcher.dispose();
        state.fileWatcher = undefined;
    }
    ctx.log('[ファイル監視] 停止');
    vscode.window.showInformationMessage('📁 ファイル監視・通知システムを停止しました');
}

/**
 * メイドがメイド長に報告したかチェック
 * reports/*.md 更新後、5秒以内にchief宛の通知がなければリマインド
 */
function checkMaidReportToChief(
    ctx: FileWatcherContext,
    state: FileWatcherState,
    maidName: string
): void {
    // 既存のタイマーがあればクリア（連続更新対応）
    const existingTimer = state.pendingReportChecks.get(maidName);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    ctx.log(`[報告チェック] ${maidName} のレポート更新を検知、5秒後にチェック`);

    // 5秒後にチェック
    const timer = setTimeout(async () => {
        try {
            state.pendingReportChecks.delete(maidName);

            // 通知履歴ログを確認
            if (!ctx.maidAgentPath) return;

            const historyPath = path.join(ctx.maidAgentPath, NOTIFICATIONS_SUBDIR, 'history.log');
            let hasNotifiedChief = false;

            try {
                if (fs.existsSync(historyPath)) {
                    const content = fs.readFileSync(historyPath, 'utf-8');
                    const lines = content.trim().split('\n');

                    // 直近30秒以内にこのメイドからchiefへの通知があるかチェック
                    // ログ形式: [2025-01-29 12:34:56] sender → target: message
                    const now = Date.now();
                    const thirtySecondsAgo = now - 30000;

                    const pattern = new RegExp(`^\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\] ${maidName} → chief:`);

                    for (const line of lines.reverse()) {  // 新しいものから確認
                        const match = line.match(pattern);
                        if (match) {
                            const notifyTime = new Date(match[1]).getTime();
                            if (notifyTime > thirtySecondsAgo) {
                                hasNotifiedChief = true;
                                break;
                            }
                            // 30秒より古い通知なら、それ以前は確認不要
                            break;
                        }
                    }
                }
            } catch {
                // パースエラーなどは無視
            }

            if (!hasNotifiedChief) {
                // メイドがアクティブかチェック
                const maid = ctx.agents.get(maidName);
                if (maid) {
                    ctx.log(`[報告チェック] ${maidName} がメイド長への報告を忘れている可能性`);

                    // リマインドを送信
                    const reminder = `レポートを更新したようですが、メイド長への報告はお済みですか？\n完了した場合は .maid-agent/system/bin/maid-notify chief "タスク完了の報告" を実行してください。`;
                    await ctx.sendMessageToAgent(maidName, reminder);

                    ctx.log(`[報告チェック] ${maidName} にリマインドを送信しました`);
                }
            } else {
                ctx.log(`[報告チェック] ${maidName} は正常にメイド長へ報告済み`);
            }
        } catch (error) {
            ctx.log(`[報告チェック] ${maidName} のチェック中にエラー: ${error}`);
        }
    }, 5000);

    state.pendingReportChecks.set(maidName, timer);
}

/**
 * ファイル監視の状態をクリーンアップ
 */
export function disposeFileWatcher(state: FileWatcherState): void {
    // 報告チェックタイマーを全クリア
    for (const timer of state.pendingReportChecks.values()) {
        clearTimeout(timer);
    }
    state.pendingReportChecks.clear();

    // ファイルウォッチャーを解放
    state.fileWatcher?.dispose();
    state.fileWatcher = undefined;
}
