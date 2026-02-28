/**
 * ダッシュボードのタスク操作API
 *
 * 責務: レビュー・スターのトグル、完了タスクのページネーション
 */

import * as vscode from 'vscode';
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
 * 完了タスクのレビュー済みフラグをトグル
 */
export async function toggleTaskReview(
    ctx: TaskActionContext,
    taskId: string,
    reviewed: boolean,
    txId?: string
): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    const projectPath = ctx.workspaceRoot;
    if (!projectPath) return;

    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Maid-Project-Path': normalizedPath,
        };
        if (txId) {
            headers['X-Transaction-Id'] = txId;
        }

        await fetch(`${serverUrl}/dashboard/tasks/${taskId}/review`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ reviewed }),
        });
        // 楽観的更新を信頼し、再取得しない（Web版と同様）
        // WebSocketの他者操作時のみ再取得される
    } catch (error) {
        ctx.log(`[Dashboard] Review toggle failed: ${error}`);
    }
}

/**
 * 完了タスクのスターフラグをトグル
 */
export async function toggleTaskStar(
    ctx: TaskActionContext,
    taskId: string,
    starred: boolean,
    txId?: string
): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    const projectPath = ctx.workspaceRoot;
    if (!projectPath) return;

    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Maid-Project-Path': normalizedPath,
        };
        if (txId) {
            headers['X-Transaction-Id'] = txId;
        }

        await fetch(`${serverUrl}/dashboard/tasks/${taskId}/star`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ starred }),
        });
        // 楽観的更新を信頼し、再取得しない（Web版と同様）
        // WebSocketの他者操作時のみ再取得される
    } catch (error) {
        ctx.log(`[Dashboard] Star toggle failed: ${error}`);
    }
}

/**
 * 完了タスクのページネーションデータを取得してWebviewに送信
 */
export async function fetchCompletedPage(
    ctx: TaskActionContext,
    offset: number,
    limit: number,
    reviewed?: string,
    starred?: string,
    completedSortField?: string
): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    const projectPath = ctx.workspaceRoot;
    if (!projectPath || !ctx.dashboardPanel) return;

    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;

    try {
        let url = `${serverUrl}/dashboard/completed?project=${encodeURIComponent(normalizedPath)}&offset=${offset}&limit=${limit}`;
        if (reviewed === 'yes') url += '&reviewed=yes';
        else if (reviewed === 'no') url += '&reviewed=no';
        if (starred === 'yes') url += '&starred=yes';
        else if (starred === 'no') url += '&starred=no';
        if (completedSortField) url += `&completedSortField=${completedSortField}`;

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
