import * as vscode from 'vscode';

// エージェントのターミナル管理
interface Agent {
    name: string;
    terminal: vscode.Terminal;
    role: 'headMaid' | 'chiefMaid' | 'maid';
    status: 'idle' | 'working' | 'done';
}

// メイドの名前リスト
const MAID_NAMES = [
    'エマ', 'ソフィア', 'リリー', 'ローズ',
    'アリス', 'メイ', 'フローラ', 'ルナ'
];

class MultiAgentController {
    private agents: Map<string, Agent> = new Map();
    private outputChannel: vscode.OutputChannel;
    private dashboardPanel: vscode.WebviewPanel | undefined;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Maid Agent');
    }

    // エージェント（ターミナル）を作成
    createAgent(name: string, role: Agent['role'], emoji: string): Agent {
        const terminal = vscode.window.createTerminal({
            name: `${emoji} ${name}`,
        });

        const agent: Agent = { name, terminal, role, status: 'idle' };
        this.agents.set(name, agent);

        this.log(`[${name}] お仕えする準備ができました、ご主人様♪`);
        return agent;
    }

    // 指定したエージェントにコマンドを送信
    sendToAgent(agentName: string, command: string): boolean {
        const agent = this.agents.get(agentName);
        if (!agent) {
            this.log(`[ERROR] ${agentName} が見つかりません`);
            return false;
        }

        // これがtmux send-keys相当
        agent.terminal.sendText(command);
        agent.status = 'working';
        this.log(`[${agentName}] 承りました: ${command}`);

        this.updateDashboard();
        return true;
    }

    // 全エージェントにコマンドを送信
    broadcastToMaids(command: string): void {
        this.agents.forEach((agent, name) => {
            if (agent.role === 'maid') {
                this.sendToAgent(name, command);
            }
        });
    }

    // ヘッドメイドとチーフメイドを起動
    startHeadAndChief(): void {
        const head = this.createAgent('ヘッドメイド', 'headMaid', '🎀');
        head.terminal.show();

        const chief = this.createAgent('チーフメイド', 'chiefMaid', '💼');

        this.sendToAgent('ヘッドメイド', 'echo "ヘッドメイド、準備完了でございます♪"');
        this.sendToAgent('チーフメイド', 'echo "チーフメイド、参上いたしました♪"');

        vscode.window.showInformationMessage('🎀 ヘッドメイドとチーフメイドがお仕えする準備ができました！');
    }

    // メイド8人を起動
    startMaids(): void {
        for (let i = 0; i < 8; i++) {
            const name = `メイド${i + 1}(${MAID_NAMES[i]})`;
            const maid = this.createAgent(name, 'maid', '👒');
            this.sendToAgent(name, `echo "メイド${i + 1}の${MAID_NAMES[i]}、お仕えいたします♪"`);
        }

        vscode.window.showInformationMessage('👒 メイド8人がお仕えする準備ができました！');
        this.updateDashboard();
    }

    // 全員起動（ヘッドメイド + チーフメイド + メイド8人）
    startAllAgents(): void {
        this.startHeadAndChief();
        this.startMaids();
    }

    // Claude Codeを起動
    startClaudeOnAgent(agentName: string): void {
        this.sendToAgent(agentName, 'claude');
    }

    // 全メイドでClaude Code起動
    startClaudeOnAllMaids(): void {
        this.agents.forEach((agent, name) => {
            if (agent.role === 'maid') {
                this.startClaudeOnAgent(name);
            }
        });
        vscode.window.showInformationMessage('🤖 全メイドがClaude Codeを起動しました！');
    }

    // ダッシュボード表示
    showDashboard(): void {
        if (this.dashboardPanel) {
            this.dashboardPanel.reveal();
            return;
        }

        this.dashboardPanel = vscode.window.createWebviewPanel(
            'multiAgentDashboard',
            '🎀 Maid Agent Dashboard',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        this.dashboardPanel.onDidDispose(() => {
            this.dashboardPanel = undefined;
        });

        this.updateDashboard();
    }

    private updateDashboard(): void {
        if (!this.dashboardPanel) return;

        const headMaids = Array.from(this.agents.values()).filter(a => a.role === 'headMaid');
        const chiefMaids = Array.from(this.agents.values()).filter(a => a.role === 'chiefMaid');
        const maids = Array.from(this.agents.values()).filter(a => a.role === 'maid');

        const renderAgent = (a: Agent, emoji: string) => {
            const statusEmoji = a.status === 'working' ? '⚡' : a.status === 'done' ? '✅' : '💤';
            return `<li>${emoji} ${a.name} <span class="status-badge">${statusEmoji} ${a.status}</span></li>`;
        };

        const headList = headMaids.map(a => renderAgent(a, '🎀')).join('');
        const chiefList = chiefMaids.map(a => renderAgent(a, '💼')).join('');
        const maidList = maids.map(a => renderAgent(a, '👒')).join('');

        this.dashboardPanel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: 'Segoe UI', sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            color: #4a4a4a;
            min-height: 100vh;
        }
        h1 {
            color: #d63384;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        h2 {
            color: #6f42c1;
            border-bottom: 2px dashed #d63384;
            padding-bottom: 5px;
        }
        .agent-list {
            list-style: none;
            padding: 0;
        }
        .agent-list li {
            padding: 12px 15px;
            margin: 8px 0;
            background: rgba(255,255,255,0.9);
            border-radius: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .status-badge {
            font-size: 0.85em;
            padding: 3px 8px;
            border-radius: 12px;
            background: #e9ecef;
        }
        .section {
            background: rgba(255,255,255,0.7);
            border-radius: 15px;
            padding: 15px;
            margin: 15px 0;
        }
        .maid-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }
        .maid-grid li {
            margin: 0;
        }
        .empty {
            color: #888;
            font-style: italic;
        }
        .stats {
            display: flex;
            gap: 20px;
            margin-top: 20px;
        }
        .stat-card {
            flex: 1;
            background: white;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #d63384;
        }
    </style>
</head>
<body>
    <h1>🎀 Maid Agent Controller</h1>

    <div class="section">
        <h2>👑 管理メイド</h2>
        <ul class="agent-list">
            ${headList || '<li class="empty">ヘッドメイドがおりません</li>'}
            ${chiefList || ''}
        </ul>
    </div>

    <div class="section">
        <h2>👒 メイド隊</h2>
        <ul class="agent-list maid-grid">
            ${maidList || '<li class="empty">メイドがおりません</li>'}
        </ul>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">${this.agents.size}</div>
            <div>総メイド数</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${Array.from(this.agents.values()).filter(a => a.status === 'working').length}</div>
            <div>稼働中</div>
        </div>
    </div>
</body>
</html>`;
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    async promptAndSendToChief(): Promise<void> {
        const command = await vscode.window.showInputBox({
            prompt: 'チーフメイドへの指示を入力してください、ご主人様',
            placeHolder: '例: claude "このプロジェクトを分析してください"'
        });

        if (command) {
            this.sendToAgent('チーフメイド', command);
        }
    }

    async promptAndSendToMaid(): Promise<void> {
        const maidNames = Array.from(this.agents.entries())
            .filter(([_, a]) => a.role === 'maid')
            .map(([name, _]) => name);

        if (maidNames.length === 0) {
            vscode.window.showWarningMessage('メイドがまだおりません。先に起動してください。');
            return;
        }

        const selectedMaid = await vscode.window.showQuickPick(maidNames, {
            placeHolder: '指示を送るメイドを選んでください'
        });

        if (!selectedMaid) return;

        const command = await vscode.window.showInputBox({
            prompt: `${selectedMaid}への指示を入力してください`,
            placeHolder: '例: claude "このファイルをレビューしてください"'
        });

        if (command) {
            this.sendToAgent(selectedMaid, command);
        }
    }

    dispose(): void {
        this.agents.forEach(agent => agent.terminal.dispose());
        this.outputChannel.dispose();
        this.dashboardPanel?.dispose();
    }
}

let controller: MultiAgentController;

export function activate(context: vscode.ExtensionContext) {
    controller = new MultiAgentController();

    // ヘッドメイド＆チーフメイド起動
    const startCmd = vscode.commands.registerCommand('multiAgent.startAgents', () => {
        controller.startHeadAndChief();
    });

    // メイド8人起動
    const startMaidsCmd = vscode.commands.registerCommand('multiAgent.startMaids', () => {
        controller.startMaids();
    });

    // 全員起動
    const startAllCmd = vscode.commands.registerCommand('multiAgent.startAll', () => {
        controller.startAllAgents();
    });

    // チーフメイドに指示
    const sendToChiefCmd = vscode.commands.registerCommand('multiAgent.sendToChief', () => {
        controller.promptAndSendToChief();
    });

    // メイドに指示
    const sendToMaidCmd = vscode.commands.registerCommand('multiAgent.sendToMaid', () => {
        controller.promptAndSendToMaid();
    });

    // 全メイドでClaude起動
    const startClaudeCmd = vscode.commands.registerCommand('multiAgent.startClaude', () => {
        controller.startClaudeOnAllMaids();
    });

    // ダッシュボード表示
    const dashCmd = vscode.commands.registerCommand('multiAgent.showDashboard', () => {
        controller.showDashboard();
    });

    context.subscriptions.push(
        startCmd, startMaidsCmd, startAllCmd,
        sendToChiefCmd, sendToMaidCmd, startClaudeCmd, dashCmd
    );
}

export function deactivate() {
    controller?.dispose();
}
