/**
 * ダッシュボードのタスク操作API
 *
 * 責務: 完了タスクのページネーション
 */

import * as vscode from 'vscode';
import { ENDPOINTS, type CompletedTasksOptions } from '@maid-agent/api-client';
import { DASHBOARD_SERVER_URL } from '../../constants';
import { CURRENT_ENV, windowsToWslPath } from '../../utils/environment';

/**
 * タスク操作のコンテキスト（依存性注入用）
 */
export interface TaskActionContext {
    /** ワークスペースルート */
    workspaceRoot?: string;
    /** ダッシュボードパネル */
    dashboardPanel?: vscode.WebviewPanel;
    /** ログ関数 */
    log: (message: string) => void;
}

/**
 * 完了タスクのページネーションデータを取得してWebviewに送信
 */
export async function fetchCompletedPage(
    ctx: TaskActionContext,
    offset: number,
    limit: number,
    completedSortField?: string
): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    const projectPath = ctx.workspaceRoot;
    if (!projectPath || !ctx.dashboardPanel) return;

    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;

    try {
        const options: CompletedTasksOptions = {
            offset,
            limit,
            completedSortField,
        };
        const url = `${serverUrl}${ENDPOINTS.dashboard.completed(normalizedPath, options)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const data = await response.json() as {
            html: string;
            total: number;
            offset: number;
            limit: number;
            hasMore: boolean;
        };

        ctx.dashboardPanel.webview.postMessage({
            type: 'completedPageUpdate',
            html: data.html,
            total: data.total,
            offset: data.offset,
            limit: data.limit,
        });
    } catch (error) {
        ctx.log(`[Dashboard] Completed page fetch failed: ${error}`);
    }
}
