/**
 * ファイル表示・レポートビューア
 *
 * 責務: ファイルプレビュー表示、レポートビューアパネル管理
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DASHBOARD_SERVER_URL } from '../../constants';
import { CURRENT_ENV, windowsToWslPath } from '../../utils/environment';
import { simpleMarkdownToHtml } from '../../utils/markdown';
import { isPathWithinRoot, isPathWithinRootCrossEnv, normalizePathForValidation } from '../../utils/path-validator';
import { escapeHtml } from '../../utils/html-escape';

/**
 * ファイルビューアのコンテキスト（依存性注入用）
 */
export interface FileViewerContext {
    /** ワークスペースルート */
    workspaceRoot?: string;
    /** .maid-agentパス */
    maidAgentPath?: string;
    /** レポートビューアパネル */
    reportViewerPanel?: vscode.WebviewPanel;
    /** ExtensionContext */
    context?: vscode.ExtensionContext;
    /** ログ関数 */
    log: (message: string) => void;
}

/**
 * ファイルビューアの状態（更新用）
 */
export interface FileViewerState {
    reportViewerPanel?: vscode.WebviewPanel;
}

/**
 * ブラウザでダッシュボードを開く
 */
export function openDashboardInBrowser(ctx: FileViewerContext): void {
    if (!ctx.workspaceRoot) return;
    const serverUrl = DASHBOARD_SERVER_URL;
    const normalizedPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(ctx.workspaceRoot)
        : ctx.workspaceRoot;
    const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(normalizedPath)}`;
    vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
}

/**
 * .maid-agentディレクトリ内のファイルを開く
 */
export async function openMaidAgentFile(ctx: FileViewerContext, filename: string): Promise<void> {
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
 */
export async function openFileWithPreview(
    ctx: FileViewerContext,
    filePath: string
): Promise<FileViewerState> {
    const state: FileViewerState = {
        reportViewerPanel: ctx.reportViewerPanel,
    };

    try {
        ctx.log(`[openFileWithPreview] 入力パス: ${filePath}`);
        ctx.log(`[openFileWithPreview] CURRENT_ENV: ${CURRENT_ENV}`);
        ctx.log(`[openFileWithPreview] workspaceRoot: ${ctx.workspaceRoot}`);

        filePath = normalizePathForValidation(filePath, CURRENT_ENV);
        ctx.log(`[openFileWithPreview] 正規化後パス: ${filePath}`);

        if (ctx.workspaceRoot && !isPathWithinRootCrossEnv(filePath, ctx.workspaceRoot, CURRENT_ENV)) {
            ctx.log(`[openFileWithPreview] isPathWithinRootCrossEnv=false → ブロック`);
            vscode.window.showErrorMessage('許可されたディレクトリ外のファイルは開けません');
            return state;
        }

        const fileName = path.basename(filePath);

        // サーバーからリンク化済みHTMLを取得
        let html = await fetchRenderedFileHtml(ctx, filePath);

        if (!html) {
            // フォールバック: ローカルレンダリング
            html = renderFileLocally(filePath, fileName, ctx.workspaceRoot);
            if (!html) return state;
        }

        // パネル作成/再利用
        state.reportViewerPanel = ensureReportViewerPanel(ctx, fileName);

        // エージェント背景画像の差し替え
        html = replaceAgentImageWithLocal(html, state.reportViewerPanel, ctx.workspaceRoot);

        state.reportViewerPanel.webview.html = html;
        state.reportViewerPanel.reveal(vscode.ViewColumn.Active);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`ファイルを開けませんでした: ${message}`);
    }

    return state;
}

/**
 * MCPサーバーの /file エンドポイントからレンダリング済みHTMLを取得
 */
async function fetchRenderedFileHtml(ctx: FileViewerContext, filePath: string): Promise<string | null> {
    try {
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

        // VSCode Webview用のクリックハンドラを注入
        const vscodeOpenFileScript = `
<script>
    var _vscodeApi = null;
    try { if (typeof acquireVsCodeApi !== 'undefined') { _vscodeApi = acquireVsCodeApi(); } } catch (e) { /* 意図的に無視 */ }

    document.querySelectorAll('.path-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
            if (_vscodeApi) {
                e.preventDefault();
                _vscodeApi.postMessage({ command: 'openFile', path: this.dataset.path });
            }
        });
    });

    document.querySelectorAll('.report-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
            if (_vscodeApi) {
                e.preventDefault();
                _vscodeApi.postMessage({ command: 'openFile', path: this.dataset.path });
            }
        });
    });
</script>`;
        html = html.replace('</body>', vscodeOpenFileScript + '\n</body>');

        return html;
    } catch {
        return null;
    }
}

/**
 * ローカルファイルを読み込みHTMLに変換（フォールバック用）
 */
function renderFileLocally(filePath: string, fileName: string, workspaceRoot?: string): string | null {
    const normalizedPath = CURRENT_ENV === 'wsl'
        ? windowsToWslPath(filePath)
        : filePath;

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
 */
function ensureReportViewerPanel(ctx: FileViewerContext, fileName: string): vscode.WebviewPanel {
    if (ctx.reportViewerPanel) {
        ctx.reportViewerPanel.title = `📄 ${fileName}`;
        return ctx.reportViewerPanel;
    }

    const panel = vscode.window.createWebviewPanel(
        'maidAgentReportViewer',
        `📄 ${fileName}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: false }
    );

    panel.onDidDispose(() => {
        // 注: 呼び出し元で state.reportViewerPanel = undefined を設定する必要あり
    });

    // ネストしたファイルも開ける
    panel.webview.onDidReceiveMessage(
        message => {
            if (message.command === 'openFile') {
                openFileWithPreview(ctx, message.path);
            }
        },
        undefined,
        ctx.context?.subscriptions
    );

    return panel;
}

/**
 * サーバーHTMLの /agent-image URL をローカル画像のWebview URIに差し替える
 */
function replaceAgentImageWithLocal(
    html: string,
    panel: vscode.WebviewPanel,
    workspaceRoot?: string
): string {
    if (!workspaceRoot) return html;

    const match = html.match(/src="\/agent-image\?agent=([^&"]+)/);
    if (!match) return html;

    const agentId = decodeURIComponent(match[1]);
    const imagesDir = path.join(workspaceRoot, '.maid-agent', 'system', 'resources', 'images');
    if (!fs.existsSync(imagesDir)) return html;

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
    const localUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(imagesDir, selected))
    ).toString();

    return html.replace(/src="\/agent-image\?[^"]*"/, `src="${localUri}"`);
}

/**
 * レポートビューアのHTMLを設定
 */
export function setReportViewerHtml(
    panel: vscode.WebviewPanel,
    contentHtml: string,
    fileName: string
): void {
    panel.webview.html = buildReportViewerHtml(contentHtml, fileName);
}

/**
 * レポートビューアのHTMLを生成
 */
export function buildReportViewerHtml(contentHtml: string, fileName: string): string {
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
