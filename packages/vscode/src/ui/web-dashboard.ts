/**
 * ダッシュボードパネル管理
 *
 * 責務: パネル作成・復元とコンテキスト委譲のみ
 * 実装詳細は dashboard/ サブモジュールに分離
 */

import * as vscode from 'vscode';
import { ENDPOINTS } from '@maid-agent/api-client';
import { ViewContext } from '../types';

// ダッシュボードモジュールから各機能をインポート
import {
    setupDashboardMessageHandler,
    refreshDashboardData,
    updateDashboard as updateDashboardImpl,
    initializeDashboard,
    updateDashboardData,
    extractErrorCode,
    fetchCompletedPage as fetchCompletedPageImpl,
    openDashboardInBrowser as openDashboardInBrowserImpl,
    openMaidAgentFile as openMaidAgentFileImpl,
    openFileWithPreview as openFileWithPreviewImpl,
    setReportViewerHtml as setReportViewerHtmlImpl,
    buildReportViewerHtml,
    type MessageHandlerContext,
    type DataFetcherContext,
    type DataFetcherState,
    type CompletedViewState,
    type CompletedViewStateUpdate,
    type TaskActionContext,
    type FileViewerContext,
    type FileViewerState,
} from './dashboard';

// =============================================================================
// コンテキスト変換ファクトリ（ViewContext → 各モジュールのContext）
// =============================================================================

/**
 * ViewContext からメッセージハンドラ用コンテキストを生成
 */
function createMessageHandlerContext(ctx: ViewContext): MessageHandlerContext {
    return {
        updateDashboard: () => updateDashboard(ctx),
        openDashboardInBrowser: () => openDashboardInBrowser(ctx),
        showController: () => ctx.showController(),
        openFileWithPreview: (path: string) => openFileWithPreview(ctx, path),
        openReport: (taskId: string, project: string) => openReport(ctx, taskId, project),
        fetchCompletedPage: (offset: number, limit: number, completedSortField?: string) =>
            fetchCompletedPage(ctx, offset, limit, completedSortField),
        updateCompletedViewState: (state: CompletedViewStateUpdate) => {
            ctx.completedViewState = {
                limit: state.limit ?? 10,
                offset: state.offset ?? 0,
                hash: state.hash ?? '',
                completedSortField: state.completedSortField,
            };
        },
        refreshDashboardData: (panel: vscode.WebviewPanel) => {
            const dataCtx = createDataFetcherContext(ctx);
            refreshDashboardData(dataCtx, panel);
        },
        subscriptions: ctx.context?.subscriptions,
    };
}

/**
 * ViewContext からデータ取得用コンテキストを生成
 */
function createDataFetcherContext(ctx: ViewContext): DataFetcherContext {
    return {
        dashboardPanel: ctx.dashboardPanel,
        workspaceRoot: ctx.workspaceRoot,
        dashboardInitialized: ctx.dashboardInitialized,
        dashboardConsecutiveFailures: ctx.dashboardConsecutiveFailures,
        completedViewState: ctx.completedViewState,
        log: ctx.log,
    };
}

/**
 * DataFetcherState を ViewContext に反映
 */
function applyDataFetcherState(ctx: ViewContext, state: DataFetcherState): void {
    ctx.dashboardInitialized = state.dashboardInitialized;
    ctx.dashboardConsecutiveFailures = state.dashboardConsecutiveFailures;
    ctx.completedViewState = state.completedViewState;
}

/**
 * ViewContext からタスク操作用コンテキストを生成
 */
function createTaskActionContext(ctx: ViewContext): TaskActionContext {
    return {
        workspaceRoot: ctx.workspaceRoot,
        dashboardPanel: ctx.dashboardPanel,
        log: ctx.log,
    };
}

/**
 * ViewContext からファイルビューア用コンテキストを生成
 */
function createFileViewerContext(ctx: ViewContext): FileViewerContext {
    return {
        workspaceRoot: ctx.workspaceRoot,
        maidAgentPath: ctx.maidAgentPath,
        reportViewerPanel: ctx.reportViewerPanel,
        context: ctx.context,
        log: ctx.log,
    };
}

/**
 * FileViewerState を ViewContext に反映
 */
function applyFileViewerState(ctx: ViewContext, state: FileViewerState): void {
    ctx.reportViewerPanel = state.reportViewerPanel;
}

// =============================================================================
// パブリックAPI（ViewContext を受け取り、各モジュールに委譲）
// =============================================================================

/**
 * ダッシュボードを表示
 */
export function showDashboard(ctx: ViewContext): void {
    if (ctx.dashboardPanel) {
        ctx.dashboardPanel.reveal();
        updateDashboard(ctx);
        return;
    }

    ctx.dashboardPanel = vscode.window.createWebviewPanel(
        'maidAgentDashboard',
        '📋 Dashboard',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    ctx.dashboardPanel.onDidDispose(() => {
        ctx.dashboardPanel = undefined;
        ctx.dashboardInitialized = false;
    });

    // メッセージハンドラコンテキストを生成してセットアップ
    const msgCtx = createMessageHandlerContext(ctx);
    setupDashboardMessageHandler(msgCtx, ctx.dashboardPanel);

    updateDashboard(ctx);
}

/**
 * ダッシュボードを更新
 */
export async function updateDashboard(ctx: ViewContext): Promise<void> {
    const dataCtx = createDataFetcherContext(ctx);
    const state = await updateDashboardImpl(dataCtx);
    applyDataFetcherState(ctx, state);
}

/**
 * 完了タスクのページネーションデータを取得してWebviewに送信
 */
export async function fetchCompletedPage(ctx: ViewContext, offset: number, limit: number, completedSortField?: string): Promise<void> {
    const taskCtx = createTaskActionContext(ctx);
    await fetchCompletedPageImpl(taskCtx, offset, limit, completedSortField);
}

/**
 * ブラウザでダッシュボードを開く
 */
export function openDashboardInBrowser(ctx: ViewContext): void {
    const fileCtx = createFileViewerContext(ctx);
    openDashboardInBrowserImpl(fileCtx);
}

/**
 * .maid-agentディレクトリ内のファイルを開く
 */
export async function openMaidAgentFile(ctx: ViewContext, filename: string): Promise<void> {
    const fileCtx = createFileViewerContext(ctx);
    await openMaidAgentFileImpl(fileCtx, filename);
}

/**
 * ファイルを開き、マークダウンの場合はプレビューも表示
 */
export async function openFileWithPreview(ctx: ViewContext, filePath: string): Promise<void> {
    const fileCtx = createFileViewerContext(ctx);
    const state = await openFileWithPreviewImpl(fileCtx, filePath);
    applyFileViewerState(ctx, state);
}

/**
 * 報告書を開く（タスクIDから報告書パスを取得してファイルを開く）
 */
export async function openReport(ctx: ViewContext, taskId: string, project: string): Promise<void> {
    const { DASHBOARD_SERVER_URL } = await import('../constants');
    const { ENV } = await import('../utils/environment');

    const projectPath = project || ctx.workspaceRoot;
    if (!projectPath) {
        vscode.window.showErrorMessage('プロジェクトパスが不明です');
        return;
    }

    const normalizedPath = ENV.normalizePathForServer(projectPath);

    try {
        // APIから報告書パスを取得
        const reportEndpoint = ENDPOINTS.tasks.report(taskId, normalizedPath);
        const response = await fetch(
            `${DASHBOARD_SERVER_URL}${reportEndpoint}`
        );

        if (!response.ok) {
            if (response.status === 404) {
                vscode.window.showWarningMessage(`タスク #${taskId} の報告書が見つかりません`);
            } else {
                vscode.window.showErrorMessage(`報告書の取得に失敗しました: ${response.status}`);
            }
            return;
        }

        const data = await response.json() as {
            success: boolean;
            reports: Array<{ path: string; content: string | null; error?: string }>;
            message?: string;
        };

        if (!data.success || data.reports.length === 0) {
            vscode.window.showWarningMessage(data.message || `タスク #${taskId} には報告書が登録されていません`);
            return;
        }

        // 最初の報告書ファイルを開く
        const reportPath = data.reports[0].path;
        await openFileWithPreview(ctx, reportPath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.log(`[Dashboard] openReport failed: ${message}`);
        vscode.window.showErrorMessage(`報告書を開けませんでした: ${message}`);
    }
}

/**
 * レポートビューアのHTMLを設定
 */
export function setReportViewerHtml(ctx: ViewContext, contentHtml: string, fileName: string): void {
    if (!ctx.reportViewerPanel) return;
    setReportViewerHtmlImpl(ctx.reportViewerPanel, contentHtml, fileName);
}

/**
 * Serializerからダッシュボードパネルを復元する
 */
export function restoreDashboardPanel(ctx: ViewContext, panel: vscode.WebviewPanel): void {
    ctx.dashboardPanel = panel;

    // パネル破棄時の処理を再設定
    panel.onDidDispose(() => {
        ctx.dashboardPanel = undefined;
        ctx.dashboardInitialized = false;
    });

    // メッセージハンドラを再設定
    const msgCtx = createMessageHandlerContext(ctx);
    setupDashboardMessageHandler(msgCtx, panel);

    // パネル内容を更新
    updateDashboard(ctx);
}
