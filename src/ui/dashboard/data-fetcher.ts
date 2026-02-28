/**
 * ダッシュボードデータ取得・更新
 *
 * 責務: MCPサーバーからのデータ取得、ダッシュボードの初期化・更新
 */

import * as vscode from 'vscode';
import { DASHBOARD_SERVER_URL, DASHBOARD_MAX_CONSECUTIVE_FAILURES } from '../../constants';
import { CURRENT_ENV, windowsToWslPath } from '../../utils/environment';
import { escapeHtml } from '../../utils/html-escape';

/**
 * データ取得のコンテキスト（依存性注入用）
 */
export interface DataFetcherContext {
    /** ダッシュボードパネル */
    dashboardPanel?: vscode.WebviewPanel;
    /** ワークスペースルート */
    workspaceRoot?: string;
    /** ダッシュボード初期化済みフラグ */
    dashboardInitialized: boolean;
    /** 連続失敗カウント */
    dashboardConsecutiveFailures: number;
    /** 完了ビュー状態 */
    completedViewState: CompletedViewState;
    /** ログ関数 */
    log: (message: string) => void;
}

/**
 * データ取得の状態（更新用）
 */
export interface DataFetcherState {
    dashboardInitialized: boolean;
    dashboardConsecutiveFailures: number;
    completedViewState: CompletedViewState;
}

/**
 * 完了ビュー状態
 */
export interface CompletedViewState {
    limit: number;
    offset: number;
    reviewed: string | undefined;
    starred: string | undefined;
    hash: string;
    completedSortField: string | undefined;
}

/**
 * エラーからエラーコードを抽出
 * Node.jsのシステムエラー（ECONNREFUSED, ETIMEDOUT等）を識別
 */
export function extractErrorCode(error: unknown): string | undefined {
    if (error && typeof error === 'object') {
        const err = error as { code?: string; cause?: { code?: string } };
        if (err.code) return err.code;
        if (err.cause?.code) return err.cause.code;
    }
    return undefined;
}

/**
 * WebSocketイベント受信時のデータ再取得（IDE Webview用）
 */
export async function refreshDashboardData(
    ctx: DataFetcherContext,
    panel: vscode.WebviewPanel
): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    let projectPath = ctx.workspaceRoot;
    if (!projectPath) {
        projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }
    if (!projectPath) {
        ctx.log('[Dashboard] refreshDashboardData: プロジェクトパスが取得できません');
        return;
    }

    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;

    try {
        const state = ctx.completedViewState;
        let dataUrl = `${serverUrl}/dashboard/data?project=${encodeURIComponent(normalizedPath)}`;
        dataUrl += `&completedLimit=${state.limit}`;
        dataUrl += `&completedOffset=${state.offset}`;
        if (state.reviewed) dataUrl += `&completedReviewed=${state.reviewed}`;
        if (state.starred) dataUrl += `&completedStarred=${state.starred}`;
        if (state.hash) dataUrl += `&completedHash=${state.hash}`;
        if (state.completedSortField) dataUrl += `&completedSortField=${state.completedSortField}`;

        const v2GoalsOpenUrl = `${serverUrl}/dashboard/v2/goals?project=${encodeURIComponent(normalizedPath)}&status=open&archived=false&limit=10&offset=0`;
        const v2GoalsClosedUrl = `${serverUrl}/dashboard/v2/goals?project=${encodeURIComponent(normalizedPath)}&status=closed&archived=false&limit=10&offset=0`;

        const [response, goalsOpenResponse, goalsClosedResponse] = await Promise.all([
            fetch(dataUrl),
            fetch(v2GoalsOpenUrl).catch(() => null),
            fetch(v2GoalsClosedUrl).catch(() => null)
        ]);

        if (!response.ok) {
            throw new Error(`Dashboard data fetch failed: ${response.status}`);
        }

        const data = await response.json() as DashboardDataResponse;

        type V2GoalsResponse = { goals: unknown[]; total: number; offset: number; limit: number };
        let v2GoalsOpen: V2GoalsResponse | null = null;
        let v2GoalsClosed: V2GoalsResponse | null = null;
        if (goalsOpenResponse?.ok) {
            v2GoalsOpen = await goalsOpenResponse.json() as V2GoalsResponse;
        }
        if (goalsClosedResponse?.ok) {
            v2GoalsClosed = await goalsClosedResponse.json() as V2GoalsResponse;
        }

        if (data.completedMeta?.hash) {
            ctx.completedViewState.hash = data.completedMeta.hash;
        }

        panel.webview.postMessage({
            type: 'dashboardUpdate',
            stats: data.stats,
            tasks: data.tasks,
            completedMeta: data.completedMeta,
            v2Html: data.v2Html,
            v2: data.v2,
            v2GoalsOpen,
            v2GoalsClosed
        });

        ctx.log('[Dashboard] refreshDashboardData: データ更新送信' +
            (v2GoalsOpen ? ' (v2GoalsOpen含む)' : '') +
            (v2GoalsClosed ? ' (v2GoalsClosed含む)' : ''));
    } catch (error) {
        ctx.log(`[Dashboard] refreshDashboardData error: ${error}`);
    }
}

/**
 * ダッシュボードを更新
 */
export async function updateDashboard(ctx: DataFetcherContext): Promise<DataFetcherState> {
    const state: DataFetcherState = {
        dashboardInitialized: ctx.dashboardInitialized,
        dashboardConsecutiveFailures: ctx.dashboardConsecutiveFailures,
        completedViewState: ctx.completedViewState,
    };

    if (!ctx.dashboardPanel) return state;

    let projectPath = ctx.workspaceRoot;
    if (!projectPath) {
        projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    if (!projectPath) {
        ctx.dashboardPanel.webview.html = generateNoWorkspaceErrorHtml();
        return state;
    }

    const serverUrl = DASHBOARD_SERVER_URL;
    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;

    try {
        if (!ctx.dashboardInitialized) {
            await initializeDashboard(ctx, serverUrl, normalizedPath);
            state.dashboardInitialized = true;
        } else {
            await updateDashboardData(ctx, serverUrl, normalizedPath);
        }
        state.dashboardConsecutiveFailures = 0;
    } catch (error) {
        state.dashboardConsecutiveFailures = (ctx.dashboardConsecutiveFailures || 0) + 1;

        const message = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = extractErrorCode(error);

        const isPermanentError = errorCode === 'ECONNREFUSED';
        const shouldShowError = isPermanentError ||
            state.dashboardConsecutiveFailures >= DASHBOARD_MAX_CONSECUTIVE_FAILURES;

        ctx.log(`[Dashboard] 接続失敗 (${state.dashboardConsecutiveFailures}/${DASHBOARD_MAX_CONSECUTIVE_FAILURES}): ${errorCode || message}`);

        if (shouldShowError) {
            const failureInfo = isPermanentError
                ? 'サーバーが停止しています'
                : `${state.dashboardConsecutiveFailures}回連続で接続に失敗しました`;

            ctx.dashboardPanel.webview.html = generateConnectionErrorHtml(failureInfo, message);
            state.dashboardConsecutiveFailures = 0;
        }
    }

    return state;
}

/**
 * ダッシュボードを初期化（初回HTML設定）
 */
export async function initializeDashboard(
    ctx: DataFetcherContext,
    serverUrl: string,
    projectPath: string
): Promise<void> {
    if (!ctx.dashboardPanel) return;

    const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(projectPath)}`;
    const response = await fetch(dashboardUrl);

    if (!response.ok) {
        throw new Error(`Dashboard fetch failed: ${response.status}`);
    }

    let html = await response.text();

    const messageListenerScript = generateMessageListenerScript();
    html = html.replace('</body>', messageListenerScript + '</body>');

    ctx.dashboardPanel.webview.html = html;
    ctx.log('[Dashboard] 初回HTML設定完了（postMessageリスナー追加済み）');

    refreshDashboardData(ctx, ctx.dashboardPanel).catch((err) => {
        ctx.log(`[Dashboard] 初回V2 Goalsデータ取得エラー: ${err}`);
    });
}

/**
 * ダッシュボードをJSON APIで部分更新
 */
export async function updateDashboardData(
    ctx: DataFetcherContext,
    serverUrl: string,
    projectPath: string
): Promise<void> {
    if (!ctx.dashboardPanel) return;

    const state = ctx.completedViewState;
    let dataUrl = `${serverUrl}/dashboard/data?project=${encodeURIComponent(projectPath)}`;
    dataUrl += `&completedLimit=${state.limit}`;
    dataUrl += `&completedOffset=${state.offset}`;
    if (state.reviewed) dataUrl += `&completedReviewed=${state.reviewed}`;
    if (state.starred) dataUrl += `&completedStarred=${state.starred}`;
    if (state.hash) dataUrl += `&completedHash=${state.hash}`;
    if (state.completedSortField) dataUrl += `&completedSortField=${state.completedSortField}`;

    const response = await fetch(dataUrl);

    if (!response.ok) {
        throw new Error(`Dashboard data fetch failed: ${response.status}`);
    }

    const data = await response.json() as DashboardDataResponse;

    if (data.completedMeta?.hash) {
        ctx.completedViewState.hash = data.completedMeta.hash;
    }

    ctx.dashboardPanel.webview.postMessage({
        type: 'dashboardUpdate',
        stats: data.stats,
        tasks: data.tasks,
        completedMeta: data.completedMeta,
        v2Html: data.v2Html,
        v2: data.v2
    });

    ctx.log('[Dashboard] JSON APIで部分更新送信');
}

// =============================================================================
// 型定義
// =============================================================================

interface DashboardDataResponse {
    stats: {
        pendingCount: number;
        workingCount: number;
        masterWaitingCount: number;
        completedTodayCount: number;
        timestamp: string;
    };
    tasks: {
        pending: string;
        working: string;
        masterWaiting: string;
        masterReview: string;
        completed?: string;
    };
    completedMeta?: { changed: boolean; hash: string; total: number };
    v2Html?: { goals?: string; reviewQueue?: string; artifacts?: string; stats?: string };
    v2?: unknown;
}

// =============================================================================
// HTML生成（インラインテンプレート）
// =============================================================================

function generateNoWorkspaceErrorHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            padding: 40px;
            text-align: center;
        }
        .error-icon { font-size: 4rem; margin-bottom: 20px; }
        .error-title { font-size: 1.5rem; color: #f14c4c; margin-bottom: 10px; }
        .error-message { color: #808080; }
    </style>
</head>
<body>
    <div class="error-icon">📁</div>
    <div class="error-title">ワークスペースが開かれていません</div>
    <div class="error-message">フォルダを開いてから再度お試しください</div>
</body>
</html>`;
}

function generateConnectionErrorHtml(failureInfo: string, message: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            padding: 40px;
            text-align: center;
        }
        .error-icon { font-size: 4rem; margin-bottom: 20px; }
        .error-title { font-size: 1.5rem; color: #f14c4c; margin-bottom: 10px; }
        .error-message { color: #808080; margin-bottom: 20px; }
        .failure-info { color: #ffc107; margin-bottom: 15px; font-size: 0.9rem; }
        .btn {
            background: #569cd6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1rem;
        }
        .hint { margin-top: 30px; font-size: 0.9rem; color: #808080; }
        code { background: #333; padding: 2px 6px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="error-icon">⚠️</div>
    <div class="error-title">MCPサーバーに接続できません</div>
    <div class="failure-info">${escapeHtml(failureInfo)}</div>
    <div class="error-message">${escapeHtml(message)}</div>
    <button class="btn" onclick="location.reload()">🔄 再試行</button>
    <div class="hint">
        <p>MCPサーバーが起動していることを確認してください:</p>
        <code>pm2 status maid-agent-messenger</code>
    </div>
</body>
</html>`;
}

function generateMessageListenerScript(): string {
    return `
<script>
    // postMessageでJSON更新・レポート表示を受け取るリスナー
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'dashboardUpdate') {
            if (message.stats && typeof updateStats === 'function') {
                updateStats(message.stats);
            }
            var isV2Mode = document.querySelector('[data-section="v2-goals-open"]') !== null;
            if (isV2Mode) {
                console.log('[postMessage] V2 mode detected, using v2GoalsOpen/v2GoalsClosed data');
                if (message.v2GoalsOpen && typeof updateV2GoalsOpenSection === 'function') {
                    console.log('[postMessage] Updating v2GoalsOpen:', message.v2GoalsOpen.total, 'total');
                    updateV2GoalsOpenSection(message.v2GoalsOpen.goals, message.v2GoalsOpen.total, message.v2GoalsOpen.offset, message.v2GoalsOpen.limit);
                }
                if (message.v2GoalsClosed && typeof updateV2GoalsClosedSection === 'function') {
                    console.log('[postMessage] Updating v2GoalsClosed:', message.v2GoalsClosed.total, 'total');
                    updateV2GoalsClosedSection(message.v2GoalsClosed.goals, message.v2GoalsClosed.total, message.v2GoalsClosed.offset, message.v2GoalsClosed.limit);
                }
                if (message.tasks && typeof updateTaskListsWithMeta === 'function') {
                    console.log('[postMessage] V2 mode: updating v2-master-waiting via updateTaskListsWithMeta');
                    updateTaskListsWithMeta(message.tasks, message.completedMeta);
                }
            } else {
                if (message.tasks && typeof updateTaskListsWithMeta === 'function') {
                    updateTaskListsWithMeta(message.tasks, message.completedMeta);
                } else if (message.tasks && typeof updateTaskLists === 'function') {
                    updateTaskLists(message.tasks);
                }
            }
            if (message.v2Html && typeof updateV2Sections === 'function') {
                updateV2Sections(message.v2Html, message.v2);
            }
            if (message.teamStatusHtml && typeof updateTeamStatus === 'function') {
                updateTeamStatus(message.teamStatusHtml);
            }
        } else if (message.type === 'showReport') {
            if (typeof showReportOverlay === 'function') {
                showReportOverlay(message.html, message.fileName);
            }
        } else if (message.type === 'completedPageUpdate') {
            if (typeof updateCompletedSection === 'function') {
                updateCompletedSection(message.html, message.total, message.offset, message.limit);
            }
        } else if (message.type === 'refreshCompletedPage') {
            if (typeof requestCompletedPage === 'function') {
                requestCompletedPage();
            }
        }
    });
</script>`;
}
