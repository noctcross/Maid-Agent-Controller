/**
 * ダッシュボードWebviewのメッセージハンドラ
 *
 * 責務: Webviewからのメッセージを受信し、適切なハンドラにディスパッチ
 */

import * as vscode from 'vscode';

/**
 * メッセージハンドラのコンテキスト（依存性注入用）
 */
export interface MessageHandlerContext {
    /** ダッシュボード更新 */
    updateDashboard: () => void;
    /** ブラウザで開く */
    openDashboardInBrowser: () => void;
    /** コントローラ表示 */
    showController: () => void;
    /** ファイルを開く */
    openFileWithPreview: (path: string) => void;
    /** 報告書を開く */
    openReport: (taskId: string, project: string) => void;
    /** 完了タスクページ取得 */
    fetchCompletedPage: (offset: number, limit: number, completedSortField?: string) => void;
    /** 完了ビュー状態更新 */
    updateCompletedViewState: (state: CompletedViewStateUpdate) => void;
    /** ダッシュボードデータ再取得（WebSocket用） */
    refreshDashboardData: (panel: vscode.WebviewPanel) => void;
    /** 購読リスト */
    subscriptions?: vscode.Disposable[];
}

/**
 * 完了ビュー状態更新用の型
 */
export interface CompletedViewStateUpdate {
    limit?: number;
    offset?: number;
    hash?: string;
    completedSortField?: string;
}

/**
 * ダッシュボードWebviewのメッセージハンドラを設定
 *
 * @param ctx - メッセージハンドラコンテキスト
 * @param panel - Webviewパネル
 */
export function setupDashboardMessageHandler(
    ctx: MessageHandlerContext,
    panel: vscode.WebviewPanel
): void {
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'refresh':
                    ctx.updateDashboard();
                    break;
                case 'openInBrowser':
                    ctx.openDashboardInBrowser();
                    break;
                case 'showController':
                    ctx.showController();
                    break;
                case 'openFile':
                    ctx.openFileWithPreview(message.path);
                    break;
                case 'openReport':
                    ctx.openReport(message.taskId, message.project);
                    break;
                case 'completedPage':
                    ctx.fetchCompletedPage(
                        message.offset,
                        message.limit,
                        message.completedSortField
                    );
                    break;
                case 'updateCompletedViewState':
                    ctx.updateCompletedViewState({
                        limit: message.limit ?? 10,
                        offset: message.offset ?? 0,
                        hash: message.hash ?? '',
                        completedSortField: message.completedSortField,
                    });
                    break;
                case 'refreshDashboard':
                    // WebSocketイベント受信時のデータ再取得（IDE Webview用）
                    ctx.refreshDashboardData(panel);
                    break;
            }
        },
        undefined,
        ctx.subscriptions
    );
}
