import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

interface Agent {
    name: string;
    id: string;
    terminal: vscode.Terminal;
    role: 'butler' | 'chiefMaid' | 'maid';
    status: 'offline' | 'idle' | 'working' | 'done';
}

interface MaidConfig {
    name: string;
    id: string;
    emoji: string;
}

// =============================================================================
// 定数
// =============================================================================

const MAID_AGENT_DIR = '.maid-agent';

const MAIDS_MAP: { [key: string]: MaidConfig } = {
    emma: { name: 'エマ', id: 'emma', emoji: '🎀' },
    sophia: { name: 'ソフィア', id: 'sophia', emoji: '🎀' },
    lily: { name: 'リリー', id: 'lily', emoji: '🎀' },
    rose: { name: 'ローズ', id: 'rose', emoji: '🎀' },
    alice: { name: 'アリス', id: 'alice', emoji: '🎀' },
    may: { name: 'メイ', id: 'may', emoji: '🎀' },
    flora: { name: 'フローラ', id: 'flora', emoji: '🎀' },
    luna: { name: 'ルナ', id: 'luna', emoji: '🎀' },
};

const DEFAULT_MAID_ORDER = ['emma', 'sophia', 'lily', 'rose', 'alice', 'may', 'flora', 'luna'];

/**
 * 設定からメイドの順序を取得
 */
function getOrderedMaids(): MaidConfig[] {
    const config = vscode.workspace.getConfiguration('maidAgent');
    const maidOrder = config.get<string[]>('maidOrder', DEFAULT_MAID_ORDER);

    // 設定に基づいて順序付けされたメイドリストを作成
    const orderedMaids: MaidConfig[] = [];
    for (const id of maidOrder) {
        if (MAIDS_MAP[id]) {
            orderedMaids.push(MAIDS_MAP[id]);
        }
    }

    // 設定に含まれていないメイドを追加（安全のため）
    for (const id of DEFAULT_MAID_ORDER) {
        if (!maidOrder.includes(id) && MAIDS_MAP[id]) {
            orderedMaids.push(MAIDS_MAP[id]);
        }
    }

    return orderedMaids;
}

// 後方互換性のためのエイリアス（内部で getOrderedMaids() を使用）
const MAIDS = DEFAULT_MAID_ORDER.map(id => MAIDS_MAP[id]);

// エージェントごとの色設定
const AGENT_COLORS: { [key: string]: { bg: string; accent: string } } = {
    butler: { bg: '#1a1a2e', accent: '#008080' },      // ティール
    chief: { bg: '#1a1a2e', accent: '#008080' },       // ティール
    emma: { bg: '#1a1a2e', accent: '#8B5A2B' },        // ブラウン
    sophia: { bg: '#1a1a2e', accent: '#4169E1' },      // ブルー
    lily: { bg: '#1a1a2e', accent: '#FFB6C1' },        // ピンク
    rose: { bg: '#1a1a2e', accent: '#DC143C' },        // レッド
    alice: { bg: '#1a1a2e', accent: '#DAA520' },       // ゴールド
    may: { bg: '#1a1a2e', accent: '#808080' },         // グレー
    flora: { bg: '#1a1a2e', accent: '#228B22' },       // グリーン
    luna: { bg: '#1a1a2e', accent: '#800080' },        // パープル
};

// =============================================================================
// エージェントパネル（サイドバー用 WebviewView）
// =============================================================================

class AgentPanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'maidAgent.agentPanel';
    private _view?: vscode.WebviewView;
    private _currentAgentId: string | null = null;
    private _agents: Map<string, Agent> = new Map();
    private _extensionUri: vscode.Uri;
    private _workspaceRoot: string | undefined;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public setWorkspaceRoot(workspaceRoot: string | undefined): void {
        this._workspaceRoot = workspaceRoot;
        this._updateWebview();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        // localResourceRoots にワークスペースも追加
        const resourceRoots = [this._extensionUri];
        if (this._workspaceRoot) {
            resourceRoots.push(vscode.Uri.file(this._workspaceRoot));
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
        if (!this._workspaceRoot || !this._view) return null;

        const imagesDir = path.join(this._workspaceRoot, MAID_AGENT_DIR, 'images');
        const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

        // 1. ステータス画像を探す (emma_wait, emma_work, emma_question)
        const statusSuffix = status === 'working' ? 'work' :
                            status === 'done' ? 'done' : 'wait';
        for (const ext of extensions) {
            const statusImagePath = path.join(imagesDir, `${agentId}_${statusSuffix}.${ext}`);
            if (fs.existsSync(statusImagePath)) {
                const imageUri = vscode.Uri.file(statusImagePath);
                return this._view.webview.asWebviewUri(imageUri).toString();
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
            return this._view.webview.asWebviewUri(imageUri).toString();
        }

        // 3. 基本画像を探す (emma.png)
        for (const ext of extensions) {
            const imagePath = path.join(imagesDir, `${agentId}.${ext}`);
            if (fs.existsSync(imagePath)) {
                const imageUri = vscode.Uri.file(imagePath);
                return this._view.webview.asWebviewUri(imageUri).toString();
            }
        }

        return null;
    }

    private _updateWebview(): void {
        if (!this._view) return;

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

// =============================================================================
// メインコントローラー
// =============================================================================

class MultiAgentController {
    private agents: Map<string, Agent> = new Map();
    private outputChannel: vscode.OutputChannel;
    private dashboardPanel: vscode.WebviewPanel | undefined;
    private logs: string[] = [];
    private context: vscode.ExtensionContext | undefined;
    private workspaceRoot: string | undefined;
    private maidAgentPath: string | undefined;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private agentPanelProvider: AgentPanelProvider | undefined;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Maid Agent');
    }

    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (this.workspaceRoot) {
            this.maidAgentPath = path.join(this.workspaceRoot, MAID_AGENT_DIR);
        }
    }

    setAgentPanelProvider(provider: AgentPanelProvider): void {
        this.agentPanelProvider = provider;
    }

    // エージェントパネルを更新
    private updateAgentPanel(): void {
        if (this.agentPanelProvider) {
            this.agentPanelProvider.setAgents(this.agents);
        }
    }

    // ターミナル名からエージェントIDを取得
    getAgentIdFromTerminal(terminal: vscode.Terminal): string | null {
        for (const [id, agent] of this.agents) {
            if (agent.terminal === terminal) {
                return id;
            }
        }
        return null;
    }

    // 現在のエージェントを設定（パネル更新用）
    setCurrentAgentFromTerminal(terminal: vscode.Terminal | undefined): void {
        if (!this.agentPanelProvider) return;

        if (!terminal) {
            this.agentPanelProvider.setCurrentAgent(null);
            return;
        }

        const agentId = this.getAgentIdFromTerminal(terminal);
        this.agentPanelProvider.setCurrentAgent(agentId);
    }

    // =========================================================================
    // 初期化
    // =========================================================================

    async initializeWorkspace(): Promise<boolean> {
        if (!this.workspaceRoot) {
            vscode.window.showErrorMessage('ワークスペースが開かれていません');
            return false;
        }

        const maidAgentPath = path.join(this.workspaceRoot, MAID_AGENT_DIR);

        if (fs.existsSync(maidAgentPath)) {
            const choice = await vscode.window.showWarningMessage(
                `.maid-agent ディレクトリは既に存在します。再初期化しますか？`,
                '再初期化', 'キャンセル'
            );
            if (choice !== '再初期化') {
                return false;
            }
        }

        try {
            // テンプレートからコピー
            const extensionPath = this.context?.extensionPath;
            if (!extensionPath) {
                throw new Error('拡張機能のパスが取得できません');
            }

            const templatesPath = path.join(extensionPath, 'templates');

            // ディレクトリ構造を作成
            this.copyDirectorySync(templatesPath, maidAgentPath);

            // reports ディレクトリに各メイド用のファイルを作成
            const reportsPath = path.join(maidAgentPath, 'reports');
            if (!fs.existsSync(reportsPath)) {
                fs.mkdirSync(reportsPath, { recursive: true });
            }
            for (const maid of MAIDS) {
                const reportFile = path.join(reportsPath, `${maid.id}.md`);
                if (!fs.existsSync(reportFile)) {
                    fs.writeFileSync(reportFile, `# 作業報告 - ${maid.name}\n\n(報告なし)\n`);
                }
            }

            // プロジェクトルートの CLAUDE.md を処理
            await this.setupRootClaudeMd();

            this.log('[初期化] .maid-agent ディレクトリを作成しました');
            vscode.window.showInformationMessage('🎩 Maid Agent の初期化が完了しました');

            // ルートの CLAUDE.md を開く
            const claudeMdPath = path.join(this.workspaceRoot, 'CLAUDE.md');
            const doc = await vscode.workspace.openTextDocument(claudeMdPath);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

            return true;
        } catch (error) {
            this.log(`[ERROR] 初期化に失敗: ${error}`);
            vscode.window.showErrorMessage(`初期化に失敗しました: ${error}`);
            return false;
        }
    }

    /**
     * プロジェクトルートの CLAUDE.md を設定
     * - 存在しない場合: 新規作成
     * - 存在する場合: 先頭に Maid Agent 指示を追記
     */
    private async setupRootClaudeMd(): Promise<void> {
        if (!this.workspaceRoot) return;

        const claudeMdPath = path.join(this.workspaceRoot, 'CLAUDE.md');
        const maidAgentHeader = this.getMaidAgentClaudeHeader();

        if (fs.existsSync(claudeMdPath)) {
            // 既存の CLAUDE.md がある場合
            const existingContent = fs.readFileSync(claudeMdPath, 'utf-8');

            // 既に Maid Agent セクションがある場合はスキップ
            if (existingContent.includes('# Maid Agent System')) {
                this.log('[CLAUDE.md] 既に Maid Agent セクションが存在します');
                return;
            }

            // 先頭に追記するか確認
            const choice = await vscode.window.showWarningMessage(
                'CLAUDE.md が既に存在します。Maid Agent の指示を先頭に追加しますか？',
                '追加する', 'スキップ'
            );

            if (choice === '追加する') {
                const newContent = maidAgentHeader + '\n---\n\n' + existingContent;
                fs.writeFileSync(claudeMdPath, newContent);
                this.log('[CLAUDE.md] 既存ファイルに Maid Agent 指示を追記しました');
            }
        } else {
            // 新規作成
            fs.writeFileSync(claudeMdPath, maidAgentHeader);
            this.log('[CLAUDE.md] 新規作成しました');
        }
    }

    /**
     * CLAUDE.md に追記する Maid Agent 用のヘッダー
     */
    private getMaidAgentClaudeHeader(): string {
        return `# Maid Agent System

このプロジェクトは Maid Agent マルチエージェントシステムで管理されています。

## セッション開始時（必須）

1. Memory MCP で過去の知識グラフを読み込み（利用可能な場合）
2. \`.maid-agent/context/\` でプロジェクト固有情報を確認
3. 自分の役割を確認（下記参照）

## あなたの役割

起動時に自分の役割を確認してください:
- 🎩 執事 (Butler): \`.maid-agent/instructions/butler.md\` を参照
- 👑 メイド長 (Chief Maid): \`.maid-agent/instructions/chief.md\` を参照
- 🎀 メイド (Maid): \`.maid-agent/instructions/maid.md\` を参照

## 階層構造

\`\`\`
ご主人様 (Human)
    ↓
🎩 執事 ──→ 戦略立案・タスク分解
    ↓
👑 メイド長 ──→ タスク配分・進捗管理
    ↓
🎀 メイド×8 ──→ 実作業担当
\`\`\`

## 重要なルール

1. **指揮系統厳守**: 執事→メイド長→メイド の順序を守る
2. **自己実行禁止**: 執事・メイド長は自分で作業しない
3. **報告は dashboard.md**: 上への報告は \`.maid-agent/dashboard.md\` を更新
4. **指示は YAML キュー**: 下への指示は \`.maid-agent/queue/\` のYAMLファイル経由
5. **sendText 2段階**: 通知時はメッセージとEnterを別々に送信

## ファイル構成

- 詳細設計書: \`.maid-agent/CLAUDE.md\`
- プロジェクトコンテキスト: \`.maid-agent/context/\`
- スキル: \`.maid-agent/skills/\`
`;
    }

    private copyDirectorySync(src: string, dest: string): void {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                this.copyDirectorySync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    // =========================================================================
    // エージェント管理
    // =========================================================================

    createAgent(name: string, id: string, role: Agent['role'], emoji: string): Agent {
        if (!this.workspaceRoot) {
            throw new Error('ワークスペースが初期化されていません');
        }

        // 作業ディレクトリをプロジェクトルートに設定（CLAUDE.md を自動読み込み）
        const terminal = vscode.window.createTerminal({
            name: `${emoji} ${name}`,
            cwd: this.workspaceRoot
        });

        const agent: Agent = {
            name,
            id,
            terminal,
            role,
            status: 'idle'
        };
        this.agents.set(id, agent);

        this.log(`[${name}] 準備完了 (cwd: ${this.workspaceRoot})`);
        this.updateMasterStatus(id, 'idle');
        this.updateAgentPanel();
        return agent;
    }

    /**
     * エージェントにコマンドを送信（1回送信 - シェルコマンド用）
     */
    sendToAgent(agentId: string, command: string): boolean {
        const agent = this.agents.get(agentId);
        if (!agent) {
            this.log(`[ERROR] ${agentId} が見つかりません`);
            return false;
        }

        agent.terminal.sendText(command);
        agent.status = 'working';
        this.log(`[${agent.name}] → ${command.substring(0, 60)}...`);
        this.updateMasterStatus(agentId, 'working');

        this.updateDashboard();
        return true;
    }

    /**
     * エージェントにメッセージを送信（2段階送信 - Claude Code通知用）
     * multi-agent-shogun準拠: メッセージとEnterを別々に送信
     */
    async sendMessageToAgent(agentId: string, message: string): Promise<boolean> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            this.log(`[ERROR] ${agentId} が見つかりません`);
            return false;
        }

        // ステップ1: メッセージ送信（Enterなし）
        agent.terminal.sendText(message, false);

        // 少し待つ（バッファリング対策）
        await this.delay(100);

        // ステップ2: Enter送信
        agent.terminal.sendText('', true);

        this.log(`[${agent.name}] 📨 ${message.substring(0, 60)}...`);
        return true;
    }

    /**
     * エージェントでClaude Codeを起動し、役割を認識させる
     */
    async launchClaudeWithRole(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void> {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        // ターミナルが準備できるまで待つ
        await this.delay(500);

        // Claude Code を起動（権限スキップモード）
        agent.terminal.sendText('claude --dangerously-skip-permissions', true);

        // Claude Code の起動を待つ（4秒 - 起動時間にばらつきがあるため長めに）
        await this.delay(4000);

        // 役割に応じた指示を送信
        let instruction: string;
        switch (role) {
            case 'butler':
                instruction = 'あなたは執事のシルヴィアです。.maid-agent/instructions/butler.md を読んで役割を把握してください。また、.maid-agent/personas/butler.md を読んで口調・話し方を把握してください。準備ができたら、ご主人様からの指示をお待ちください。';
                break;
            case 'chiefMaid':
                instruction = 'あなたはメイド長のビオラです。.maid-agent/instructions/chief.md を読んで役割を把握してください。また、.maid-agent/personas/chief.md を読んで口調・話し方を把握してください。準備ができたら、執事シルヴィアからの指示をお待ちください。';
                break;
            case 'maid':
                const maidId = agentId; // agentId がメイドIDと一致
                instruction = `あなたはメイドの${maidName || 'メイド'}です。.maid-agent/instructions/maid.md を読んで役割を把握してください。また、.maid-agent/personas/${maidId}.md を読んで口調・話し方を把握してください。準備ができたら、メイド長ビオラからの指示をお待ちください。`;
                break;
        }

        await this.sendMessageToAgent(agentId, instruction);
        agent.status = 'idle';
        this.updateAgentPanel();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // =========================================================================
    // 階層構造の起動
    // =========================================================================

    async startButler(): Promise<void> {
        if (!await this.ensureInitialized()) return;

        if (this.agents.has('butler')) {
            vscode.window.showWarningMessage('執事は既にお仕えしております');
            return;
        }

        const butler = this.createAgent('シルヴィア', 'butler', 'butler', '🎩');
        butler.terminal.show();

        // Claude Code を起動し、役割を認識させる
        await this.launchClaudeWithRole('butler', 'butler');

        vscode.window.showInformationMessage('🎩 シルヴィアがお仕えする準備ができました！');
        this.updateDashboard();
    }

    async startChiefMaid(): Promise<void> {
        if (!await this.ensureInitialized()) return;

        if (this.agents.has('chief')) {
            vscode.window.showWarningMessage('メイド長は既にお仕えしております');
            return;
        }

        const chief = this.createAgent('ビオラ', 'chief', 'chiefMaid', '👑');
        chief.terminal.show();

        // Claude Code を起動し、役割を認識させる
        await this.launchClaudeWithRole('chief', 'chiefMaid');

        vscode.window.showInformationMessage('👑 ビオラがお仕えする準備ができました！');
        this.updateDashboard();
    }

    async startSelectedMaids(): Promise<void> {
        if (!await this.ensureInitialized()) return;

        // 未起動のメイドのみ選択肢に（設定順）
        const orderedMaids = getOrderedMaids();
        const availableMaids = orderedMaids.filter(m => !this.agents.has(m.id));

        if (availableMaids.length === 0) {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
            return;
        }

        const items = availableMaids.map(m => ({
            label: `${m.emoji} ${m.name}`,
            id: m.id,
            picked: false
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: '起動するメイドを選択してください（複数選択可）'
        });

        if (!selected || selected.length === 0) {
            return;
        }

        for (const item of selected) {
            const maid = MAIDS.find(m => m.id === item.id);
            if (maid) {
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                // Claude Code を起動し、役割を認識させる
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
            }
        }

        vscode.window.showInformationMessage(`🎀 メイド${selected.length}人がお仕えする準備ができました！`);
        this.updateDashboard();
    }

    /**
     * Call Maids xN - メイドN人を順番に起動
     */
    async startMaidsByCount(): Promise<void> {
        await this._startMaidsByCountInternal(false);
    }

    /**
     * Call Maids xN -r - メイドN人をランダムに起動
     */
    async startMaidsByCountRandom(): Promise<void> {
        await this._startMaidsByCountInternal(true);
    }

    private async _startMaidsByCountInternal(random: boolean): Promise<void> {
        if (!await this.ensureInitialized()) return;

        const orderedMaids = getOrderedMaids();
        const availableMaids = orderedMaids.filter(m => !this.agents.has(m.id));

        if (availableMaids.length === 0) {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
            return;
        }

        const countStr = await vscode.window.showInputBox({
            prompt: `何人のメイドを起動しますか？（1〜${availableMaids.length}人）${random ? '【ランダム】' : '【順番】'}`,
            placeHolder: '例: 3',
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1) {
                    return '1以上の数値を入力してください';
                }
                if (num > availableMaids.length) {
                    return `最大${availableMaids.length}人まで指定できます`;
                }
                return null;
            }
        });

        if (!countStr) return;

        const count = parseInt(countStr);

        let maidsToStart: typeof availableMaids;
        if (random) {
            const shuffled = [...availableMaids].sort(() => Math.random() - 0.5);
            maidsToStart = shuffled.slice(0, count);
        } else {
            maidsToStart = availableMaids.slice(0, count);
        }

        // 進捗表示付きで起動
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🎀 メイド起動中...',
            cancellable: false
        }, async (progress) => {
            for (let i = 0; i < maidsToStart.length; i++) {
                const maid = maidsToStart[i];
                progress.report({
                    message: `${maid.name}を起動中...`,
                    increment: (100 / maidsToStart.length)
                });
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
            }
        });

        const maidNames = maidsToStart.map(m => m.name).join('、');
        vscode.window.showInformationMessage(`🎀 ${maidNames} を起動しました！`);
        this.updateDashboard();
    }

    /**
     * Call All xN - 執事 + メイド長 + メイドN人を順番に起動
     */
    async startAllByCount(): Promise<void> {
        await this._startAllByCountInternal(false);
    }

    /**
     * Call All xN -r - 執事 + メイド長 + メイドN人をランダムに起動
     */
    async startAllByCountRandom(): Promise<void> {
        await this._startAllByCountInternal(true);
    }

    private async _startAllByCountInternal(random: boolean): Promise<void> {
        if (!await this.ensureInitialized()) return;

        const orderedMaids = getOrderedMaids();
        const availableMaids = orderedMaids.filter(m => !this.agents.has(m.id));

        if (availableMaids.length === 0) {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております。Call All をお使いください。');
            return;
        }

        const countStr = await vscode.window.showInputBox({
            prompt: `メイドを何人起動しますか？（1〜${availableMaids.length}人）執事+メイド長も起動 ${random ? '【ランダム】' : '【順番】'}`,
            placeHolder: '例: 3',
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1) {
                    return '1以上の数値を入力してください';
                }
                if (num > availableMaids.length) {
                    return `最大${availableMaids.length}人まで指定できます`;
                }
                return null;
            }
        });

        if (!countStr) return;

        const count = parseInt(countStr);

        // 進捗表示付きで起動
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🎩 エージェント起動中...',
            cancellable: false
        }, async (progress) => {
            const totalAgents = (this.agents.has('butler') ? 0 : 1) +
                               (this.agents.has('chief') ? 0 : 1) + count;
            let currentAgent = 0;

            // 執事・メイド長を先に起動
            if (!this.agents.has('butler')) {
                progress.report({ message: 'シルヴィア（執事）を起動中...', increment: 0 });
                const butler = this.createAgent('シルヴィア', 'butler', 'butler', '🎩');
                butler.terminal.show();
                await this.launchClaudeWithRole('butler', 'butler');
                currentAgent++;
                progress.report({ increment: (100 / totalAgents) });
            }

            if (!this.agents.has('chief')) {
                progress.report({ message: 'ビオラ（メイド長）を起動中...' });
                const chief = this.createAgent('ビオラ', 'chief', 'chiefMaid', '👑');
                chief.terminal.show();
                await this.launchClaudeWithRole('chief', 'chiefMaid');
                currentAgent++;
                progress.report({ increment: (100 / totalAgents) });
            }

            let maidsToStart: typeof availableMaids;
            if (random) {
                const shuffled = [...availableMaids].sort(() => Math.random() - 0.5);
                maidsToStart = shuffled.slice(0, count);
            } else {
                maidsToStart = availableMaids.slice(0, count);
            }

            for (const maid of maidsToStart) {
                progress.report({ message: `${maid.name}（メイド）を起動中...` });
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
                currentAgent++;
                progress.report({ increment: (100 / totalAgents) });
            }

            const maidNames = maidsToStart.map(m => m.name).join('、');
            vscode.window.showInformationMessage(`🎩 執事 + 👑 メイド長 + 🎀 ${maidNames} を起動しました！`);
            this.updateDashboard();
        });
    }

    async startAllAgents(): Promise<void> {
        await this.startButler();
        await this.startChiefMaid();
        // 全メイドを設定順に起動
        const orderedMaids = getOrderedMaids();
        for (const maid of orderedMaids) {
            if (!this.agents.has(maid.id)) {
                this.createAgent(maid.name, maid.id, 'maid', maid.emoji);
                await this.launchClaudeWithRole(maid.id, 'maid', maid.name);
            }
        }
        this.updateDashboard();
    }

    private async ensureInitialized(): Promise<boolean> {
        if (!this.maidAgentPath || !fs.existsSync(this.maidAgentPath)) {
            const choice = await vscode.window.showWarningMessage(
                'Maid Agent が初期化されていません。初期化しますか？',
                '初期化する', 'キャンセル'
            );
            if (choice === '初期化する') {
                return await this.initializeWorkspace();
            }
            return false;
        }
        return true;
    }

    // =========================================================================
    // タスク送信（YAMLキュー経由）
    // =========================================================================

    async sendTaskToButler(taskDescription: string): Promise<void> {
        const butler = this.agents.get('butler');
        if (!butler) {
            vscode.window.showWarningMessage('執事がおりません。先に起動してください。');
            return;
        }

        if (!this.maidAgentPath) return;

        this.log(`[タスク] ご主人様からの指令: ${taskDescription}`);

        // 執事にタスクを直接送信（2段階送信）
        // 執事がタスクを分解し、butler_to_chief.yaml に書き込む
        const instruction = `ご主人様からの指令です: ${taskDescription}\n\nこのタスクを分析し、必要に応じてサブタスクに分解して .maid-agent/queue/butler_to_chief.yaml に記載し、メイド長に通知してください。`;
        await this.sendMessageToAgent('butler', instruction);

        vscode.window.showInformationMessage('🎩 執事にタスクを送信しました');
        this.updateDashboard();
    }

    /**
     * 執事からメイド長への通知（butler.md の指示に従って実行される）
     * 執事のClaudeが内部的に使用するためのヘルパー
     */
    async notifyChief(message: string): Promise<void> {
        const chief = this.agents.get('chief');
        if (!chief) {
            this.log('[WARN] メイド長がおりません');
            return;
        }
        await this.sendMessageToAgent('chief', message);
    }

    /**
     * メイド長からメイドへの通知（chief.md の指示に従って実行される）
     * メイド長のClaudeが内部的に使用するためのヘルパー
     */
    async notifyMaid(maidId: string, message: string): Promise<void> {
        const maid = this.agents.get(maidId);
        if (!maid) {
            this.log(`[WARN] メイド ${maidId} がおりません`);
            return;
        }
        await this.sendMessageToAgent(maidId, message);
    }

    // =========================================================================
    // Claude Code 起動（手動用 - 通常は自動起動）
    // =========================================================================

    startClaudeOnAgent(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (!agent) return;

        // Claude Code を権限スキップモードで起動
        this.sendToAgent(agentId, 'claude --dangerously-skip-permissions');
    }

    async startClaudeOnAllAgents(): Promise<void> {
        let count = 0;
        for (const [id, agent] of this.agents) {
            this.sendToAgent(id, 'claude --dangerously-skip-permissions');
            await this.delay(500); // 各エージェント間で少し待つ
            count++;
        }

        if (count > 0) {
            vscode.window.showInformationMessage(`🤖 ${count}人のエージェントがClaude Codeを起動しました`);
        }
    }

    // =========================================================================
    // ステータス管理
    // =========================================================================

    private updateMasterStatus(agentId: string, status: string): void {
        if (!this.maidAgentPath) return;

        const statusPath = path.join(this.maidAgentPath, 'status', 'master_status.yaml');
        if (!fs.existsSync(statusPath)) return;

        try {
            let content = fs.readFileSync(statusPath, 'utf-8');
            const timestamp = new Date().toISOString();

            // 簡易的な更新（実際にはYAMLパーサーを使うべき）
            content = content.replace(/last_updated: .*/, `last_updated: "${timestamp}"`);

            fs.writeFileSync(statusPath, content);
        } catch (error) {
            this.log(`[WARN] ステータス更新に失敗: ${error}`);
        }
    }

    // =========================================================================
    // ファイル監視
    // =========================================================================

    startWatchingFiles(): void {
        if (!this.maidAgentPath) return;

        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }

        // dashboard.md を監視
        const pattern = new vscode.RelativePattern(
            this.maidAgentPath,
            '{dashboard.md,queue/*.yaml,reports/*.md}'
        );

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidChange((uri) => {
            this.log(`[ファイル変更] ${path.basename(uri.fsPath)}`);
            this.updateDashboard();
        });

        this.context?.subscriptions.push(this.fileWatcher);
        this.log('[ファイル監視] 開始');
        vscode.window.showInformationMessage('📁 ファイル監視を開始しました');
    }

    stopWatchingFiles(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
            this.log('[ファイル監視] 停止');
            vscode.window.showInformationMessage('📁 ファイル監視を停止しました');
        }
    }

    // =========================================================================
    // ダッシュボード
    // =========================================================================

    showDashboard(): void {
        if (this.dashboardPanel) {
            this.dashboardPanel.reveal();
            this.updateDashboard();
            return;
        }

        this.dashboardPanel = vscode.window.createWebviewPanel(
            'multiAgentDashboard',
            '🎩 Maid Agent Dashboard',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        this.dashboardPanel.onDidDispose(() => {
            this.dashboardPanel = undefined;
        });

        this.dashboardPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this.updateDashboard();
                        break;
                    case 'sendTask':
                        this.promptAndSendToButler();
                        break;
                    case 'openFile':
                        this.openMaidAgentFile(message.file);
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        this.updateDashboard();
    }

    private async openMaidAgentFile(filename: string): Promise<void> {
        if (!this.maidAgentPath) return;
        const filePath = path.join(this.maidAgentPath, filename);
        if (fs.existsSync(filePath)) {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
        }
    }

    private updateDashboard(): void {
        if (!this.dashboardPanel) return;

        const butler = this.agents.get('butler');
        const chief = this.agents.get('chief');
        const maids = MAIDS.map(m => this.agents.get(m.id)).filter(Boolean) as Agent[];

        // dashboard.md の内容を読み込む
        let dashboardContent = '';
        if (this.maidAgentPath) {
            const dashboardPath = path.join(this.maidAgentPath, 'dashboard.md');
            if (fs.existsSync(dashboardPath)) {
                dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
            }
        }

        const renderAgent = (a: Agent, emoji: string, role: string) => {
            const statusEmoji = a.status === 'working' ? '⚡' : a.status === 'done' ? '✅' : '💤';
            const statusClass = a.status === 'working' ? 'working' : 'idle';
            return `
                <div class="agent-card ${statusClass}">
                    <div class="agent-header">
                        <span class="agent-name">${emoji} ${a.name}</span>
                        <span class="agent-role">${role}</span>
                    </div>
                    <div class="agent-status">
                        <span class="status-badge">${statusEmoji} ${a.status}</span>
                    </div>
                </div>`;
        };

        const butlerHtml = butler ? renderAgent(butler, '🎩', '統括') : '<div class="empty-agent">執事がおりません</div>';
        const chiefHtml = chief ? renderAgent(chief, '👑', '配分担当') : '<div class="empty-agent">メイド長がおりません</div>';
        const maidsHtml = maids.length > 0
            ? maids.map(m => renderAgent(m, '🎀', '実行担当')).join('')
            : '<div class="empty-agent">メイドがおりません</div>';

        const recentLogs = this.logs.slice(-10).reverse().map(log =>
            `<div class="log-entry">${log}</div>`
        ).join('');

        this.dashboardPanel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
        }
        h1 { color: #e94560; margin-bottom: 5px; }
        h2 { color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 5px; margin-top: 0; font-size: 1.1em; }
        .subtitle { color: #888; margin-bottom: 20px; }

        .action-bar { display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap; }
        .action-btn {
            background: #e94560; color: white; border: none;
            padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.85em;
        }
        .action-btn:hover { background: #d63050; }
        .action-btn.secondary { background: rgba(255,255,255,0.2); }

        .hierarchy { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 20px 0; }
        .hierarchy-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .hierarchy-arrow { color: #e94560; font-size: 1.2em; }

        .agent-card {
            background: rgba(255,255,255,0.1); border-radius: 8px;
            padding: 10px; min-width: 120px; border: 1px solid rgba(255,255,255,0.2);
            font-size: 0.9em;
        }
        .agent-card.working { border-color: #ffc107; background: rgba(255,193,7,0.1); }
        .agent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        .agent-name { font-weight: bold; }
        .agent-role { font-size: 0.7em; color: #888; background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 5px; }
        .status-badge { font-size: 0.75em; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.15); }
        .empty-agent { color: #666; font-style: italic; padding: 15px; }

        .section { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 15px; margin: 15px 0; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }

        .file-links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .file-link {
            background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 5px;
            cursor: pointer; font-size: 0.8em;
        }
        .file-link:hover { background: rgba(255,255,255,0.2); }

        .dashboard-content {
            background: #0a0a0a; border-radius: 8px; padding: 15px;
            font-family: 'Consolas', monospace; font-size: 0.8em;
            white-space: pre-wrap; max-height: 200px; overflow-y: auto;
        }

        .log-container {
            background: #0a0a0a; border-radius: 8px; padding: 10px;
            max-height: 150px; overflow-y: auto;
        }
        .log-entry {
            font-family: 'Consolas', monospace; font-size: 0.75em;
            color: #0f0; padding: 2px 5px; border-bottom: 1px solid #222;
        }

        @media (max-width: 600px) { .two-column { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <h1>🎩 Maid Agent Controller</h1>
    <p class="subtitle">執事 → メイド長 → メイド の階層構造（multi-agent-shogun準拠）</p>

    <div class="action-bar">
        <button class="action-btn" onclick="sendTask()">📝 執事に指令</button>
        <button class="action-btn secondary" onclick="refresh()">🔄 更新</button>
        <button class="action-btn secondary" onclick="openFile('dashboard.md')">📊 dashboard.md</button>
        <button class="action-btn secondary" onclick="openFile('queue/butler_to_chief.yaml')">📋 Queue</button>
    </div>

    <div class="section">
        <h2>📊 階層構造</h2>
        <div class="hierarchy">
            <div class="hierarchy-row">${butlerHtml}</div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">${chiefHtml}</div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">${maidsHtml}</div>
        </div>
    </div>

    <div class="two-column">
        <div class="section">
            <h2>📊 Dashboard.md</h2>
            <div class="dashboard-content">${dashboardContent || '(未読み込み)'}</div>
        </div>
        <div class="section">
            <h2>📜 ログ</h2>
            <div class="log-container">
                ${recentLogs || '<div class="log-entry">ログはございません</div>'}
            </div>
        </div>
    </div>

    <div class="section">
        <h2>📁 設定ファイル</h2>
        <div class="file-links">
            <span class="file-link" onclick="openFile('CLAUDE.md')">CLAUDE.md</span>
            <span class="file-link" onclick="openFile('instructions/butler.md')">butler.md</span>
            <span class="file-link" onclick="openFile('instructions/chief.md')">chief.md</span>
            <span class="file-link" onclick="openFile('instructions/maid.md')">maid.md</span>
            <span class="file-link" onclick="openFile('config/settings.yaml')">settings.yaml</span>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function refresh() { vscode.postMessage({ command: 'refresh' }); }
        function sendTask() { vscode.postMessage({ command: 'sendTask' }); }
        function openFile(file) { vscode.postMessage({ command: 'openFile', file: file }); }
    </script>
</body>
</html>`;
    }

    // =========================================================================
    // ログ
    // =========================================================================

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logMessage);
        this.logs.push(logMessage);
        if (this.logs.length > 100) {
            this.logs.shift();
        }
    }

    // =========================================================================
    // ユーザー入力
    // =========================================================================

    async promptAndSendToButler(): Promise<void> {
        const command = await vscode.window.showInputBox({
            prompt: '執事への指令を入力してください、ご主人様',
            placeHolder: '例: このプロジェクトを分析して改善点を洗い出してください'
        });

        if (command) {
            await this.sendTaskToButler(command);
        }
    }

    async promptAndSendToMaid(): Promise<void> {
        const orderedMaids = getOrderedMaids();
        const maidOptions = orderedMaids
            .filter(m => this.agents.has(m.id))
            .map(m => ({ label: `${m.emoji} ${m.name}`, id: m.id }));

        if (maidOptions.length === 0) {
            vscode.window.showWarningMessage('メイドがまだおりません。先に起動してください。');
            return;
        }

        const selected = await vscode.window.showQuickPick(maidOptions, {
            placeHolder: '指示を送るメイドを選んでください'
        });

        if (!selected) return;

        const command = await vscode.window.showInputBox({
            prompt: `${selected.label}への指示を入力してください`,
            placeHolder: '例: このファイルをレビューしてください'
        });

        if (command) {
            // 2段階送信でメイドに指示
            await this.sendMessageToAgent(selected.id, command);
        }
    }

    // =========================================================================
    // クリーンアップ
    // =========================================================================

    /**
     * ターミナルが閉じられた時の処理
     */
    handleTerminalClosed(terminal: vscode.Terminal): void {
        for (const [id, agent] of this.agents) {
            if (agent.terminal === terminal) {
                this.log(`[${agent.name}] ターミナルが閉じられました`);
                this.agents.delete(id);
                this.updateAgentPanel();
                this.updateDashboard();
                return;
            }
        }
    }

    dispose(): void {
        this.agents.forEach(agent => agent.terminal.dispose());
        this.outputChannel.dispose();
        this.dashboardPanel?.dispose();
        this.fileWatcher?.dispose();
    }
}

// =============================================================================
// 拡張機能のエントリーポイント
// =============================================================================

let controller: MultiAgentController;

export function activate(context: vscode.ExtensionContext) {
    controller = new MultiAgentController();
    controller.setContext(context);

    // エージェントパネル（サイドバー）を登録
    const agentPanelProvider = new AgentPanelProvider(context.extensionUri);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    agentPanelProvider.setWorkspaceRoot(workspaceRoot);
    controller.setAgentPanelProvider(agentPanelProvider);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            AgentPanelProvider.viewType,
            agentPanelProvider
        )
    );

    // ターミナル切り替え時にパネルを更新
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            controller.setCurrentAgentFromTerminal(terminal);
        })
    );

    // ターミナル終了時にエージェントを削除
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            controller.handleTerminalClosed(terminal);
        })
    );

    const commands = [
        vscode.commands.registerCommand('multiAgent.initialize', () => {
            controller.initializeWorkspace();
        }),
        vscode.commands.registerCommand('multiAgent.startButler', () => {
            controller.startButler();
        }),
        vscode.commands.registerCommand('multiAgent.startChiefMaid', () => {
            controller.startChiefMaid();
        }),
        vscode.commands.registerCommand('multiAgent.startAgents', () => {
            controller.startButler();
            controller.startChiefMaid();
        }),
        vscode.commands.registerCommand('multiAgent.startSelectedMaids', () => {
            controller.startSelectedMaids();
        }),
        vscode.commands.registerCommand('multiAgent.startMaidsByCount', () => {
            controller.startMaidsByCount();
        }),
        vscode.commands.registerCommand('multiAgent.startMaidsByCountRandom', () => {
            controller.startMaidsByCountRandom();
        }),
        vscode.commands.registerCommand('multiAgent.startAll', () => {
            controller.startAllAgents();
        }),
        vscode.commands.registerCommand('multiAgent.startAllByCount', () => {
            controller.startAllByCount();
        }),
        vscode.commands.registerCommand('multiAgent.startAllByCountRandom', () => {
            controller.startAllByCountRandom();
        }),
        vscode.commands.registerCommand('multiAgent.sendToButler', () => {
            controller.promptAndSendToButler();
        }),
        vscode.commands.registerCommand('multiAgent.sendToMaid', () => {
            controller.promptAndSendToMaid();
        }),
        vscode.commands.registerCommand('multiAgent.startClaude', () => {
            controller.startClaudeOnAllAgents();
        }),
        vscode.commands.registerCommand('multiAgent.showDashboard', () => {
            controller.showDashboard();
        }),
        vscode.commands.registerCommand('multiAgent.watchFiles', () => {
            controller.startWatchingFiles();
        }),
        vscode.commands.registerCommand('multiAgent.stopWatchFiles', () => {
            controller.stopWatchingFiles();
        }),
    ];

    context.subscriptions.push(...commands);

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '🎩 Maid Agent';
    statusBarItem.command = 'multiAgent.showDashboard';
    statusBarItem.tooltip = 'クリックでダッシュボードを表示';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {
    controller?.dispose();
}
