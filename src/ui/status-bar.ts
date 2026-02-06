import * as vscode from 'vscode';
import { DashboardContext } from '../types';

/**
 * ステータスバーに一時的なメッセージを表示（5秒後に元に戻る）
 */
export function showStatusBarNotification(ctx: DashboardContext, icon: string, message: string): void {
    if (!ctx.statusBarItem) return;

    // 既存のリセットタイマーをクリア
    if (ctx.statusBarResetTimeout) {
        clearTimeout(ctx.statusBarResetTimeout);
    }

    // ステータスバーを更新
    ctx.statusBarItem.text = `${icon} ${message}`;
    ctx.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

    // 5秒後に元に戻す
    ctx.statusBarResetTimeout = setTimeout(() => {
        if (ctx.statusBarItem) {
            ctx.statusBarItem.text = '🎩 Controller';
            ctx.statusBarItem.backgroundColor = undefined;
        }
    }, 5000);
}
