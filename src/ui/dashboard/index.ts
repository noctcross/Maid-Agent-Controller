/**
 * ダッシュボードモジュール
 *
 * web-dashboard.ts から分割されたサブモジュールの再エクスポート
 */

// メッセージハンドラ
export {
    setupDashboardMessageHandler,
    type MessageHandlerContext,
    type CompletedViewStateUpdate,
} from './message-handler';

// データ取得
export {
    refreshDashboardData,
    updateDashboard,
    initializeDashboard,
    updateDashboardData,
    extractErrorCode,
    type DataFetcherContext,
    type DataFetcherState,
    type CompletedViewState,
} from './data-fetcher';

// タスク操作
export {
    toggleTaskReview,
    toggleTaskStar,
    fetchCompletedPage,
    type TaskActionContext,
} from './task-actions';

// ファイルビューア
export {
    openDashboardInBrowser,
    openMaidAgentFile,
    openFileWithPreview,
    setReportViewerHtml,
    buildReportViewerHtml,
    type FileViewerContext,
    type FileViewerState,
} from './file-viewer';
