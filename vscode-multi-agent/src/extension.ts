import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// 型定義
// =============================================================================

interface Agent {
    name: string;
    terminal: vscode.Terminal;
    role: 'butler' | 'chiefMaid' | 'maid';
    status: 'idle' | 'working' | 'done';
    currentTask?: Task;
    completedTasks: number;
}

interface Task {
    id: string;
    description: string;
    prompt: string;
    assignedTo?: string;
    status: 'pending' | 'assigned' | 'working' | 'completed';
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    parentTaskId?: string;  // 親タスク（執事から来たタスク）
    subtasks?: Task[];      // サブタスク
}

interface TaskDefinition {
    id: string;
    description: string;
    prompt: string;
    assignTo?: string;
}

// =============================================================================
// 定数
// =============================================================================

const MAID_NAMES = [
    'エマ', 'ソフィア', 'リリー', 'ローズ',
    'アリス', 'メイ', 'フローラ', 'ルナ'
];

// 執事のシステムプロンプト（タスク分解用）
const BUTLER_SYSTEM_PROMPT = `あなたは優秀な執事です。ご主人様から受けた指示を分析し、メイドたちが実行できるサブタスクに分解してください。

【重要なルール】
1. 「かしこまりました、ご主人様」から始めてください
2. タスクを分析し、並列実行可能なサブタスクに分解してください
3. 各サブタスクは具体的で、1人のメイドが独立して実行できる粒度にしてください
4. サブタスクは以下の形式で出力してください：

【サブタスク一覧】
1. [タスク名]: [具体的な指示内容]
2. [タスク名]: [具体的な指示内容]
...

5. 最後に「メイド長、これらのタスクをメイドたちに配分してください」と締めくくってください`;

// メイド長のシステムプロンプト（タスク配分用）
const CHIEF_MAID_SYSTEM_PROMPT = `あなたはメイド長です。執事から受けたサブタスクを各メイドに適切に配分し、進捗を管理してください。

【重要なルール】
1. 「承知いたしました」から始めてください
2. 利用可能なメイド: エマ、ソフィア、リリー、ローズ、アリス、メイ、フローラ、ルナ
3. 各メイドの得意分野を考慮して配分してください
4. 配分結果は以下の形式で報告してください：

【タスク配分】
- エマ: [タスク内容]
- ソフィア: [タスク内容]
...

5. 全タスク完了後は「執事様、全タスクが完了いたしました」と報告してください`;

// メイドのシステムプロンプト
const MAID_SYSTEM_PROMPT = `あなたは優秀なメイドです。メイド長から指示されたタスクを丁寧に実行してください。

【重要なルール】
1. 「かしこまりました♪」から始めてください
2. 指示されたタスクを正確に実行してください
3. 作業の進捗を報告しながら進めてください
4. 完了時は「お仕事完了でございます♪」と報告してください
5. 問題が発生した場合は「申し訳ございません、問題が発生いたしました」と報告してください`;

const TASK_FILE_NAME = 'maid-tasks.yaml';

// =============================================================================
// シンプルなYAMLパーサー
// =============================================================================

function parseSimpleYaml(content: string): { tasks: TaskDefinition[] } {
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

        this.log(`[${name}] 準備完了`);
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
        this.log(`[${agentName}] → ${command.substring(0, 60)}...`);

        this.updateDashboard();
        return true;
    }

    // =========================================================================
    // 階層構造の起動
    // =========================================================================

    // 執事を起動
    startButler(): void {
        if (this.agents.has('執事')) {
            vscode.window.showWarningMessage('執事は既にお仕えしております');
            return;
        }

        const butler = this.createAgent('執事', 'butler', '🎩');
        butler.terminal.show();

        this.sendToAgent('執事', 'echo "🎩 執事、準備完了でございます。ご主人様のご命令をお待ちしております。"');
        vscode.window.showInformationMessage('🎩 執事がお仕えする準備ができました！');
        this.updateDashboard();
    }

    // メイド長を起動
    startChiefMaid(): void {
        if (this.agents.has('メイド長')) {
            vscode.window.showWarningMessage('メイド長は既にお仕えしております');
            return;
        }

        const chief = this.createAgent('メイド長', 'chiefMaid', '👑');
        this.sendToAgent('メイド長', 'echo "👑 メイド長、参上いたしました。メイドたちの指揮を執ります。"');
        vscode.window.showInformationMessage('👑 メイド長がお仕えする準備ができました！');
        this.updateDashboard();
    }

    // メイド8人を起動
    startMaids(): void {
        let startedCount = 0;
        for (let i = 0; i < 8; i++) {
            const name = MAID_NAMES[i];
            if (!this.agents.has(name)) {
                this.createAgent(name, 'maid', '🎀');
                this.sendToAgent(name, `echo "🎀 ${name}、お仕えいたします♪"`);
                startedCount++;
            }
        }

        if (startedCount > 0) {
            vscode.window.showInformationMessage(`🎀 メイド${startedCount}人がお仕えする準備ができました！`);
        } else {
            vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
        }
        this.updateDashboard();
    }

    // 全員起動（執事 + メイド長 + メイド8人）
    startAllAgents(): void {
        this.startButler();
        this.startChiefMaid();
        this.startMaids();
    }

    // =========================================================================
    // 階層的タスクフロー
    // =========================================================================

    // 執事にタスクを送信（階層の起点）
    async sendTaskToButler(taskDescription: string): Promise<void> {
        const butler = this.agents.get('執事');
        if (!butler) {
            vscode.window.showWarningMessage('執事がおりません。先に起動してください。');
            return;
        }

        // タスクを作成
        const task: Task = {
            id: `task-${Date.now()}`,
            description: taskDescription,
            prompt: taskDescription,
            status: 'working',
            createdAt: new Date(),
            startedAt: new Date()
        };
        this.taskQueue.push(task);

        this.log(`[執事への指令] ${taskDescription}`);

        // 執事のClaudeにタスクを送信（システムプロンプト付き）
        const claudeCommand = `claude --system-prompt "${BUTLER_SYSTEM_PROMPT.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" "${taskDescription}"`;
        this.sendToAgent('執事', claudeCommand);

        butler.currentTask = task;
        this.updateDashboard();

        vscode.window.showInformationMessage('🎩 執事にタスクを送信しました。タスク分解中...');
    }

    // メイド長にサブタスクを送信
    async sendSubtasksToChief(subtasks: string[]): Promise<void> {
        const chief = this.agents.get('メイド長');
        if (!chief) {
            this.log('[ERROR] メイド長がおりません');
            return;
        }

        const subtaskList = subtasks.map((s, i) => `${i + 1}. ${s}`).join('\n');
        const prompt = `以下のサブタスクをメイドたちに配分してください：\n\n${subtaskList}`;

        const claudeCommand = `claude --system-prompt "${CHIEF_MAID_SYSTEM_PROMPT.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" "${prompt.replace(/"/g, '\\"')}"`;
        this.sendToAgent('メイド長', claudeCommand);

        this.log(`[メイド長への指令] ${subtasks.length}件のサブタスクを配分依頼`);
    }

    // 特定のメイドにタスクを送信
    sendTaskToMaid(maidName: string, taskDescription: string): void {
        const maid = this.agents.get(maidName);
        if (!maid) {
            this.log(`[ERROR] ${maidName}が見つかりません`);
            return;
        }

        const task: Task = {
            id: `subtask-${Date.now()}-${maidName}`,
            description: taskDescription,
            prompt: taskDescription,
            assignedTo: maidName,
            status: 'working',
            createdAt: new Date(),
            startedAt: new Date()
        };
        this.taskQueue.push(task);
        maid.currentTask = task;

        const claudeCommand = `claude --system-prompt "${MAID_SYSTEM_PROMPT.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" "${taskDescription.replace(/"/g, '\\"')}"`;
        this.sendToAgent(maidName, claudeCommand);

        this.log(`[${maidName}への指令] ${taskDescription}`);
        this.updateDashboard();
    }

    // 全メイドにClaude Codeを起動（システムプロンプト付き）
    startClaudeOnAllAgents(): void {
        // 執事
        const butler = this.agents.get('執事');
        if (butler) {
            this.sendToAgent('執事', `claude --system-prompt "${BUTLER_SYSTEM_PROMPT.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
        }

        // メイド長
        const chief = this.agents.get('メイド長');
        if (chief) {
            this.sendToAgent('メイド長', `claude --system-prompt "${CHIEF_MAID_SYSTEM_PROMPT.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
        }

        // メイド
        let maidCount = 0;
        for (const name of MAID_NAMES) {
            const maid = this.agents.get(name);
            if (maid) {
                this.sendToAgent(name, `claude --system-prompt "${MAID_SYSTEM_PROMPT.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
                maidCount++;
            }
        }

        vscode.window.showInformationMessage(`🤖 全エージェント（執事、メイド長、メイド${maidCount}人）がClaude Codeを起動しました！`);
    }

    // =========================================================================
    // タスク完了処理
    // =========================================================================

    markTaskComplete(agentName: string): void {
        const agent = this.agents.get(agentName);
        if (!agent || !agent.currentTask) return;

        const task = agent.currentTask;
        task.status = 'completed';
        task.completedAt = new Date();

        const idx = this.taskQueue.findIndex(t => t.id === task.id);
        if (idx !== -1) {
            this.taskQueue.splice(idx, 1);
            this.completedTasks.push(task);
        }

        agent.status = 'idle';
        agent.currentTask = undefined;
        agent.completedTasks++;

        this.log(`[タスク完了] ${task.description} by ${agentName}`);

        vscode.window.showInformationMessage(
            `✅ ${agentName}がタスクを完了しました！`,
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
            this.log(`[ファイル監視] タスクファイルが作成されました`);
            this.loadAndDistributeTasks(uri.fsPath);
        });

        this.fileWatcher.onDidChange((uri) => {
            this.log(`[ファイル監視] タスクファイルが更新されました`);
            this.loadAndDistributeTasks(uri.fsPath);
        });

        this.context?.subscriptions.push(this.fileWatcher);

        if (fs.existsSync(taskFilePath)) {
            this.loadAndDistributeTasks(taskFilePath);
        }

        this.log(`[ファイル監視] ${TASK_FILE_NAME} の監視を開始`);
        vscode.window.showInformationMessage(`📁 ${TASK_FILE_NAME} の監視を開始しました`);
    }

    stopWatchingTaskFile(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
            this.log(`[ファイル監視] 監視を停止`);
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

            // 執事が起動していなければ起動
            if (!this.agents.has('執事')) {
                this.startButler();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 最初のタスクを執事に送信（階層的に処理）
            for (const taskDef of taskFile.tasks) {
                await this.sendTaskToButler(taskDef.prompt);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
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
# 執事がタスクを受け取り、分解してメイド長に指示します
# メイド長が各メイドにタスクを配分します

tasks:
  - id: task-001
    description: "プロジェクト分析"
    prompt: |
      このプロジェクトを分析してください。
      以下の観点で調査し、報告してください：
      - プロジェクトの構造
      - 主要なファイルと役割
      - 改善点や問題点

  - id: task-002
    description: "ドキュメント整備"
    prompt: |
      プロジェクトのドキュメントを確認し、
      不足している部分を洗い出してください。
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
                    case 'markComplete':
                        this.markTaskComplete(message.agentName);
                        break;
                    case 'refresh':
                        this.updateDashboard();
                        break;
                    case 'sendTask':
                        this.promptAndSendToButler();
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

        const butler = this.agents.get('執事');
        const chief = this.agents.get('メイド長');
        const maids = MAID_NAMES.map(name => this.agents.get(name)).filter(Boolean) as Agent[];

        const renderAgent = (a: Agent, emoji: string, role: string) => {
            const statusEmoji = a.status === 'working' ? '⚡' : a.status === 'done' ? '✅' : '💤';
            const statusClass = a.status === 'working' ? 'working' : a.status === 'done' ? 'done' : 'idle';
            const taskInfo = a.currentTask
                ? `<div class="task-info">📋 ${a.currentTask.description.substring(0, 40)}...</div>`
                : '';
            const completeBtn = a.status === 'working'
                ? `<button class="complete-btn" onclick="markComplete('${a.name}')">完了</button>`
                : '';
            return `
                <div class="agent-card ${statusClass}">
                    <div class="agent-header">
                        <span class="agent-name">${emoji} ${a.name}</span>
                        <span class="agent-role">${role}</span>
                    </div>
                    <div class="agent-status">
                        <span class="status-badge">${statusEmoji} ${a.status}</span>
                        ${completeBtn}
                    </div>
                    ${taskInfo}
                    <div class="completed-count">完了: ${a.completedTasks}件</div>
                </div>`;
        };

        const butlerHtml = butler ? renderAgent(butler, '🎩', '統括') : '<div class="empty-agent">執事がおりません</div>';
        const chiefHtml = chief ? renderAgent(chief, '👑', '配分担当') : '<div class="empty-agent">メイド長がおりません</div>';
        const maidsHtml = maids.length > 0
            ? maids.map(m => renderAgent(m, '🎀', '実行担当')).join('')
            : '<div class="empty-agent">メイドがおりません</div>';

        const pendingTasks = this.taskQueue.filter(t => t.status === 'pending').length;
        const workingTasks = this.taskQueue.filter(t => t.status === 'working').length;
        const completedCount = this.completedTasks.length;

        const recentLogs = this.logs.slice(-10).reverse().map(log =>
            `<div class="log-entry">${log}</div>`
        ).join('');

        const taskQueueHtml = this.taskQueue.map(t => {
            const statusEmoji = t.status === 'pending' ? '⏳' : t.status === 'working' ? '⚡' : '✅';
            return `<li class="task-item ${t.status}">
                <span>${statusEmoji}</span>
                <span class="task-desc">${t.description.substring(0, 30)}...</span>
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
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
        }
        h1 {
            color: #e94560;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            margin-bottom: 5px;
        }
        .subtitle {
            color: #888;
            margin-bottom: 20px;
        }
        h2 {
            color: #e94560;
            border-bottom: 2px solid #e94560;
            padding-bottom: 5px;
            margin-top: 0;
            font-size: 1.1em;
        }

        /* 階層構造の表示 */
        .hierarchy {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            margin: 20px 0;
        }
        .hierarchy-row {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .hierarchy-arrow {
            color: #e94560;
            font-size: 1.5em;
        }

        .agent-card {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 12px;
            min-width: 150px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .agent-card.working {
            border-color: #ffc107;
            background: rgba(255,193,7,0.1);
        }
        .agent-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .agent-name {
            font-weight: bold;
            font-size: 0.95em;
        }
        .agent-role {
            font-size: 0.75em;
            color: #888;
            background: rgba(255,255,255,0.1);
            padding: 2px 6px;
            border-radius: 8px;
        }
        .agent-status {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .status-badge {
            font-size: 0.8em;
            padding: 2px 8px;
            border-radius: 10px;
            background: rgba(255,255,255,0.15);
        }
        .task-info {
            font-size: 0.8em;
            color: #aaa;
            margin-top: 8px;
            padding: 5px;
            background: rgba(0,0,0,0.2);
            border-radius: 5px;
        }
        .completed-count {
            font-size: 0.75em;
            color: #666;
            margin-top: 5px;
        }
        .complete-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 3px 8px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.75em;
        }
        .complete-btn:hover { background: #218838; }
        .empty-agent {
            color: #666;
            font-style: italic;
            padding: 20px;
        }

        .section {
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin: 15px 0;
        }
        .stat-card {
            background: rgba(255,255,255,0.1);
            padding: 12px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-number {
            font-size: 1.8em;
            font-weight: bold;
            color: #e94560;
        }
        .stat-label {
            font-size: 0.8em;
            color: #888;
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
            max-height: 150px;
            overflow-y: auto;
        }
        .task-item {
            padding: 6px 10px;
            margin: 4px 0;
            background: rgba(255,255,255,0.1);
            border-radius: 5px;
            font-size: 0.85em;
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .task-desc { flex: 1; color: #aaa; }
        .assigned { font-size: 0.8em; color: #e94560; }

        .log-container {
            background: #0a0a0a;
            border-radius: 8px;
            padding: 10px;
            max-height: 150px;
            overflow-y: auto;
        }
        .log-entry {
            font-family: 'Consolas', monospace;
            font-size: 0.75em;
            color: #0f0;
            padding: 2px 5px;
            border-bottom: 1px solid #222;
        }

        .action-bar {
            display: flex;
            gap: 10px;
            margin: 15px 0;
        }
        .action-btn {
            background: #e94560;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9em;
        }
        .action-btn:hover { background: #d63050; }
        .action-btn.secondary {
            background: rgba(255,255,255,0.2);
        }

        @media (max-width: 600px) {
            .stats { grid-template-columns: repeat(2, 1fr); }
            .two-column { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <h1>🎩 Maid Agent Controller</h1>
    <p class="subtitle">執事 → メイド長 → メイド の階層構造でタスクを実行</p>

    <div class="action-bar">
        <button class="action-btn" onclick="sendTask()">📝 執事に指令を送る</button>
        <button class="action-btn secondary" onclick="refresh()">🔄 更新</button>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">${this.agents.size}</div>
            <div class="stat-label">総エージェント</div>
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
        <h2>📊 階層構造</h2>
        <div class="hierarchy">
            <div class="hierarchy-row">
                ${butlerHtml}
            </div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">
                ${chiefHtml}
            </div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">
                ${maidsHtml}
            </div>
        </div>
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

    <script>
        const vscode = acquireVsCodeApi();
        function markComplete(agentName) {
            vscode.postMessage({ command: 'markComplete', agentName: agentName });
        }
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        function sendTask() {
            vscode.postMessage({ command: 'sendTask' });
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
        const maidNames = MAID_NAMES.filter(name => this.agents.has(name));

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
            placeHolder: '例: このファイルをレビューしてください'
        });

        if (command) {
            this.sendTaskToMaid(selectedMaid, command);
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

    const commands = [
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
        vscode.commands.registerCommand('multiAgent.startMaids', () => {
            controller.startMaids();
        }),
        vscode.commands.registerCommand('multiAgent.startAll', () => {
            controller.startAllAgents();
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
