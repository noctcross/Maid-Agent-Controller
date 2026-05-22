import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, SetupContext, AgentContext, ViewContext, CompletedViewState } from './types';
import { MAID_AGENT_DIR, NOTIFICATIONS_SUBDIR } from './constants';
import { ENV, isTmuxAvailable, getTmuxVersion } from './utils/environment';
import { getGlobalMaidAgentPath, getSessionNameFromPath } from './utils/helpers';
import { MultiplexerFactory, ITerminalMultiplexer } from './multiplexer';
import { AgentPanelProvider } from './ui/agent-panel-provider';
import * as WorkspaceInit from './setup/workspace-initializer';
import * as WslSetup from './setup/wsl-setup';
import * as RulesSkills from './setup/rules-skills';
import * as Cleanup from './setup/cleanup';
import * as AgentLifecycle from './agents/agent-lifecycle';
import * as AgentComm from './agents/agent-communication';
import * as AgentStartup from './agents/agent-startup';
import * as ControllerPanel from './ui/controller-panel';
import * as Dashboard from './ui/web-dashboard';
import * as StatusBar from './ui/status-bar';
import { loadSettings, MaidAgentSettings } from './utils/settings-loader';
// イベント・コマンドモジュール
import * as FileWatcher from './events/file-watcher';
import * as TmuxWatcher from './events/tmux-watcher';
import * as UserCommands from './commands/user-commands';
// Context Factory
import {
    ControllerState,
    createSetupContext,
    createAgentContext,
    createViewContext,
    createTmuxWatcherContext,
    createFileWatcherContext,
    createUserCommandContext,
} from './context-factory';

// =============================================================================
// メインコントローラー
// =============================================================================

export class MultiAgentController {
    private agents: Map<string, Agent> = new Map();
    private outputChannel: vscode.OutputChannel;
    private controllerPanel: vscode.WebviewPanel | undefined;
    private logs: string[] = [];
    private context: vscode.ExtensionContext | undefined;
    private workspaceRoot: string | undefined;
    private maidAgentPath: string | undefined;
    private agentPanelProvider: AgentPanelProvider | undefined;
    private tmuxManager: ITerminalMultiplexer | undefined;
    private multiplexerFactory: MultiplexerFactory;
    private tmuxViewerTerminal: vscode.Terminal | undefined;  // tmuxセッション表示用
    private tmuxSessionName: string = '';  // ワークスペース固有のセッション名
    private statusBarItem: vscode.StatusBarItem | undefined;  // ステータスバー通知用
    private statusBarResetTimeout: NodeJS.Timeout | undefined;  // ステータスバー表示リセット用
    private dashboardPanel: vscode.WebviewPanel | undefined;
    private dashboardInitialized = false;
    private dashboardConsecutiveFailures = 0;  // ダッシュボード接続の連続失敗回数
    private completedViewState: CompletedViewState = { limit: 10, offset: 0, hash: '', completedSortField: undefined };
    private reportViewerPanel: vscode.WebviewPanel | undefined;
    private settings: MaidAgentSettings | undefined;
    // イベント監視の状態（モジュール分離）
    private fileWatcherState: FileWatcher.FileWatcherState;
    private tmuxWatcherState: TmuxWatcher.TmuxWatcherState;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Maid Agent');
        this.fileWatcherState = FileWatcher.createFileWatcherState();
        this.tmuxWatcherState = TmuxWatcher.createTmuxWatcherState();
        this.multiplexerFactory = new MultiplexerFactory();
    }

    public setContext(context: vscode.ExtensionContext): void {
        this.context = context;
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (this.workspaceRoot) {
            this.maidAgentPath = path.join(this.workspaceRoot, MAID_AGENT_DIR);
            // settings.yaml を読み込み（multiplexer設定をFactory生成前に取得する必要がある）
            this.settings = loadSettings(this.maidAgentPath);
            // settings.yaml の multiplexer.type を反映してFactory再生成
            const muxType = this.settings.multiplexer?.type;
            if (muxType && muxType !== 'auto') {
                this.multiplexerFactory = new MultiplexerFactory({ type: muxType });
            }
            // ワークスペースパスからセッション名を生成（ディレクトリ名 + 短いハッシュ）
            this.tmuxSessionName = getSessionNameFromPath(this.workspaceRoot);
            this.tmuxManager = this.multiplexerFactory.create(this.tmuxSessionName, this.workspaceRoot);
        }
    }

    /**
     * 現在のtmuxセッション名を取得
     */
    public getTmuxSessionName(): string {
        return this.tmuxSessionName;
    }

    /**
     * OutputChannelを取得（外部モジュールでのログ出力用）
     */
    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    public setAgentPanelProvider(provider: AgentPanelProvider): void {
        this.agentPanelProvider = provider;
        // ログ出力用に outputChannel を共有
        provider.setOutputChannel(this.outputChannel);
    }

    public setStatusBarItem(item: vscode.StatusBarItem): void {
        this.statusBarItem = item;
    }

    /**
     * MultiplexerFactory を再作成（InitGlobal後のランタイムモード反映用）
     */
    public refreshMultiplexerFactory(): void {
        // ワークスペース設定を優先
        const muxType = this.settings?.multiplexer?.type;
        if (muxType && muxType !== 'auto') {
            this.multiplexerFactory = new MultiplexerFactory({ type: muxType });
            this.log(`[Controller] MultiplexerFactory を再作成しました (workspace設定: ${muxType})`);
        } else {
            this.multiplexerFactory = new MultiplexerFactory();
            this.log('[Controller] MultiplexerFactory を再作成しました (自動検出)');
        }

        // workspaceRootが設定されていれば tmuxManager も再作成
        if (this.workspaceRoot) {
            this.tmuxManager = this.multiplexerFactory.create(this.tmuxSessionName, this.workspaceRoot);
            this.log(`[Controller] tmuxManager を再作成しました (type: ${this.multiplexerFactory.getType()})`);
        }
    }

    // =========================================================================
    // UI（ui/ モジュールへの委譲）
    // =========================================================================

    private showStatusBarNotification(icon: string, message: string): void {
        StatusBar.showStatusBarNotification(this.createViewContext(), icon, message);
    }

    public showController(): void {
        ControllerPanel.showController(this.createViewContext());
    }

    public restoreControllerPanel(panel: vscode.WebviewPanel): void {
        ControllerPanel.restoreControllerPanel(this.createViewContext(), panel);
    }

    private updateController(): void {
        ControllerPanel.updateController(this.createViewContext());
    }

    public showDashboard(): void {
        Dashboard.showDashboard(this.createViewContext());
    }

    private async updateDashboard(): Promise<void> {
        return Dashboard.updateDashboard(this.createViewContext());
    }

    public openDashboardInBrowser(): void {
        Dashboard.openDashboardInBrowser(this.createViewContext());
    }

    private async openMaidAgentFile(filename: string): Promise<void> {
        return Dashboard.openMaidAgentFile(this.createViewContext(), filename);
    }

    private async openFileWithPreview(filePath: string): Promise<void> {
        return Dashboard.openFileWithPreview(this.createViewContext(), filePath);
    }

    public restoreDashboardPanel(panel: vscode.WebviewPanel): void {
        Dashboard.restoreDashboardPanel(this.createViewContext(), panel);
    }

    // エージェントパネルを更新
    private updateAgentPanel(): void {
        if (this.agentPanelProvider) {
            this.agentPanelProvider.setAgents(this.agents);
        }
    }

    // ターミナル名からエージェントIDを取得
    public getAgentIdFromTerminal(terminal: vscode.Terminal): string | null {
        for (const [id, agent] of this.agents) {
            if (agent.terminal === terminal) {
                return id;
            }
        }
        return null;
    }

    // =========================================================================
    // Context Factory（context-factory.ts への委譲）
    // =========================================================================

    /**
     * ControllerState を構築（context-factory に渡すためのアダプター）
     */
    private asState(): ControllerState {
        const controller = this;
        return {
            agents: this.agents,
            outputChannel: this.outputChannel,
            logs: this.logs,
            context: this.context,
            get workspaceRoot() { return controller.workspaceRoot; },
            get maidAgentPath() { return controller.maidAgentPath; },
            set maidAgentPath(v) { controller.maidAgentPath = v; },
            get agentPanelProvider() { return controller.agentPanelProvider; },
            get tmuxManager() { return controller.tmuxManager; },
            set tmuxManager(v) { controller.tmuxManager = v; },
            multiplexerFactory: this.multiplexerFactory,
            get tmuxViewerTerminal() { return controller.tmuxViewerTerminal; },
            set tmuxViewerTerminal(v) { controller.tmuxViewerTerminal = v; },
            tmuxSessionName: this.tmuxSessionName,
            get statusBarItem() { return controller.statusBarItem; },
            get statusBarResetTimeout() { return controller.statusBarResetTimeout; },
            set statusBarResetTimeout(v) { controller.statusBarResetTimeout = v; },
            get controllerPanel() { return controller.controllerPanel; },
            set controllerPanel(v) { controller.controllerPanel = v; },
            get dashboardPanel() { return controller.dashboardPanel; },
            set dashboardPanel(v) { controller.dashboardPanel = v; },
            get dashboardInitialized() { return controller.dashboardInitialized; },
            set dashboardInitialized(v) { controller.dashboardInitialized = v; },
            get dashboardConsecutiveFailures() { return controller.dashboardConsecutiveFailures; },
            set dashboardConsecutiveFailures(v) { controller.dashboardConsecutiveFailures = v; },
            get completedViewState() { return controller.completedViewState; },
            set completedViewState(v) { controller.completedViewState = v; },
            get reportViewerPanel() { return controller.reportViewerPanel; },
            set reportViewerPanel(v) { controller.reportViewerPanel = v; },
            get settings() { return controller.settings; },

            // Methods
            log: (msg: string) => this.log(msg),
            updateController: () => this.updateController(),
            updateAgentPanel: () => this.updateAgentPanel(),
            delay: (ms: number) => this.delay(ms),
            startWatchingFiles: (silent?: boolean) => this.startWatchingFiles(silent),
            initializeWorkspace: () => this.initializeWorkspace(),
            installTmux: () => this.installTmux(),
            showTmuxInstallInstructions: () => this.showTmuxInstallInstructions(),
            ensureWslAvailable: () => this.ensureWslAvailable(),
            createAgent: (name, id, role, emoji) => this.createAgent(name, id, role, emoji),
            sendToAgent: (agentId, command) => this.sendToAgent(agentId, command),
            sendMessageToAgent: (agentId, message) => this.sendMessageToAgent(agentId, message),
            deliverPendingMessages: (agentId) => this.deliverPendingMessages(agentId),
            initializeTmuxSession: () => this.initializeTmuxSession(),
            saveSessionNameToFile: () => this.saveSessionNameToFile(),
            openTmuxViewer: () => this.openTmuxViewer(),
            getSystemPromptFilePath: (agentId, role, maidName?) => this.getSystemPromptFilePath(agentId, role, maidName),
            getFallbackRolePrompt: (agentId, role, maidName?) => this.getFallbackRolePrompt(agentId, role, maidName),
            launchClaudeWithRole: (agentId, role, maidName?) => this.launchClaudeWithRole(agentId, role, maidName),
            ensureInitialized: () => this.ensureInitialized(),
            checkExistingSessionAndPrompt: (agentId, agentName) => this.checkExistingSessionAndPrompt(agentId, agentName),
            checkSessionCountWarning: () => this.checkSessionCountWarning(),
            ensureTmuxAvailable: () => this.ensureTmuxAvailable(),
            captureAgentOutput: (agentId, lines?) => this.captureAgentOutput(agentId, lines),
            resumeSessions: () => this.resumeSessions(),
            showController: () => this.showController(),
            showDashboard: () => this.showDashboard(),
            updateDashboard: () => this.updateDashboard(),
            openMaidAgentFile: (filename) => this.openMaidAgentFile(filename),
            openFileWithPreview: (filePath) => this.openFileWithPreview(filePath),
            openDashboardInBrowser: () => this.openDashboardInBrowser(),
            showStatusBarNotification: (icon, message) => this.showStatusBarNotification(icon, message),
            promptAndSendToButler: () => this.promptAndSendToButler(),
            sendTaskToButler: (taskDescription) => this.sendTaskToButler(taskDescription),
            getAgentIdFromTerminal: (terminal) => this.getAgentIdFromTerminal(terminal),
        };
    }

    // =========================================================================
    // tmuxウィンドウ監視（events/tmux-watcher.ts への委譲）
    // =========================================================================

    // 現在のエージェントを設定（パネル更新用）
    public setCurrentAgentFromTerminal(terminal: vscode.Terminal | undefined): void {
        TmuxWatcher.setCurrentAgentFromTerminal(
            createTmuxWatcherContext(this.asState()),
            this.tmuxWatcherState,
            terminal,
            (t: vscode.Terminal) => this.getAgentIdFromTerminal(t)
        );
    }

    private stopTmuxWindowPolling(): void {
        TmuxWatcher.stopTmuxWindowPolling(
            createTmuxWatcherContext(this.asState()),
            this.tmuxWatcherState
        );
    }

    // =========================================================================
    // 初期化（setup/ モジュールへの委譲）
    // =========================================================================

    private createSetupContext(): SetupContext | undefined {
        return createSetupContext(this.asState());
    }

    private createAgentContext(): AgentContext {
        return createAgentContext(this.asState());
    }

    private createViewContext(): ViewContext {
        return createViewContext(this.asState());
    }

    public async initializeWorkspace(): Promise<boolean> {
        const ctx = this.createSetupContext();
        if (!ctx) {
            vscode.window.showErrorMessage('ワークスペースが初期化されていません。フォルダを開いてください。');
            return false;
        }
        return WorkspaceInit.initializeWorkspace(ctx);
    }

    public async initializeGlobalSettings(): Promise<boolean> {
        const ctx = this.createSetupContext();
        if (!ctx) {
            vscode.window.showErrorMessage('ワークスペースが初期化されていません。フォルダを開いてください。');
            return false;
        }
        const result = await WorkspaceInit.initializeGlobalSettings(ctx);

        // InitGlobal完了後、ランタイムモードの変更を反映するためFactoryを再作成
        if (result) {
            this.refreshMultiplexerFactory();
        }

        return result;
    }

    public async promoteRuleToGlobal(): Promise<void> {
        const ctx = this.createSetupContext();
        if (!ctx) {
            vscode.window.showErrorMessage('ワークスペースが初期化されていません。フォルダを開いてください。');
            return;
        }
        return RulesSkills.promoteRuleToGlobal(
            ctx,
            () => this.initializeGlobalSettings()
        );
    }

    // =========================================================================
    // エージェント管理（agents/ モジュールへの委譲）
    // =========================================================================

    private initializeTmuxSession(): void {
        AgentStartup.initializeTmuxSession(this.createAgentContext());
    }

    private saveSessionNameToFile(): void {
        AgentStartup.saveSessionNameToFile(this.createAgentContext());
    }

    public openTmuxViewer(): void {
        AgentStartup.openTmuxViewer(this.createAgentContext());
    }

    public createAgent(name: string, id: string, role: Agent['role'], emoji: string): Agent {
        return AgentLifecycle.createAgent(this.createAgentContext(), name, id, role, emoji);
    }

    public sendToAgent(agentId: string, command: string): boolean {
        return AgentComm.sendToAgent(this.createAgentContext(), agentId, command);
    }

    public async sendMessageToAgent(agentId: string, message: string): Promise<boolean> {
        return AgentComm.sendMessageToAgent(this.createAgentContext(), agentId, message);
    }

    public captureAgentOutput(agentId: string, lines: number = 100): string {
        return AgentComm.captureAgentOutput(this.createAgentContext(), agentId, lines);
    }

    private getSystemPromptFilePath(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string | null {
        return AgentStartup.getSystemPromptFilePath(this.createAgentContext(), agentId, role, maidName);
    }

    private getFallbackRolePrompt(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string {
        return AgentStartup.getFallbackRolePrompt(this.createAgentContext(), agentId, role, maidName);
    }

    public async launchClaudeWithRole(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void> {
        if (this.maidAgentPath) {
            this.settings = loadSettings(this.maidAgentPath);
        }
        return AgentStartup.launchClaudeWithRole(this.createAgentContext(), agentId, role, maidName);
    }

    private async deliverPendingMessages(agentId: string): Promise<void> {
        return AgentComm.deliverPendingMessages(this.createAgentContext(), agentId);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // =========================================================================
    // 階層構造の起動（agents/ モジュールへの委譲）
    // =========================================================================

    public async resumeSessions(): Promise<void> {
        return AgentStartup.resumeSessions(this.createAgentContext());
    }

    private async checkExistingSessionAndPrompt(agentId: string, agentName: string): Promise<'new' | 'resume' | 'cancel'> {
        return AgentStartup.checkExistingSessionAndPrompt(this.createAgentContext(), agentId, agentName);
    }

    public async startButler(): Promise<void> {
        return AgentLifecycle.startButler(this.createAgentContext());
    }

    public async startChiefMaid(): Promise<void> {
        return AgentLifecycle.startChiefMaid(this.createAgentContext());
    }

    public async startSelectedMaids(): Promise<void> {
        return AgentLifecycle.startSelectedMaids(this.createAgentContext());
    }

    public async killPick(): Promise<void> {
        return AgentLifecycle.killPick(this.createAgentContext());
    }

    public async restartPick(): Promise<void> {
        return AgentLifecycle.restartPick(this.createAgentContext());
    }

    public async startAllAgents(): Promise<void> {
        return AgentLifecycle.startAllAgents(this.createAgentContext());
    }

    private async ensureInitialized(): Promise<boolean> {
        return AgentStartup.ensureInitialized(this.createAgentContext());
    }

    private async ensureTmuxAvailable(): Promise<boolean> {
        return AgentStartup.ensureTmuxAvailable(this.createAgentContext());
    }

    private async ensureWslAvailable(): Promise<boolean> {
        const ctx = this.createSetupContext();
        if (!ctx) {
            this.log('[WSL] SetupContext未初期化のためWSL確認をスキップ');
            return false;
        }
        return WslSetup.ensureWslAvailable(ctx);
    }

    private async installTmux(): Promise<boolean> {
        const terminalFactory = ENV.getTerminalFactory(false);
        const terminal = terminalFactory.createInstallTerminal('📦 tmux インストール');
        terminal.show();

        // OS別のインストールコマンドを決定
        let installCmd: string;
        if (ENV.isMacOS()) {
            installCmd = 'brew install tmux';
        } else if (ENV.platform === 'linux') {
            installCmd = 'if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y tmux; ' +
                'elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y tmux; ' +
                'elif command -v pacman >/dev/null 2>&1; then sudo pacman -S --noconfirm tmux; ' +
                'elif command -v zypper >/dev/null 2>&1; then sudo zypper install -y tmux; ' +
                'else echo "対応するパッケージマネージャが見つかりません"; fi';
        } else {
            installCmd = 'sudo apt-get update && sudo apt-get install -y tmux';
        }
        terminal.sendText(installCmd);

        const result = await vscode.window.showInformationMessage(
            'tmuxのインストールを開始しました。\n' +
            'インストールが完了したら「完了」を押してください。\n' +
            '（sudoパスワードの入力が必要な場合があります）',
            '完了',
            'キャンセル'
        );

        if (result === '完了') {
            if (isTmuxAvailable()) {
                const version = getTmuxVersion();
                vscode.window.showInformationMessage(`✅ tmuxのインストールが完了しました: ${version}`);
                return true;
            } else {
                vscode.window.showErrorMessage('tmuxのインストールに失敗したようです。手動でインストールしてください。');
                return false;
            }
        }

        return false;
    }

    private showTmuxInstallInstructions(): void {
        this.log('=== tmux インストール方法 ===');
        this.log('');

        const terminalFactory = ENV.getTerminalFactory(false);
        terminalFactory.showMultiplexerInstallInstructions(this.outputChannel);

        this.log('');
        this.log('インストール後、再度Callコマンドを実行してください。');
        this.outputChannel.show();
    }

    private async checkSessionCountWarning(): Promise<void> {
        return AgentStartup.checkSessionCountWarning(this.createAgentContext());
    }

    // =========================================================================
    // タスク送信・通知（agents/ モジュールへの委譲）
    // =========================================================================

    public async sendTaskToButler(taskDescription: string): Promise<void> {
        return AgentComm.sendTaskToButler(this.createAgentContext(), taskDescription);
    }

    public async notifyChief(message: string): Promise<void> {
        return AgentComm.notifyChief(this.createAgentContext(), message);
    }

    public async notifyMaid(maidId: string, message: string): Promise<void> {
        return AgentComm.notifyMaid(this.createAgentContext(), maidId, message);
    }

    // =========================================================================
    // Claude Code 起動（agents/ モジュールへの委譲）
    // =========================================================================

    public startClaudeOnAgent(agentId: string): void {
        AgentStartup.startClaudeOnAgent(this.createAgentContext(), agentId);
    }

    public async startClaudeOnAllAgents(): Promise<void> {
        return AgentStartup.startClaudeOnAllAgents(this.createAgentContext());
    }

    // =========================================================================
    // ファイル監視（events/file-watcher.ts への委譲）
    // =========================================================================

    public startWatchingFiles(silent: boolean = false): void {
        FileWatcher.startWatchingFiles(
            createFileWatcherContext(this.asState()),
            this.fileWatcherState,
            silent
        );
    }

    public stopWatchingFiles(): void {
        FileWatcher.stopWatchingFiles(
            createFileWatcherContext(this.asState()),
            this.fileWatcherState
        );
    }

    // =========================================================================
    // 通知システム（エージェント間通信）
    // =========================================================================

    // =========================================================================
    // 通知ログ（直接send-keys方式への移行により、pending.json処理は廃止）
    // 通知履歴は .maid-agent/system/data/notifications/history.log に記録される
    // =========================================================================

    /**
     * 通知履歴を表示（デバッグ用）
     * 直接send-keys方式では、通知履歴は history.log に記録される
     */
    public async manualProcessNotifications(): Promise<void> {
        this.log('[デバッグ] 通知履歴を表示');

        if (!this.maidAgentPath) {
            vscode.window.showErrorMessage('maidAgentPath が設定されていません');
            return;
        }

        const historyPath = path.join(this.maidAgentPath, NOTIFICATIONS_SUBDIR, 'history.log');
        if (!fs.existsSync(historyPath)) {
            vscode.window.showWarningMessage('history.log が存在しません（まだ通知が送信されていません）');
            return;
        }

        try {
            const content = fs.readFileSync(historyPath, 'utf-8');
            const lines = content.trim().split('\n');
            const recentLines = lines.slice(-20);  // 最新20件を表示

            this.log(`[通知履歴] 最新${recentLines.length}件:`);
            recentLines.forEach(line => {
                this.log(`  ${line}`);
            });

            this.outputChannel.show();
            vscode.window.showInformationMessage(`通知履歴: ${lines.length}件（最新20件を出力パネルに表示）`);
        } catch (error) {
            vscode.window.showErrorMessage(`エラー: ${error}`);
        }
    }

    /**
     * 現在の状態を表示（デバッグ用）
     */
    public showDebugStatus(): void {
        const agentList = Array.from(this.agents.entries()).map(([id, agent]) => {
            return `  - ${id}: ${agent.name} (${agent.role}, ${agent.status})`;
        }).join('\n');

        // 通知履歴の件数を取得
        let notifyCount = 0;
        if (this.maidAgentPath) {
            const historyPath = path.join(this.maidAgentPath, NOTIFICATIONS_SUBDIR, 'history.log');
            if (fs.existsSync(historyPath)) {
                try {
                    const content = fs.readFileSync(historyPath, 'utf-8');
                    notifyCount = content.trim().split('\n').filter(l => l.length > 0).length;
                } catch { /* ignore */ }
            }
        }

        const status = `
=== Maid Agent デバッグ情報 ===
maidAgentPath: ${this.maidAgentPath || '未設定'}
tmuxManager: ${this.tmuxManager ? '初期化済み' : '未初期化'}
tmuxSessionName: ${this.tmuxSessionName || '未設定'}
通知方式: 直接send-keys（pending.json廃止）
通知履歴: ${notifyCount}件
fileWatcher: ${this.fileWatcherState.fileWatcher ? '稼働中' : '停止'}

登録済みエージェント (${this.agents.size}):
${agentList || '  (なし)'}
`;
        this.log(status);

        // ポップアップでも表示
        vscode.window.showInformationMessage(
            `エージェント数: ${this.agents.size}, 通知履歴: ${notifyCount}件`,
            '出力パネルを開く'
        ).then(choice => {
            if (choice === '出力パネルを開く') {
                this.outputChannel.show();
            }
        });
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
    // ユーザー入力（commands/user-commands.ts への委譲）
    // =========================================================================

    public async promptAndSendToButler(): Promise<void> {
        return UserCommands.promptAndSendToButler(createUserCommandContext(this.asState()));
    }

    public async promptAndSendToMaid(): Promise<void> {
        return UserCommands.promptAndSendToMaid(createUserCommandContext(this.asState()));
    }

    // =========================================================================
    // クリーンアップ
    // =========================================================================

    /**
     * クリーンアップダイアログを表示
     */
    public async showCleanup(): Promise<void> {
        return Cleanup.showCleanupQuickPick(
            this.workspaceRoot,
            (msg: string) => this.log(msg)
        );
    }

    /**
     * ランタイムモードを変更（Windows環境のみ）
     * コマンドパレットからWSL/psmuxモードを切り替える
     */
    public async setRuntimeMode(): Promise<void> {
        // Windows環境チェック
        if (!ENV.isWindowsNative()) {
            vscode.window.showInformationMessage('ランタイムモード変更はWindows環境でのみ利用可能です');
            return;
        }

        // setup-ui.ts の showRuntimeModeSelection を使用
        const { showRuntimeModeSelection } = await import('./setup/setup-ui');
        const selection = await showRuntimeModeSelection();

        if (!selection) {
            this.log('[RuntimeMode] ユーザーがキャンセル');
            return;
        }

        // 設定を保存
        const ctx = this.createSetupContext();
        if (!ctx) {
            vscode.window.showErrorMessage('設定の保存に失敗しました。ワークスペースを開いてください。');
            return;
        }

        const { saveRuntimeMode, getSavedRuntimeMode } = await import('./setup/global-init');
        const previousMode = getSavedRuntimeMode();

        // 同じモードが選択された場合
        if (previousMode === selection.mode) {
            vscode.window.showInformationMessage(`現在既に ${selection.mode === 'wsl' ? 'WSL' : 'Windows直接実行'} モードです`);
            return;
        }

        // 設定を保存
        saveRuntimeMode(selection.mode, ctx);
        // ENV 内部状態を更新
        ENV.setRuntimeMode(selection.mode);
        this.log(`[RuntimeMode] モード変更: ${previousMode || '未設定'} → ${selection.mode}`);

        // サーバー切替（旧サーバー停止 → 新サーバー起動）
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔄 サーバーを切り替え中...',
            cancellable: false
        }, async () => {
            try {
                const { switchServerForMultiplexer } = await import('./utils/server-manager');
                // runtime.mode から multiplexer.type を推定
                const multiplexerType = selection.mode === 'wsl' ? 'tmux' : 'psmux';
                const switched = await switchServerForMultiplexer(multiplexerType, ctx);
                if (switched) {
                    this.log('[RuntimeMode] サーバー切替完了');
                } else {
                    this.log('[RuntimeMode] サーバー起動に失敗（手動起動が必要かもしれません）');
                }
            } catch (error) {
                this.log(`[RuntimeMode] サーバー切替失敗: ${error}`);
                throw error;
            }
        });

        const modeLabel = selection.mode === 'wsl' ? 'WSL (tmux)' : 'Windows直接実行 (psmux)';

        // MultiplexerFactory をリフレッシュ
        this.refreshMultiplexerFactory();

        // 新しいモードに必要なツールがインストールされているか確認
        if (selection.mode === 'windows-native') {
            const { checkPsmuxInstalled } = await import('./setup/requirements-analyzer');
            if (!checkPsmuxInstalled()) {
                const choice = await vscode.window.showWarningMessage(
                    `⚠️ psmux がインストールされていません。\n\nWindows直接実行モードには psmux が必要です。`,
                    'Init Global を実行',
                    '後で手動でインストール'
                );
                if (choice === 'Init Global を実行') {
                    await this.initializeGlobalSettings();
                    return;
                }
            }
        }

        vscode.window.showInformationMessage(`✅ ランタイムモードを ${modeLabel} に変更しました`);
    }

    /**
     * ワークスペースのマルチプレクサタイプを切り替える
     * settings.yaml の multiplexer.type を変更
     */
    public async switchMultiplexer(): Promise<void> {
        if (!this.maidAgentPath) {
            vscode.window.showErrorMessage('ワークスペースが初期化されていません。Init を実行してください。');
            return;
        }

        // 現在の設定を取得
        const currentType = this.settings?.multiplexer?.type || 'auto';
        const currentLabel = currentType === 'psmux' ? 'Windows (psmux)'
            : currentType === 'tmux' ? 'WSL/Unix (tmux)'
            : '自動検出';

        // 選択肢を表示
        const selection = await vscode.window.showQuickPick([
            { label: '$(terminal) WSL/Unix (tmux)', value: 'tmux' as const, description: 'WSL または Unix 環境で tmux を使用' },
            { label: '$(window) Windows (psmux)', value: 'psmux' as const, description: 'Windows 直接実行で psmux を使用' },
            { label: '$(gear) 自動検出', value: 'auto' as const, description: 'グローバル設定に従う' },
        ], {
            title: `マルチプレクサ切替（現在: ${currentLabel}）`,
            placeHolder: 'このワークスペースで使用するマルチプレクサを選択',
        });

        if (!selection) {
            return;
        }

        // 同じ設定の場合
        if (selection.value === currentType) {
            vscode.window.showInformationMessage(`既に ${currentLabel} に設定されています`);
            return;
        }

        // settings.yaml に保存
        const { saveMultiplexerType } = await import('./utils/settings-loader');
        const saved = saveMultiplexerType(this.maidAgentPath, selection.value);

        if (!saved) {
            vscode.window.showErrorMessage('設定の保存に失敗しました');
            return;
        }

        // 設定を再読み込み
        this.settings = loadSettings(this.maidAgentPath);

        // MultiplexerFactory を再作成
        this.refreshMultiplexerFactory();

        const newLabel = selection.value === 'psmux' ? 'Windows (psmux)'
            : selection.value === 'tmux' ? 'WSL/Unix (tmux)'
            : '自動検出';

        vscode.window.showInformationMessage(`✅ マルチプレクサを ${newLabel} に切り替えました`);
        this.log(`[Multiplexer] 切替: ${currentType} → ${selection.value}`);
    }

    /**
     * ターミナルが閉じられた時の処理
     */
    public handleTerminalClosed(terminal: vscode.Terminal): void {
        // tmuxビューアターミナルが閉じられた場合
        if (terminal === this.tmuxViewerTerminal) {
            this.tmuxViewerTerminal = undefined;
            this.log('[tmux] ビューアターミナルが閉じられました');
            // 注: tmuxセッション自体は継続中（バックグラウンドで動作）
            return;
        }
    }

    public killAgent(agentId: string): void {
        AgentLifecycle.killAgent(this.createAgentContext(), agentId);
    }

    public dispose(): void {
        // tmuxセッションを終了（オプション - ユーザーが選択できるようにしても良い）
        // this.tmuxManager?.killSession();

        // イベント監視のクリーンアップ（モジュール分離）
        TmuxWatcher.disposeTmuxWatcher(this.tmuxWatcherState);
        FileWatcher.disposeFileWatcher(this.fileWatcherState);

        // ステータスバー通知タイマーを停止
        if (this.statusBarResetTimeout) {
            clearTimeout(this.statusBarResetTimeout);
        }

        // ビューアターミナルを閉じる
        this.tmuxViewerTerminal?.dispose();

        // その他のリソースをクリーンアップ
        this.outputChannel.dispose();
        this.controllerPanel?.dispose();
        this.dashboardPanel?.dispose();
    }

    /**
     * 全セッションを終了
     */
    public killAll(): void {
        if (this.tmuxManager) {
            this.tmuxManager.killSession();
            this.agents.clear();
            this.log('[tmux] 全セッションを終了しました');
            vscode.window.showInformationMessage('🎩 Maid Agent 全セッションを終了しました');
        }
    }
}
