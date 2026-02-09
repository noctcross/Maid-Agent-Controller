import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ViewContext } from '../types';
import { WEB_DASHBOARD_POLLING_INTERVAL, DASHBOARD_SERVER_URL } from '../constants';
import { CURRENT_ENV, windowsToWslPath } from '../utils/environment';
import { simpleMarkdownToHtml } from '../utils/markdown';
import { isPathWithinRoot, isPathWithinRootCrossEnv, normalizePathForValidation } from '../utils/path-validator';
import { escapeHtml } from '../utils/html-escape';

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
        stopDashboardPolling(ctx);
    });

    // 自動更新ポーリングを開始
    startDashboardPolling(ctx);

    setupDashboardMessageHandler(ctx, ctx.dashboardPanel);

    updateDashboard(ctx);
}

/**
 * ダッシュボードWebviewのメッセージハンドラを設定
 * showDashboard() と restoreDashboardPanel() の共通処理
 */
function setupDashboardMessageHandler(ctx: ViewContext, panel: vscode.WebviewPanel): void {
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'refresh':
                    updateDashboard(ctx);
                    break;
                case 'openInBrowser':
                    openDashboardInBrowser(ctx);
                    break;
                case 'showController':
                    ctx.showController();
                    break;
                case 'openFile':
                    openFileWithPreview(ctx, message.path);
                    break;
                case 'toggleReview':
                    toggleTaskReview(ctx, message.taskId, message.reviewed);
                    break;
                case 'toggleStar':
                    toggleTaskStar(ctx, message.taskId, message.starred);
                    break;
                case 'completedPage':
                    fetchCompletedPage(ctx, message.offset, message.limit, message.reviewed, message.starred, message.completedSortField);
                    break;
                case 'updateCompletedViewState':
                    ctx.completedViewState = {
                        limit: message.limit ?? 10,
                        offset: message.offset ?? 0,
                        reviewed: message.reviewed,
                        starred: message.starred,
                        hash: message.hash ?? '',
                        completedSortField: message.completedSortField,
                    };
                    break;
            }
        },
        undefined,
        ctx.context?.subscriptions
    );
}

/**
 * ダッシュボードを更新
 */
export async function updateDashboard(ctx: ViewContext): Promise<void> {
    if (!ctx.dashboardPanel) return;

    // workspaceRootがない場合は再取得を試みる
    let projectPath = ctx.workspaceRoot;
    if (!projectPath) {
        projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    if (!projectPath) {
        // ワークスペースが開かれていない場合のエラー表示
        ctx.dashboardPanel.webview.html = `
            <!DOCTYPE html>
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
            </html>
        `;
        return;
    }

    const serverUrl = DASHBOARD_SERVER_URL;
    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;

    try {
        // 初回はHTMLを取得、2回目以降はJSON APIで部分更新
        if (!ctx.dashboardInitialized) {
            await initializeDashboard(ctx, serverUrl, normalizedPath);
            ctx.dashboardInitialized = true;
        } else {
            await updateDashboardData(ctx, serverUrl, normalizedPath);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        ctx.dashboardPanel.webview.html = `
            <!DOCTYPE html>
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
                <div class="error-message">${escapeHtml(message)}</div>
                <button class="btn" onclick="location.reload()">🔄 再試行</button>
                <div class="hint">
                    <p>MCPサーバーが起動していることを確認してください:</p>
                    <code>pm2 status maid-agent-messenger</code>
                </div>
            </body>
            </html>
        `;
    }
}

/**
 * ダッシュボードの自動更新ポーリングを開始
 */
export function startDashboardPolling(ctx: ViewContext): void {
    if (ctx.dashboardPollingInterval) return;

    ctx.dashboardPollingInterval = setInterval(() => {
        if (ctx.dashboardPanel) {
            updateDashboard(ctx);
        } else {
            stopDashboardPolling(ctx);
        }
    }, WEB_DASHBOARD_POLLING_INTERVAL);

    ctx.log('[Dashboard] 自動更新ポーリング開始（10秒間隔）');
}

/**
 * ダッシュボードの自動更新ポーリングを停止
 */
export function stopDashboardPolling(ctx: ViewContext): void {
    if (ctx.dashboardPollingInterval) {
        clearInterval(ctx.dashboardPollingInterval);
        ctx.dashboardPollingInterval = undefined;
        ctx.log('[Dashboard] 自動更新ポーリング停止');
    }
}

/**
 * ダッシュボードを初期化（初回HTML設定）
 * postMessageリスナーを追加してJSON更新に対応
 */
export async function initializeDashboard(ctx: ViewContext, serverUrl: string, projectPath: string): Promise<void> {
    if (!ctx.dashboardPanel) return;

    const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(projectPath)}`;
    const response = await fetch(dashboardUrl);

    if (!response.ok) {
        throw new Error(`Dashboard fetch failed: ${response.status}`);
    }

    let html = await response.text();

    // postMessageリスナーを追加（VSCode Webview用）
    // 拡張機能からpostMessageで送信されたJSON更新を受け取り、
    // 既存のupdateStats/updateTaskListsWithMeta関数を呼び出す
    const messageListenerScript = `
        <script>
            // postMessageでJSON更新・レポート表示を受け取るリスナー
            window.addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'dashboardUpdate') {
                    if (message.stats && typeof updateStats === 'function') {
                        updateStats(message.stats);
                    }
                    // completedMeta付きの場合はupdateTaskListsWithMetaを使用
                    if (message.tasks && typeof updateTaskListsWithMeta === 'function') {
                        updateTaskListsWithMeta(message.tasks, message.completedMeta);
                    } else if (message.tasks && typeof updateTaskLists === 'function') {
                        updateTaskLists(message.tasks);
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
        </script>
    `;

    // </body>の前にスクリプトを挿入
    html = html.replace('</body>', messageListenerScript + '</body>');

    ctx.dashboardPanel.webview.html = html;
    ctx.log('[Dashboard] 初回HTML設定完了（postMessageリスナー追加済み）');
}

/**
 * ダッシュボードをJSON APIで部分更新
 * 展開状態を保持したままデータのみ更新
 * Webviewの完了セクション表示設定を送信し、ハッシュ比較で差分検知
 */
export async function updateDashboardData(ctx: ViewContext, serverUrl: string, projectPath: string): Promise<void> {
    if (!ctx.dashboardPanel) return;

    // Webviewの表示設定をクエリパラメータに含める
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

    const data = await response.json() as {
        stats: { pendingCount: number; workingCount: number; masterWaitingCount: number; completedTodayCount: number; timestamp: string };
        tasks: { pending: string; working: string; masterWaiting: string; masterReview: string; completed?: string };
        completedMeta?: { changed: boolean; hash: string; total: number };
    };

    // ハッシュを更新
    if (data.completedMeta?.hash) {
        ctx.completedViewState.hash = data.completedMeta.hash;
    }

    // postMessageでWebviewにデータを送信
    // Webview側のリスナーがupdateStats/updateTaskListsWithMetaを呼び出す
    ctx.dashboardPanel.webview.postMessage({
        type: 'dashboardUpdate',
        stats: data.stats,
        tasks: data.tasks,
        completedMeta: data.completedMeta
    });

    ctx.log('[Dashboard] JSON APIで部分更新送信');
}

/**
 * 完了タスクのレビュー済みフラグをトグル
 */
export async function toggleTaskReview(ctx: ViewContext, taskId: string, reviewed: boolean): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    let projectPath = ctx.workspaceRoot;
    if (!projectPath) return;
    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;
    try {
        await fetch(`${serverUrl}/dashboard/tasks/${taskId}/review`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': normalizedPath },
            body: JSON.stringify({ reviewed }),
        });
        // PATCH成功後、webviewに完了ページ再取得シグナルを送信
        ctx.dashboardPanel?.webview.postMessage({ type: 'refreshCompletedPage' });
    } catch (error) {
        ctx.log(`[Dashboard] Review toggle failed: ${error}`);
    }
}

/**
 * 完了タスクのスターフラグをトグル
 */
export async function toggleTaskStar(ctx: ViewContext, taskId: string, starred: boolean): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    let projectPath = ctx.workspaceRoot;
    if (!projectPath) return;
    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(projectPath)
        : projectPath;
    try {
        await fetch(`${serverUrl}/dashboard/tasks/${taskId}/star`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': normalizedPath },
            body: JSON.stringify({ starred }),
        });
        // PATCH成功後、webviewに完了ページ再取得シグナルを送信
        ctx.dashboardPanel?.webview.postMessage({ type: 'refreshCompletedPage' });
    } catch (error) {
        ctx.log(`[Dashboard] Star toggle failed: ${error}`);
    }
}

/**
 * 完了タスクのページネーションデータを取得してWebviewに送信
 */
export async function fetchCompletedPage(ctx: ViewContext, offset: number, limit: number, reviewed?: string, starred?: string, completedSortField?: string): Promise<void> {
    const serverUrl = DASHBOARD_SERVER_URL;
    let projectPath = ctx.workspaceRoot;
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
        const data = await response.json() as { html: string; total: number; offset: number; limit: number; hasMore: boolean };
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

/**
 * ブラウザでダッシュボードを開く
 */
export function openDashboardInBrowser(ctx: ViewContext): void {
    if (!ctx.workspaceRoot) return;
    const serverUrl = DASHBOARD_SERVER_URL;
    // Windows環境の場合はWSLパスに変換
    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(ctx.workspaceRoot)
        : ctx.workspaceRoot;
    const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(normalizedPath)}`;
    vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
}

/**
 * .maid-agentディレクトリ内のファイルを開く
 */
export async function openMaidAgentFile(ctx: ViewContext, filename: string): Promise<void> {
    if (!ctx.maidAgentPath) return;
    const filePath = path.join(ctx.maidAgentPath, filename);
    // パストラバーサル防止: .maid-agent/ 内のみ許可
    if (!isPathWithinRoot(filePath, ctx.maidAgentPath)) {
        ctx.log(`[Dashboard] Path traversal blocked: ${filename}`);
        return;
    }
    if (fs.existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);

        // Markdownファイルの場合はプレビューも表示
        if (filename.endsWith('.md')) {
            await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(filePath));
        }
    }
}

/**
 * ファイルを開き、マークダウンの場合はプレビューも表示
 * ダッシュボードからの報告書リンク用
 *
 * サーバーの /file エンドポイントからリンク化済みHTMLを取得する。
 * サーバー接続失敗時はローカルレンダリング（simpleMarkdownToHtml）にフォールバック。
 */
export async function openFileWithPreview(ctx: ViewContext, filePath: string): Promise<void> {
    try {
        // 診断ログ（#116-1: パス検証デバッグ）
        ctx.log(`[openFileWithPreview] 入力パス: ${filePath}`);
        ctx.log(`[openFileWithPreview] CURRENT_ENV: ${CURRENT_ENV}`);
        ctx.log(`[openFileWithPreview] workspaceRoot: ${ctx.workspaceRoot}`);

        // パスフォーマット正規化: WSL環境でWindowsパスが渡された場合にWSLパスに変換
        // #121: MCPサーバーがWindowsパスを返す場合、Linux上のpath.resolveが
        // C:/をディレクトリ名として解釈し、isPathWithinRootが誤判定する問題の対策
        filePath = normalizePathForValidation(filePath, CURRENT_ENV);
        ctx.log(`[openFileWithPreview] 正規化後パス: ${filePath}`);

        // パストラバーサル防止: ワークスペースルート内のみ許可
        // #116-1: Windows-native環境ではMCPサーバーがWSLパスを返すため、
        // isPathWithinRootCrossEnvでrootもWSL形式に統一して比較
        if (ctx.workspaceRoot && !isPathWithinRootCrossEnv(filePath, ctx.workspaceRoot, CURRENT_ENV)) {
            ctx.log(`[openFileWithPreview] isPathWithinRootCrossEnv=false → ブロック`);
            vscode.window.showErrorMessage('許可されたディレクトリ外のファイルは開けません');
            return;
        }
        const fileName = path.basename(filePath);

        // サーバーからリンク化済みHTMLを取得（パスリンク化対応）
        let html = await fetchRenderedFileHtml(ctx, filePath);

        if (!html) {
            // フォールバック: ローカルレンダリング（リンク化なし、将来のIDE独自スタイル復活用に保持）
            html = renderFileLocally(filePath, fileName, ctx.workspaceRoot);
            if (!html) return; // ファイルが見つからない場合
        }

        // パネル作成/再利用
        ensureReportViewerPanel(ctx, fileName);

        // エージェント背景画像: サーバーURL → ローカルファイルのWebview URIに差し替え
        html = replaceAgentImageWithLocal(html, ctx);

        ctx.reportViewerPanel!.webview.html = html;
        ctx.reportViewerPanel!.reveal(vscode.ViewColumn.Active);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`ファイルを開けませんでした: ${message}`);
    }
}

/**
 * MCPサーバーの /file エンドポイントからレンダリング済みHTMLを取得
 * linkifyProjectPaths() によるパスリンク化が適用されたHTMLが返る
 * @returns HTML文字列、または取得失敗時は null
 */
async function fetchRenderedFileHtml(ctx: ViewContext, filePath: string): Promise<string | null> {
    try {
        // パストラバーサル防止（#116-1: 環境を考慮した比較）
        if (ctx.workspaceRoot && !isPathWithinRootCrossEnv(filePath, ctx.workspaceRoot, CURRENT_ENV)) {
            return null;
        }
        const serverUrl = DASHBOARD_SERVER_URL;
        let projectPath = ctx.workspaceRoot;
        if (!projectPath) {
            projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        }
        const normalizedProjectPath = projectPath && CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(projectPath)
            : projectPath;

        const fileUrl = `${serverUrl}/file?path=${encodeURIComponent(filePath)}&project=${encodeURIComponent(normalizedProjectPath || '')}`;
        const response = await fetch(fileUrl);
        if (!response.ok) return null;

        let html = await response.text();

        // VSCode Webview用: openFile()ハンドラを注入（サーバーのフォールバックを上書き）
        // パスリンクのonclickからpostMessageでextensionに通知し、ネストしたファイルも開ける
        const vscodeOpenFileScript = `
    <script>
        var _vscodeApi = null;
        try { if (typeof acquireVsCodeApi !== 'undefined') { _vscodeApi = acquireVsCodeApi(); } } catch (e) {}
        window.openFile = function(element, filePath) {
            if (_vscodeApi) {
                _vscodeApi.postMessage({ command: 'openFile', path: filePath });
                return false;
            }
            return true;
        };
    </script>`;
        html = html.replace('</body>', vscodeOpenFileScript + '\n</body>');

        return html;
    } catch {
        // サーバー接続失敗 → フォールバック
        return null;
    }
}

/**
 * ローカルファイルを読み込みHTMLに変換（フォールバック用）
 * simpleMarkdownToHtml()を使用。linkifyProjectPathsは適用されない。
 * 将来IDE独自スタイルを復活させる場合に備えて保持。
 * @returns HTML文字列、またはファイルが見つからない場合は null
 */
function renderFileLocally(filePath: string, fileName: string, workspaceRoot?: string): string | null {
    // Windowsパス（C:/...）をWSLパスに変換
    let normalizedPath = filePath;
    if (CURRENT_ENV === 'wsl' && /^[A-Z]:\//i.test(filePath)) {
        const driveLetter = filePath[0].toLowerCase();
        normalizedPath = `/mnt/${driveLetter}/${filePath.slice(3)}`;
    }

    // パストラバーサル防止（#116-1: 環境を考慮した比較）
    if (workspaceRoot && !isPathWithinRootCrossEnv(normalizedPath, workspaceRoot, CURRENT_ENV)) {
        vscode.window.showErrorMessage('許可されたディレクトリ外のファイルは開けません');
        return null;
    }
    if (!fs.existsSync(normalizedPath)) {
        vscode.window.showErrorMessage(`ファイルが見つかりません: ${filePath}`);
        return null;
    }

    const content = fs.readFileSync(normalizedPath, 'utf-8');
    const isMarkdown = /\.(md|markdown)$/i.test(filePath);
    const contentHtml = isMarkdown
        ? simpleMarkdownToHtml(content)
        : `<pre class="md-code-block"><code>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;

    return buildReportViewerHtml(contentHtml, fileName);
}

/**
 * レポートビューアパネルを確保（既存パネル再利用 or 新規作成）
 * enableScripts: true でパスリンクのonclickが動作する
 */
function ensureReportViewerPanel(ctx: ViewContext, fileName: string): void {
    if (ctx.reportViewerPanel) {
        ctx.reportViewerPanel.title = `📄 ${fileName}`;
        return;
    }

    ctx.reportViewerPanel = vscode.window.createWebviewPanel(
        'maidAgentReportViewer',
        `📄 ${fileName}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: false }
    );

    ctx.reportViewerPanel.onDidDispose(() => {
        ctx.reportViewerPanel = undefined;
    });

    // レポートビューア内のパスリンククリックを処理（ネストしたファイルも開ける）
    ctx.reportViewerPanel.webview.onDidReceiveMessage(
        message => {
            if (message.command === 'openFile') {
                openFileWithPreview(ctx, message.path);
            }
        },
        undefined,
        ctx.context?.subscriptions
    );
}

/**
 * サーバーHTMLの /agent-image URL をローカル画像の Webview URI に差し替える
 * サイドバーと同じ画像ディレクトリからランダム選択する
 */
function replaceAgentImageWithLocal(html: string, ctx: ViewContext): string {
    if (!ctx.reportViewerPanel || !ctx.workspaceRoot) return html;

    // <img src="/agent-image?agent=xxx&project=xxx" ... > を検出
    const match = html.match(/src="\/agent-image\?agent=([^&"]+)/);
    if (!match) return html;

    const agentId = decodeURIComponent(match[1]);
    const imagesDir = path.join(ctx.workspaceRoot, '.maid-agent', 'system', 'resources', 'images');
    if (!fs.existsSync(imagesDir)) return html;

    // バージョン画像をスキャン（{agentId}.ext, {agentId}_{number}.ext）
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
    const candidates: string[] = [];
    try {
        const files = fs.readdirSync(imagesDir);
        for (const file of files) {
            const baseRegex = new RegExp(`^${agentId}\\.(${extensions.join('|')})$`);
            const versionRegex = new RegExp(`^${agentId}_(\\d+)\\.(${extensions.join('|')})$`);
            if (baseRegex.test(file) || versionRegex.test(file)) {
                candidates.push(file);
            }
        }
    } catch {
        return html;
    }

    if (candidates.length === 0) return html;

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    const localUri = ctx.reportViewerPanel.webview.asWebviewUri(
        vscode.Uri.file(path.join(imagesDir, selected))
    ).toString();

    // src属性を差し替え
    return html.replace(/src="\/agent-image\?[^"]*"/, `src="${localUri}"`);
}

/**
 * レポートビューアのHTMLを設定
 */
export function setReportViewerHtml(ctx: ViewContext, contentHtml: string, fileName: string): void {
    if (!ctx.reportViewerPanel) return;
    ctx.reportViewerPanel.webview.html = `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 16px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
            line-height: 1.6;
            font-size: 13px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e94560;
        }
        h1 { color: #e94560; margin: 0; font-size: 1.2em; }
        .content {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 16px;
        }
        .md-h1 { font-size: 1.4em; color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 6px; margin: 16px 0 12px 0; }
        .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
        .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
        .md-p { margin: 8px 0; }
        .md-ul { margin: 6px 0; padding-left: 25px; }
        .md-li { margin: 4px 0; list-style-type: disc; }
        .md-checkbox { padding: 4px 0; }
        .md-checkbox.checked { color: #81c784; }
        .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .md-table th, .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
        .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
        .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
        .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
        .md-hr { border: none; border-top: 1px solid #444; margin: 16px 0; }
        .md-link { color: #4fc3f7; }
        strong { color: #ffc107; }
        em { font-style: italic; color: #aaa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escapeHtml('📄 ' + fileName)}</h1>
    </div>
    <div class="content">
        ${contentHtml}
    </div>
</body>
</html>`;
}

/**
 * レポートビューアのHTMLを生成（文字列として返す）
 * setReportViewerHtml()のHTML生成部分を関数化。フォールバック用ローカルレンダリングで使用。
 */
function buildReportViewerHtml(contentHtml: string, fileName: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 16px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
            line-height: 1.6;
            font-size: 13px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e94560;
        }
        h1 { color: #e94560; margin: 0; font-size: 1.2em; }
        .content {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 16px;
        }
        .md-h1 { font-size: 1.4em; color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 6px; margin: 16px 0 12px 0; }
        .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
        .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
        .md-p { margin: 8px 0; }
        .md-ul { margin: 6px 0; padding-left: 25px; }
        .md-li { margin: 4px 0; list-style-type: disc; }
        .md-checkbox { padding: 4px 0; }
        .md-checkbox.checked { color: #81c784; }
        .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .md-table th, .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
        .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
        .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
        .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
        .md-hr { border: none; border-top: 1px solid #444; margin: 16px 0; }
        .md-link { color: #4fc3f7; }
        strong { color: #ffc107; }
        em { font-style: italic; color: #aaa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escapeHtml('📄 ' + fileName)}</h1>
    </div>
    <div class="content">
        ${contentHtml}
    </div>
</body>
</html>`;
}

/**
 * Serializerからダッシュボードパネルを復元する
 */
export function restoreDashboardPanel(ctx: ViewContext, panel: vscode.WebviewPanel): void {
    ctx.dashboardPanel = panel;

    // パネル破棄時の処理を再設定
    panel.onDidDispose(() => {
        ctx.dashboardPanel = undefined;
        stopDashboardPolling(ctx);
    });

    // 自動更新ポーリングを開始
    startDashboardPolling(ctx);

    // メッセージハンドラを再設定
    setupDashboardMessageHandler(ctx, panel);

    // パネル内容を更新
    updateDashboard(ctx);
}
