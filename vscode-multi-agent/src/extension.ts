import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

interface Agent {
    name: string;
    terminal: vscode.Terminal;
    role: 'headMaid' | 'chiefMaid' | 'maid';
    status: 'idle' | 'working' | 'done';
    currentTask?: Task;
    completedTasks: number;
}

interface Task {
    id: string;
    description: string;
    assignedTo?: string;
    status: 'pending' | 'assigned' | 'working' | 'completed';
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
}

interface TaskFile {
    tasks: TaskDefinition[];
}

interface TaskDefinition {
    id: string;
    description: string;
    prompt: string;
    assignTo?: string; // 特定のメイドに割り当て（省略時は自動割り当て）
}

// =============================================================================
// 定数
// =============================================================================

const MAID_NAMES = [
    'エマ', 'ソフィア', 'リリー', 'ローズ',
    'アリス', 'メイ', 'フローラ', 'ルナ'
];

// メイド口調のシステムプロンプト
const MAID_SYSTEM_PROMPT = `あなたは優秀なメイドです。ご主人様のコーディング作業をお手伝いします。
以下のルールに従ってください：
- 丁寧な言葉遣いで応答してください（〜でございます、〜いたします）
- 作業の開始時は「かしこまりました、ご主人様♪」と応答
- 作業の完了時は「お仕事完了でございます♪」と報告
- エラーがあった場合は「申し訳ございません、問題が発生いたしました」と報告
- 常にご主人様のお役に立てるよう最善を尽くしてください`;

const TASK_FILE_NAME = 'maid-tasks.yaml';

// =============================================================================
// シンプルなYAMLパーサー（タスク用）
// =============================================================================

function parseSimpleYaml(content: string): TaskFile {
    const tasks: TaskDefinition[] = [];
    const lines = content.split('\n');
    let currentTask: Partial<TaskDefinition> | null = null;
    let inPrompt = false;
    let promptLines: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('- id:')) {
            if (currentTask && currentTask.id) {
                if (promptLines.length > 0) {
                    currentTask.prompt = promptLines.join('\n').trim();
                }
                tasks.push(currentTask as TaskDefinition);
            }
            currentTask = { id: trimmed.substring(5).trim() };
            inPrompt = false;
            promptLines = [];
        } else if (currentTask) {
            if (trimmed.startsWith('description:')) {
                currentTask.description = trimmed.substring(12).trim().replace(/^["']|["']$/g, '');
            } else if (trimmed.startsWith('assignTo:')) {
                currentTask.assignTo = trimmed.substring(9).trim();
            } else if (trimmed.startsWith('prompt:')) {
                const promptStart = trimmed.substring(7).trim();
                if (promptStart === '|' || promptStart === '>') {
                    inPrompt = true;
                } else {
                    currentTask.prompt = promptStart.replace(/^["']|["']$/g, '');
                }
            } else if (inPrompt && (line.startsWith('    ') || line.startsWith('\t'))) {
                promptLines.push(line.trim());
            } else if (inPrompt && trimmed && !trimmed.startsWith('-')) {
                promptLines.push(trimmed);
            }
        }
    }

    // 最後のタスクを追加
    if (currentTask && currentTask.id) {
        if (promptLines.length > 0) {
            currentTask.prompt = promptLines.join('\n').trim();
        }
        tasks.push(currentTask as TaskDefinition);
    }

    return { tasks };
}

// =============================================================================
// メインコントローラー
// =============================================================================

class MultiAgentController {
    private agents: Map<string, Agent> = new Map();
    private outputChannel: vscode.OutputChannel;
    private dashboardPanel: vscode.WebviewPanel | undefined;
    private taskQueue: Task[] = [];
    private completedTasks: Task[] = [];
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private logs: string[] = [];
    private context: vscode.ExtensionContext | undefined;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Maid Agent');
    }

    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    // =========================================================================
    // エージェント管理
    // =========================================================================

    createAgent(name: string, role: Agent['role'], emoji: string): Agent {
        const terminal = vscode.window.createTerminal({
            name: `${emoji} ${name}`,
        });

        const agent: Agent = {
            name,
            terminal,
            role,
            status: 'idle',
            completedTasks: 0
        };
        this.agents.set(name, agent);

        this.log(`[${name}] お仕えする準備ができました、ご主人様♪`);
        return agent;
    }

    sendToAgent(agentName: string, command: string): boolean {
        const agent = this.agents.get(agentName);
        if (!agent) {
            this.log(`[ERROR] ${agentName} が見つかりません`);
            return false;
        }

        agent.terminal.sendText(command);
        agent.status = 'working';
        this.log(`[${agentName}] 承りました: ${command.substring(0, 50)}...`);

        this.updateDashboard();
        return true;
    }

    // メイド口調プロンプト付きでClaudeを起動
    startClaudeWithMaidPrompt(agentName: string, task?: string): void {
        const prompt = task
            ? `claude --system-prompt "${MAID_SYSTEM_PROMPT}" "${task}"`
            : `claude --system-prompt "${MAID_SYSTEM_PROMPT}"`;
        this.sendToAgent(agentName, prompt);
    }

    broadcastToMaids(command: string): void {
        this.agents.forEach((agent, name) => {
            if (agent.role === 'maid') {
                this.sendToAgent(name, command);
            }
        });
    }

    startHeadAndChief(): void {
        if (this.agents.has('ヘッドメイド')) {
            vscode.window.showWarningMessage('ヘッドメイドは既にお仕えしております');
            return;
        }

        const head = this.createAgent('ヘッドメイド', 'headMaid', '🎀');
        head.terminal.show();

        const chief = this.createAgent('チーフメイド', 'chiefMaid', '💼');

        this.sendToAgent('ヘッドメイド', 'echo "🎀 ヘッドメイド、準備完了でございます♪"');
        this.sendToAgent('チーフメイド', 'echo "💼 チーフメイド、参上いたしました♪"');

        vscode.window.showInformationMessage('🎀 ヘッドメイドとチーフメイドがお仕えする準備ができました！');
        this.updateDashboard();
    }

    startMaids(): void {
        let startedCount = 0;
        for (let i = 0; i < 8; i++) {
            const name = `メイド${i + 1}(${MAID_NAMES[i]})`;
            if (!this.agents.has(name)) {
                this.createAgent(name, 'maid', '👒');
                this.sendToAgent(name, `echo "👒 メイド${i + 1}の${MAID_NAMES[i]}、お仕えいたします♪"`);
                startedCount++;
            }
        }

        if (startedCount > 0) {
            vscode.window.showInformationMessage(`👒 メイド${startedCount}人がお仕えする準備ができました！`);
        } else {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
        }
        this.updateDashboard();
    }

    startAllAgents(): void {
        this.startHeadAndChief();
        this.startMaids();
    }

    startClaudeOnAgent(agentName: string): void {
        this.sendToAgent(agentName, 'claude');
    }

    startClaudeOnAllMaids(): void {
        let count = 0;
        this.agents.forEach((agent, name) => {
            if (agent.role === 'maid') {
                this.startClaudeOnAgent(name);
                count++;
            }
        });
        if (count > 0) {
            vscode.window.showInformationMessage(`🤖 ${count}人のメイドがClaude Codeを起動しました！`);
        }
    }

    // =========================================================================
    // タスク管理
    // =========================================================================

    addTask(task: TaskDefinition): Task {
        const newTask: Task = {
            id: task.id,
            description: task.description,
            status: 'pending',
            createdAt: new Date()
        };
        this.taskQueue.push(newTask);
        this.log(`[タスク追加] ${task.id}: ${task.description}`);
        this.updateDashboard();
        return newTask;
    }

    assignTaskToMaid(taskId: string, maidName?: string): boolean {
        const task = this.taskQueue.find(t => t.id === taskId && t.status === 'pending');
        if (!task) {
            this.log(`[ERROR] タスク ${taskId} が見つからないか、既に割り当て済みです`);
            return false;
        }

        // メイドを選択（指定がなければアイドル状態のメイドを探す）
        let targetMaid: Agent | undefined;
        if (maidName) {
            targetMaid = this.agents.get(maidName);
        } else {
            // アイドル状態のメイドを探す
            for (const [name, agent] of this.agents) {
                if (agent.role === 'maid' && agent.status === 'idle') {
                    targetMaid = agent;
                    break;
                }
            }
        }

        if (!targetMaid) {
            this.log(`[WARN] 利用可能なメイドがおりません`);
            return false;
        }

        task.assignedTo = targetMaid.name;
        task.status = 'assigned';
        targetMaid.currentTask = task;

        this.log(`[タスク割り当て] ${task.id} → ${targetMaid.name}`);
        this.updateDashboard();
        return true;
    }

    // 自動タスク配信
    async distributeTasksAutomatically(taskDefs: TaskDefinition[]): Promise<void> {
        for (const taskDef of taskDefs) {
            const task = this.addTask(taskDef);

            // メイドに割り当て
            const assigned = this.assignTaskToMaid(task.id, taskDef.assignTo);

            if (assigned) {
                const agent = this.agents.get(task.assignedTo!);
                if (agent) {
                    // Claudeにタスクを送信
                    const claudeCommand = `claude "${taskDef.prompt}"`;
                    this.sendToAgent(agent.name, claudeCommand);
                    task.status = 'working';
                    task.startedAt = new Date();
                    agent.status = 'working';
                }
            }

            // 少し間隔を空ける
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.updateDashboard();
        vscode.window.showInformationMessage(`📋 ${taskDefs.length}件のタスクを配信しました！`);
    }

    markTaskComplete(agentName: string): void {
        const agent = this.agents.get(agentName);
        if (!agent || !agent.currentTask) return;

        const task = agent.currentTask;
        task.status = 'completed';
        task.completedAt = new Date();

        // タスクキューから完了リストへ移動
        const idx = this.taskQueue.findIndex(t => t.id === task.id);
        if (idx !== -1) {
            this.taskQueue.splice(idx, 1);
            this.completedTasks.push(task);
        }

        agent.status = 'idle';
        agent.currentTask = undefined;
        agent.completedTasks++;

        this.log(`[タスク完了] ${task.id} by ${agentName}`);

        // 完了通知
        vscode.window.showInformationMessage(
            `✅ ${agentName}がタスク「${task.description}」を完了しました！`,
            '詳細を見る'
        ).then(selection => {
            if (selection === '詳細を見る') {
                this.showDashboard();
            }
        });

        this.updateDashboard();
    }

    // =========================================================================
    // ファイル監視（YAMLタスク）
    // =========================================================================

    startWatchingTaskFile(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('ワークスペースが開かれていません');
            return;
        }

        const taskFilePath = path.join(workspaceFolder.uri.fsPath, TASK_FILE_NAME);
        const pattern = new vscode.RelativePattern(workspaceFolder, TASK_FILE_NAME);

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidCreate((uri) => {
            this.log(`[ファイル監視] タスクファイルが作成されました: ${uri.fsPath}`);
            this.loadAndDistributeTasks(uri.fsPath);
        });

        this.fileWatcher.onDidChange((uri) => {
            this.log(`[ファイル監視] タスクファイルが更新されました: ${uri.fsPath}`);
            this.loadAndDistributeTasks(uri.fsPath);
        });

        this.context?.subscriptions.push(this.fileWatcher);

        // 既存のファイルがあれば読み込む
        if (fs.existsSync(taskFilePath)) {
            this.loadAndDistributeTasks(taskFilePath);
        }

        this.log(`[ファイル監視] ${TASK_FILE_NAME} の監視を開始しました`);
        vscode.window.showInformationMessage(`📁 ${TASK_FILE_NAME} の監視を開始しました`);
    }

    stopWatchingTaskFile(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
            this.log(`[ファイル監視] 監視を停止しました`);
            vscode.window.showInformationMessage('📁 タスクファイルの監視を停止しました');
        }
    }

    private async loadAndDistributeTasks(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const taskFile = parseSimpleYaml(content);

            if (taskFile.tasks.length === 0) {
                this.log('[WARN] タスクファイルにタスクがありません');
                return;
            }

            // メイドが起動していなければ起動
            const maidCount = Array.from(this.agents.values()).filter(a => a.role === 'maid').length;
            if (maidCount === 0) {
                this.startMaids();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            await this.distributeTasksAutomatically(taskFile.tasks);
        } catch (error) {
            this.log(`[ERROR] タスクファイルの読み込みに失敗: ${error}`);
            vscode.window.showErrorMessage(`タスクファイルの読み込みに失敗しました: ${error}`);
        }
    }

    // =========================================================================
    // サンプルタスクファイル作成
    // =========================================================================

    async createSampleTaskFile(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('ワークスペースが開かれていません');
            return;
        }

        const sampleContent = `# Maid Agent タスクファイル
# このファイルを保存すると、自動的にメイドにタスクが配信されます

tasks:
  - id: task-001
    description: "READMEの確認"
    prompt: |
      README.mdファイルを確認して、内容を要約してください。

  - id: task-002
    description: "コードレビュー"
    prompt: |
      src/フォルダ内のコードをレビューして、改善点があれば教えてください。

  - id: task-003
    description: "テスト確認"
    assignTo: "メイド1(エマ)"
    prompt: |
      テストコードがあれば実行して、結果を報告してください。
`;

        const filePath = path.join(workspaceFolder.uri.fsPath, TASK_FILE_NAME);
        fs.writeFileSync(filePath, sampleContent, 'utf-8');

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);

        vscode.window.showInformationMessage(`📝 サンプルタスクファイル ${TASK_FILE_NAME} を作成しました`);
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
            '🎀 Maid Agent Dashboard',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        this.dashboardPanel.onDidDispose(() => {
            this.dashboardPanel = undefined;
        });

        // Webviewからのメッセージを受信
        this.dashboardPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'markComplete':
                        this.markTaskComplete(message.agentName);
                        break;
                    case 'refresh':
                        this.updateDashboard();
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        this.updateDashboard();
    }

    private updateDashboard(): void {
        if (!this.dashboardPanel) return;

        const headMaids = Array.from(this.agents.values()).filter(a => a.role === 'headMaid');
        const chiefMaids = Array.from(this.agents.values()).filter(a => a.role === 'chiefMaid');
        const maids = Array.from(this.agents.values()).filter(a => a.role === 'maid');

        const renderAgent = (a: Agent, emoji: string) => {
            const statusEmoji = a.status === 'working' ? '⚡' : a.status === 'done' ? '✅' : '💤';
            const statusClass = a.status === 'working' ? 'working' : a.status === 'done' ? 'done' : 'idle';
            const taskInfo = a.currentTask
                ? `<div class="task-info">📋 ${a.currentTask.description}</div>`
                : '';
            const completeBtn = a.status === 'working'
                ? `<button class="complete-btn" onclick="markComplete('${a.name}')">完了</button>`
                : '';
            return `
                <li class="${statusClass}">
                    <div class="agent-info">
                        <span class="agent-name">${emoji} ${a.name}</span>
                        <span class="status-badge">${statusEmoji} ${a.status}</span>
                        ${completeBtn}
                    </div>
                    ${taskInfo}
                    <div class="completed-count">完了タスク: ${a.completedTasks}件</div>
                </li>`;
        };

        const headList = headMaids.map(a => renderAgent(a, '🎀')).join('');
        const chiefList = chiefMaids.map(a => renderAgent(a, '💼')).join('');
        const maidList = maids.map(a => renderAgent(a, '👒')).join('');

        const pendingTasks = this.taskQueue.filter(t => t.status === 'pending').length;
        const workingTasks = this.taskQueue.filter(t => t.status === 'working').length;
        const completedCount = this.completedTasks.length;

        const recentLogs = this.logs.slice(-10).reverse().map(log =>
            `<div class="log-entry">${log}</div>`
        ).join('');

        const taskQueueHtml = this.taskQueue.map(t => {
            const statusEmoji = t.status === 'pending' ? '⏳' : t.status === 'working' ? '⚡' : '✅';
            return `<li class="task-item ${t.status}">
                <span>${statusEmoji} ${t.id}</span>
                <span class="task-desc">${t.description}</span>
                ${t.assignedTo ? `<span class="assigned">→ ${t.assignedTo}</span>` : ''}
            </li>`;
        }).join('') || '<li class="empty">タスクはございません</li>';

        this.dashboardPanel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            color: #4a4a4a;
            min-height: 100vh;
            margin: 0;
        }
        h1 {
            color: #d63384;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 5px;
        }
        .subtitle {
            color: #6f42c1;
            margin-bottom: 20px;
        }
        h2 {
            color: #6f42c1;
            border-bottom: 2px dashed #d63384;
            padding-bottom: 5px;
            margin-top: 0;
        }
        .agent-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .agent-list li {
            padding: 12px 15px;
            margin: 8px 0;
            background: rgba(255,255,255,0.95);
            border-radius: 10px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .agent-list li.working {
            border-left: 4px solid #ffc107;
            background: rgba(255,243,205,0.95);
        }
        .agent-list li.done {
            border-left: 4px solid #28a745;
        }
        .agent-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .agent-name {
            font-weight: bold;
            flex: 1;
        }
        .status-badge {
            font-size: 0.85em;
            padding: 3px 8px;
            border-radius: 12px;
            background: #e9ecef;
        }
        .task-info {
            font-size: 0.9em;
            color: #666;
            margin-top: 5px;
            padding-left: 25px;
        }
        .completed-count {
            font-size: 0.8em;
            color: #888;
            margin-top: 3px;
            padding-left: 25px;
        }
        .complete-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.8em;
        }
        .complete-btn:hover {
            background: #218838;
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
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin: 20px 0;
        }
        .stat-card {
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
        .stat-label {
            font-size: 0.85em;
            color: #666;
        }
        .two-column {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .task-list {
            list-style: none;
            padding: 0;
            margin: 0;
            max-height: 200px;
            overflow-y: auto;
        }
        .task-item {
            padding: 8px 12px;
            margin: 5px 0;
            background: rgba(255,255,255,0.9);
            border-radius: 8px;
            font-size: 0.9em;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .task-item.working {
            background: rgba(255,243,205,0.95);
        }
        .task-desc {
            flex: 1;
            color: #666;
        }
        .assigned {
            font-size: 0.85em;
            color: #6f42c1;
        }
        .log-container {
            background: #1e1e1e;
            border-radius: 10px;
            padding: 10px;
            max-height: 150px;
            overflow-y: auto;
        }
        .log-entry {
            font-family: 'Consolas', monospace;
            font-size: 0.8em;
            color: #0f0;
            padding: 2px 5px;
            border-bottom: 1px solid #333;
        }
        .refresh-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #d63384;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            box-shadow: 0 3px 10px rgba(0,0,0,0.2);
        }
        .refresh-btn:hover {
            background: #c21e6c;
        }
        @media (max-width: 600px) {
            .stats { grid-template-columns: repeat(2, 1fr); }
            .two-column { grid-template-columns: 1fr; }
            .maid-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <h1>🎀 Maid Agent Controller</h1>
    <p class="subtitle">メイドさんチームがご主人様のお仕事をお手伝いいたします♪</p>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">${this.agents.size}</div>
            <div class="stat-label">👒 総メイド数</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${Array.from(this.agents.values()).filter(a => a.status === 'working').length}</div>
            <div class="stat-label">⚡ 稼働中</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${pendingTasks + workingTasks}</div>
            <div class="stat-label">📋 残タスク</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${completedCount}</div>
            <div class="stat-label">✅ 完了</div>
        </div>
    </div>

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

    <div class="two-column">
        <div class="section">
            <h2>📋 タスクキュー</h2>
            <ul class="task-list">
                ${taskQueueHtml}
            </ul>
        </div>
        <div class="section">
            <h2>📜 ログ</h2>
            <div class="log-container">
                ${recentLogs || '<div class="log-entry">ログはございません</div>'}
            </div>
        </div>
    </div>

    <button class="refresh-btn" onclick="refresh()">🔄 更新</button>

    <script>
        const vscode = acquireVsCodeApi();

        function markComplete(agentName) {
            vscode.postMessage({ command: 'markComplete', agentName: agentName });
        }

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
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

        // ログは最新100件まで保持
        if (this.logs.length > 100) {
            this.logs.shift();
        }
    }

    // =========================================================================
    // ユーザー入力
    // =========================================================================

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

    // =========================================================================
    // クリーンアップ
    // =========================================================================

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

    // コマンド登録
    const commands = [
        vscode.commands.registerCommand('multiAgent.startAgents', () => {
            controller.startHeadAndChief();
        }),
        vscode.commands.registerCommand('multiAgent.startMaids', () => {
            controller.startMaids();
        }),
        vscode.commands.registerCommand('multiAgent.startAll', () => {
            controller.startAllAgents();
        }),
        vscode.commands.registerCommand('multiAgent.sendToChief', () => {
            controller.promptAndSendToChief();
        }),
        vscode.commands.registerCommand('multiAgent.sendToMaid', () => {
            controller.promptAndSendToMaid();
        }),
        vscode.commands.registerCommand('multiAgent.startClaude', () => {
            controller.startClaudeOnAllMaids();
        }),
        vscode.commands.registerCommand('multiAgent.showDashboard', () => {
            controller.showDashboard();
        }),
        vscode.commands.registerCommand('multiAgent.watchTaskFile', () => {
            controller.startWatchingTaskFile();
        }),
        vscode.commands.registerCommand('multiAgent.stopWatchTaskFile', () => {
            controller.stopWatchingTaskFile();
        }),
        vscode.commands.registerCommand('multiAgent.createSampleTask', () => {
            controller.createSampleTaskFile();
        }),
    ];

    context.subscriptions.push(...commands);

    // ステータスバーアイテム
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '🎀 Maid Agent';
    statusBarItem.command = 'multiAgent.showDashboard';
    statusBarItem.tooltip = 'クリックでダッシュボードを表示';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {
    controller?.dispose();
}
