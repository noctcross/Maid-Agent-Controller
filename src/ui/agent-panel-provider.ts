import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, AgentPanelMessage, AgentPanelUpdateData } from '../types';
import { MAID_AGENT_DIR, AGENT_COLORS } from '../constants';

// =============================================================================
// エージェントパネル（サイドバー用 WebviewView）
// =============================================================================

export class AgentPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'maidAgent.agentPanel';
    private _view?: vscode.WebviewView;
    private _currentAgentId: string | null = null;
    private _agents: Map<string, Agent> = new Map();
    private _extensionUri: vscode.Uri;
    private _workspaceRoot: string | undefined;
    private _outputChannel: vscode.OutputChannel | undefined;
    private _onMessage: ((message: AgentPanelMessage) => void) | undefined;
    private _taskStats: AgentPanelUpdateData['stats'] | undefined;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public setOutputChannel(channel: vscode.OutputChannel): void {
        this._outputChannel = channel;
    }

    private _log(message: string): void {
        if (this._outputChannel) {
            this._outputChannel.appendLine(`[AgentPanel] ${message}`);
        }
    }

    public setWorkspaceRoot(workspaceRoot: string | undefined): void {
        this._workspaceRoot = workspaceRoot;
        this._log(`setWorkspaceRoot: ${workspaceRoot}`);
        this._updateWebview();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        this._log(`resolveWebviewView: workspaceRoot=${this._workspaceRoot}`);

        // localResourceRoots にワークスペースも追加
        const resourceRoots = [this._extensionUri];
        if (this._workspaceRoot) {
            resourceRoots.push(vscode.Uri.file(this._workspaceRoot));
            this._log(`resolveWebviewView: localResourceRoots に ${this._workspaceRoot} を追加`);
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: resourceRoots
        };

        // Webview → Extension メッセージハンドリング
        webviewView.webview.onDidReceiveMessage(
            (message: AgentPanelMessage) => {
                this._log(`Message received: ${message.command}`);
                if (this._onMessage) {
                    this._onMessage(message);
                }
            }
        );

        this._updateWebview();
    }

    public setAgents(agents: Map<string, Agent>): void {
        this._agents = agents;
        this._updateWebview();
    }

    public onMessage(callback: (message: AgentPanelMessage) => void): void {
        this._onMessage = callback;
    }

    public setTaskStats(stats: AgentPanelUpdateData['stats']): void {
        this._taskStats = stats;
        this._updateWebview();
    }

    public postUpdate(data: Partial<AgentPanelUpdateData>): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'update', ...data });
        }
    }

    public setCurrentAgent(agentId: string | null): void {
        this._currentAgentId = agentId;
        this._log(`setCurrentAgent: ${agentId}`);
        this._updateWebview();
    }

    /**
     * エージェントの画像パスを取得
     * 優先順位:
     * 1. ステータス画像 (emma_wait.png, emma_work.png, emma_question.png)
     * 2. バージョン画像 (emma_1.png, emma_2.png) からランダム選択
     * 3. 基本画像 (emma.png)
     */
    private _getAgentImageUri(agentId: string, status: string): string | null {
        if (!this._workspaceRoot || !this._view) {
            this._log(`画像取得スキップ: workspaceRoot=${!!this._workspaceRoot}, view=${!!this._view}`);
            return null;
        }

        const imagesDir = path.join(this._workspaceRoot, MAID_AGENT_DIR, 'system', 'resources', 'images');
        const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

        // imagesDir の存在確認
        const imagesDirExists = fs.existsSync(imagesDir);
        this._log(`画像検索: agentId=${agentId}, imagesDir=${imagesDir}, exists=${imagesDirExists}`);

        if (!imagesDirExists) {
            // ディレクトリ内容を確認
            const maidAgentDir = path.join(this._workspaceRoot, MAID_AGENT_DIR);
            if (fs.existsSync(maidAgentDir)) {
                try {
                    const contents = fs.readdirSync(maidAgentDir);
                    this._log(`.maid-agent 内容: ${contents.join(', ')}`);
                } catch (e) {
                    this._log(`.maid-agent 読み取りエラー: ${e}`);
                }
            } else {
                this._log(`.maid-agent ディレクトリが存在しません`);
            }
            return null;
        }

        // 1. ステータス画像を探す (emma_wait, emma_work, emma_question)
        const statusSuffix = status === 'working' ? 'work' :
                            status === 'done' ? 'done' : 'wait';
        for (const ext of extensions) {
            const statusImagePath = path.join(imagesDir, `${agentId}_${statusSuffix}.${ext}`);
            if (fs.existsSync(statusImagePath)) {
                const imageUri = vscode.Uri.file(statusImagePath);
                const webviewUri = this._view.webview.asWebviewUri(imageUri).toString();
                this._log(`ステータス画像発見: ${statusImagePath} -> ${webviewUri}`);
                return webviewUri;
            }
        }

        // 2. バージョン画像を探す (emma_1, emma_2, ...)
        const versionImages: string[] = [];
        for (const ext of extensions) {
            let version = 1;
            while (version <= 10) { // 最大10バージョンまで
                const versionImagePath = path.join(imagesDir, `${agentId}_${version}.${ext}`);
                if (fs.existsSync(versionImagePath)) {
                    versionImages.push(versionImagePath);
                    version++;
                } else {
                    break;
                }
            }
        }

        if (versionImages.length > 0) {
            // タブ切り替えごとにランダム選択
            const randomIndex = Math.floor(Math.random() * versionImages.length);
            const selectedPath = versionImages[randomIndex];
            const imageUri = vscode.Uri.file(selectedPath);
            const webviewUri = this._view.webview.asWebviewUri(imageUri).toString();
            this._log(`バージョン画像発見: ${selectedPath} -> ${webviewUri}`);
            return webviewUri;
        }

        // 3. 基本画像を探す (emma.png)
        for (const ext of extensions) {
            const imagePath = path.join(imagesDir, `${agentId}.${ext}`);
            if (fs.existsSync(imagePath)) {
                const imageUri = vscode.Uri.file(imagePath);
                const webviewUri = this._view.webview.asWebviewUri(imageUri).toString();
                this._log(`基本画像発見: ${imagePath} -> ${webviewUri}`);
                return webviewUri;
            }
        }

        // 見つからなかった場合、imagesDir の内容をログ
        try {
            const files = fs.readdirSync(imagesDir);
            this._log(`画像未発見 (${agentId}), images内のファイル: ${files.join(', ')}`);
        } catch (e) {
            this._log(`images ディレクトリ読み取りエラー: ${e}`);
        }

        return null;
    }

    private _updateWebview(): void {
        if (!this._view) {
            this._log('_updateWebview: view が未設定');
            return;
        }

        this._log(`_updateWebview: currentAgentId=${this._currentAgentId}, workspaceRoot=${this._workspaceRoot}`);

        const agent = this._currentAgentId ? this._agents.get(this._currentAgentId) : null;
        const colors = this._currentAgentId ? AGENT_COLORS[this._currentAgentId] : null;

        let content: string;
        if (agent && colors) {
            const roleLabel = agent.role === 'butler' ? '執事' :
                             agent.role === 'chiefMaid' ? 'メイド長' : 'メイド';
            const emoji = agent.role === 'butler' ? '🎩' :
                         agent.role === 'chiefMaid' ? '👑' : '🎀';
            const statusEmoji = agent.status === 'working' ? '⚡' :
                               agent.status === 'done' ? '✅' : '💤';
            const statusLabel = agent.status === 'working' ? 'working' :
                               agent.status === 'done' ? 'done' : 'waiting';

            // 画像があれば使用、なければ絵文字
            const imageUri = this._getAgentImageUri(this._currentAgentId!, agent.status);
            this._log(`_updateWebview: imageUri=${imageUri ? '取得成功' : 'null'}`);

            if (imageUri) {
                // 立ち絵スタイル（画像あり）
                content = `
                    <div class="agent-display standing" style="border-color: ${colors.accent};">
                        <div class="standing-image">
                            <img src="${imageUri}" class="character-img" alt="${agent.name}" />
                        </div>
                        <div class="info-bar" style="background: linear-gradient(to right, ${colors.accent}22, ${colors.accent}44);">
                            <div class="name" style="color: ${colors.accent};">${emoji} ${agent.name}</div>
                            <div class="role">${roleLabel}</div>
                            <div class="status">${statusEmoji} ${statusLabel}</div>
                        </div>
                    </div>
                `;
            } else {
                // 絵文字フォールバック
                content = `
                    <div class="agent-display compact" style="border-color: ${colors.accent};">
                        <div class="emoji-avatar" style="background: ${colors.accent}22;">
                            <span class="emoji">${emoji}</span>
                        </div>
                        <div class="name" style="color: ${colors.accent};">${agent.name}</div>
                        <div class="role">${roleLabel}</div>
                        <div class="status">${statusEmoji} ${statusLabel}</div>
                    </div>
                `;
            }
        } else {
            content = `
                <div class="no-agent">
                    <div class="emoji">👤</div>
                    <div class="message">エージェントのターミナルを<br>選択してください</div>
                </div>
            `;
        }

        // エージェント一覧セクション
        let agentListHtml = '';
        if (this._agents.size > 0) {
            const agentItems = Array.from(this._agents.entries()).map(([id, a]) => {
                const isSelected = id === this._currentAgentId;
                const roleEmoji = a.role === 'butler' ? '🎩' : a.role === 'chiefMaid' ? '👑' : '🎀';
                const statusEmoji = a.status === 'working' ? '⚡' : a.status === 'done' ? '✅' : '💤';
                const selectedClass = isSelected ? ' selected' : '';
                return `<div class="agent-item${selectedClass}" data-agent-id="${id}">
                    <span class="agent-role">${roleEmoji}</span>
                    <span class="agent-name">${a.name}</span>
                    <span class="agent-status">${statusEmoji}</span>
                </div>`;
            }).join('');

            agentListHtml = `
                <div class="section">
                    <div class="section-title">チーム</div>
                    ${agentItems}
                </div>`;
        }

        // アラート + タスク統計セクション
        let statsHtml = '';
        if (this._taskStats) {
            const s = this._taskStats;
            let alertHtml = '';
            if (s.actionRequiredCount > 0) {
                alertHtml += `<div class="alert alert-danger" data-action="showDashboard">🚨 要対応: ${s.actionRequiredCount}件</div>`;
            }
            if (s.blockedCount > 0) {
                alertHtml += `<div class="alert alert-danger" data-action="showDashboard">🚫 ブロック: ${s.blockedCount}件</div>`;
            }
            if (alertHtml) {
                alertHtml = `<div class="section"><div class="section-title">アラート</div>${alertHtml}</div>`;
            }
            statsHtml = `
                ${alertHtml}
                <div class="section">
                    <div class="section-title">タスク概要</div>
                    <div class="stats-grid">
                        <div class="stat">⏳ 待機: ${s.pendingCount}</div>
                        <div class="stat">⚡ 進行: ${s.workingCount}</div>
                        <div class="stat">✅ 完了: ${s.completedTodayCount} (本日)</div>
                    </div>
                </div>`;
        }

        // クイックアクションセクション
        const quickActionsHtml = `
            <div class="section">
                <div class="section-title">クイックアクション</div>
                <div class="quick-actions">
                    <button class="action-btn" data-action="showController">🎩 Controller</button>
                    <button class="action-btn" data-action="showDashboard">📋 Tasks</button>
                    <button class="action-btn" data-action="openInBrowser">🌐 ブラウザ</button>
                </div>
            </div>`;

        this._view.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 8px;
        }

        /* 立ち絵スタイル（画像あり） */
        .agent-display.standing {
            width: 100%;
            max-width: 280px;
            border: 2px solid;
            border-radius: 12px;
            overflow: hidden;
            background: rgba(0,0,0,0.3);
        }
        .standing-image {
            width: 100%;
            max-height: 400px;
            display: flex;
            justify-content: center;
            align-items: flex-end;
            overflow: hidden;
        }
        .character-img {
            max-width: 100%;
            max-height: 400px;
            object-fit: contain;
            object-position: bottom center;
        }
        .info-bar {
            padding: 12px;
            text-align: center;
        }

        /* コンパクトスタイル（絵文字） */
        .agent-display.compact {
            text-align: center;
            padding: 20px;
            border-radius: 12px;
            border: 2px solid;
            width: 100%;
            max-width: 200px;
            background: rgba(0,0,0,0.3);
        }
        .emoji-avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            margin: 0 auto 15px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* 共通 */
        .emoji {
            font-size: 40px;
        }
        .name {
            font-size: 1.2em;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .role {
            font-size: 0.8em;
            color: #aaa;
            margin-bottom: 6px;
        }
        .status {
            font-size: 0.85em;
            padding: 4px 12px;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            display: inline-block;
        }

        /* エージェント未選択 */
        .no-agent {
            text-align: center;
            color: #666;
            padding: 40px 20px;
        }
        .no-agent .emoji {
            font-size: 60px;
            margin-bottom: 15px;
            opacity: 0.4;
        }
        .no-agent .message {
            font-size: 0.9em;
            line-height: 1.6;
        }

        /* セクション共通 */
        .section { margin-top: 12px; width: 100%; }
        .section-title {
            font-size: 0.75em;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 4px 8px;
            border-bottom: 1px solid #333;
        }

        /* エージェント一覧 */
        .agent-item {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            cursor: pointer;
            border-left: 3px solid transparent;
            font-size: 0.85em;
        }
        .agent-item:hover { background: rgba(255,255,255,0.05); }
        .agent-item.selected {
            border-left-color: var(--vscode-focusBorder, #007fd4);
            background: rgba(255,255,255,0.08);
        }
        .agent-role { margin-right: 6px; }
        .agent-name { flex: 1; }
        .agent-status { opacity: 0.7; }

        /* アラート */
        .alert {
            padding: 6px 8px;
            font-size: 0.85em;
            cursor: pointer;
        }
        .alert-danger { color: #f48771; }
        .alert:hover { background: rgba(255,255,255,0.05); }

        /* タスク統計 */
        .stats-grid {
            padding: 6px 8px;
            font-size: 0.85em;
        }
        .stat { padding: 2px 0; }

        /* クイックアクション */
        .quick-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            padding: 6px 8px;
        }
        .action-btn {
            flex: 1;
            min-width: 80px;
            padding: 6px 8px;
            background: rgba(255,255,255,0.08);
            border: 1px solid #444;
            border-radius: 4px;
            color: #ddd;
            cursor: pointer;
            font-size: 0.8em;
            text-align: center;
        }
        .action-btn:hover {
            background: rgba(255,255,255,0.15);
            border-color: #666;
        }
    </style>
</head>
<body>
    ${content}
    ${statsHtml}
    ${agentListHtml}
    ${quickActionsHtml}
    <script>
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('.agent-item').forEach(item => {
            item.addEventListener('click', () => {
                vscode.postMessage({ command: 'selectAgent', agentId: item.dataset.agentId });
            });
        });
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                vscode.postMessage({ command: btn.dataset.action });
            });
        });
        document.querySelectorAll('.alert').forEach(alert => {
            alert.addEventListener('click', () => {
                vscode.postMessage({ command: alert.dataset.action });
            });
        });
    </script>
</body>
</html>`;
    }
}
