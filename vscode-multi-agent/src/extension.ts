import * as vscode from 'vscode';

// エージェントのターミナル管理
interface Agent {
    name: string;
    terminal: vscode.Terminal;
    role: 'shogun' | 'karo' | 'ashigaru';
}

class MultiAgentController {
    private agents: Map<string, Agent> = new Map();
    private outputChannel: vscode.OutputChannel;
    private dashboardPanel: vscode.WebviewPanel | undefined;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Multi Agent');
    }

    // エージェント（ターミナル）を作成
    createAgent(name: string, role: Agent['role']): Agent {
        const terminal = vscode.window.createTerminal({
            name: `🏯 ${name}`,
        });

        const agent: Agent = { name, terminal, role };
        this.agents.set(name, agent);

        this.log(`[${name}] 参上いたしました！`);
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
        this.log(`[${agentName}] 受信: ${command}`);

        this.updateDashboard();
        return true;
    }

    // 将軍と家老を起動
    startShogunAndKaro(): void {
        const shogun = this.createAgent('将軍(Shogun)', 'shogun');
        shogun.terminal.show();

        const karo = this.createAgent('家老(Karo)', 'karo');

        this.sendToAgent('将軍(Shogun)', 'echo "将軍、出陣準備完了でござる"');
        this.sendToAgent('家老(Karo)', 'echo "家老、参上いたしました"');

        vscode.window.showInformationMessage('🏯 将軍と家老が参上しました！');
    }

    // ダッシュボード表示
    showDashboard(): void {
        if (this.dashboardPanel) {
            this.dashboardPanel.reveal();
            return;
        }

        this.dashboardPanel = vscode.window.createWebviewPanel(
            'multiAgentDashboard',
            '🏯 Multi Agent Dashboard',
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

        const agentList = Array.from(this.agents.values())
            .map(a => `<li>🎌 ${a.name} (${a.role})</li>`)
            .join('');

        this.dashboardPanel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: sans-serif;
            padding: 20px;
            background: #1a1a2e;
            color: #eee;
        }
        h1 { color: #e94560; }
        .agent-list { list-style: none; padding: 0; }
        .agent-list li {
            padding: 10px;
            margin: 5px 0;
            background: #16213e;
            border-radius: 5px;
        }
        .status {
            padding: 15px;
            background: #0f3460;
            border-radius: 5px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <h1>🏯 Multi Agent Controller</h1>
    <h2>参陣中のエージェント</h2>
    <ul class="agent-list">
        ${agentList || '<li>まだ誰も参上しておりません</li>'}
    </ul>
    <div class="status">
        <strong>状態:</strong> 待機中
    </div>
</body>
</html>`;
    }

    private log(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    async promptAndSendToKaro(): Promise<void> {
        const command = await vscode.window.showInputBox({
            prompt: '家老に送る指令を入力',
            placeHolder: '例: claude "このプロジェクトを分析せよ"'
        });

        if (command) {
            this.sendToAgent('家老(Karo)', command);
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

    const startCmd = vscode.commands.registerCommand('multiAgent.startAgents', () => {
        controller.startShogunAndKaro();
    });

    const sendCmd = vscode.commands.registerCommand('multiAgent.sendToKaro', () => {
        controller.promptAndSendToKaro();
    });

    const dashCmd = vscode.commands.registerCommand('multiAgent.showDashboard', () => {
        controller.showDashboard();
    });

    context.subscriptions.push(startCmd, sendCmd, dashCmd);
}

export function deactivate() {
    controller?.dispose();
}
