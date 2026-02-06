import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../types';
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

        this._updateWebview();
    }

    public setAgents(agents: Map<string, Agent>): void {
        this._agents = agents;
        this._updateWebview();
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
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
    }
}
