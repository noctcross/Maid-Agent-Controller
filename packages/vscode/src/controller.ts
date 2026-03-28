import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, SetupContext, AgentContext, ViewContext, CompletedViewState } from './types';
import { MAID_AGENT_DIR, NOTIFICATIONS_SUBDIR } from './constants';
import { CURRENT_ENV, isTmuxAvailable, getTmuxVersion } from './utils/environment';
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

    public setAgentPanelProvider(provider: AgentPanelProvider): void {
        this.agentPanelProvider = provider;
        // ログ出力用に outputChannel を共有
        provider.setOutputChannel(this.outputChannel);
    }

    public setStatusBarItem(item: vscode.StatusBarItem): void {
        this.statusBarItem = item;
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
    // tmuxウィンドウ監視（events/tmux-watcher.ts への委譲）
    // =========================================================================

    private createTmuxWatcherContext(): TmuxWatcher.TmuxWatcherContext {
        return {
            agents: this.agents,
            tmuxManager: this.tmuxManager,
            tmuxSessionName: this.tmuxSessionName,
            tmuxViewerTerminal: this.tmuxViewerTerminal,
            agentPanelProvider: this.agentPanelProvider,
            log: (msg: string) => this.log(msg),
        };
    }

    // 現在のエージェントを設定（パネル更新用）
    public setCurrentAgentFromTerminal(terminal: vscode.Terminal | undefined): void {
        TmuxWatcher.setCurrentAgentFromTerminal(
            this.createTmuxWatcherContext(),
            this.tmuxWatcherState,
            terminal,
            (t: vscode.Terminal) => this.getAgentIdFromTerminal(t)
        );
    }

    private stopTmuxWindowPolling(): void {
        TmuxWatcher.stopTmuxWindowPolling(
            this.createTmuxWatcherContext(),
            this.tmuxWatcherState
        );
    }

    // =========================================================================
    // 初期化（setup/ モジュールへの委譲）
    // =========================================================================

    private createSetupContext(): SetupContext | undefined {
        if (!this.workspaceRoot || !this.maidAgentPath || !this.context) {
            this.log('[setup] SetupContext生成不可: 必要なプロパティが未初期化');
            return undefined;
        }
        return {
            workspaceRoot: this.workspaceRoot,
            maidAgentPath: this.maidAgentPath,
            globalMaidAgentPath: getGlobalMaidAgentPath(),
            extensionPath: this.context.extensionPath,
            outputChannel: this.outputChannel,
            log: (msg: string) => this.log(msg),
        };
    }

    private createAgentContext(): AgentContext {
        const controller = this;
        return {
            // ─── State (getter/setter proxies for mutable properties) ───
            agents: this.agents,
            get workspaceRoot() { return controller.workspaceRoot; },
            get maidAgentPath() { return controller.maidAgentPath; },
            set maidAgentPath(v) { controller.maidAgentPath = v; },
            outputChannel: this.outputChannel,
            get context() { return controller.context; },
            get tmuxManager() { return controller.tmuxManager; },
            set tmuxManager(v) { controller.tmuxManager = v; },
            tmuxSessionName: this.tmuxSessionName,
            get tmuxViewerTerminal() { return controller.tmuxViewerTerminal; },
            set tmuxViewerTerminal(v) { controller.tmuxViewerTerminal = v; },
            get agentPanelProvider() { return controller.agentPanelProvider; },
            get statusBarItem() { return controller.statusBarItem; },
            get statusBarResetTimeout() { return controller.statusBarResetTimeout; },
            set statusBarResetTimeout(v) { controller.statusBarResetTimeout = v; },
            get settings() { return controller.settings; },
            multiplexerFactory: this.multiplexerFactory,

            // ─── Logger ───
            log: (msg: string) => this.log(msg),

            // ─── Controller methods (NOT in E4, stay in controller) ───
            updateController: () => this.updateController(),
            updateAgentPanel: () => this.updateAgentPanel(),
            delay: (ms: number) => this.delay(ms),
            startWatchingFiles: (silent?: boolean) => this.startWatchingFiles(silent),
            initializeWorkspace: () => this.initializeWorkspace(),
            installTmux: () => this.installTmux(),
            showTmuxInstallInstructions: () => this.showTmuxInstallInstructions(),
            createSetupContext: () => this.createSetupContext(),
            ensureWslAvailable: () => this.ensureWslAvailable(),

            // ─── Cross-module E4 methods (delegated through controller) ───
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
        };
    }

    private createViewContext(): ViewContext {
        const controller = this;
        return {
            // ─── State ───
            agents: this.agents,
            get workspaceRoot() { return controller.workspaceRoot; },
            get maidAgentPath() { return controller.maidAgentPath; },
            logs: this.logs,
            get context() { return controller.context; },

            // ─── Panel State (mutable via getter/setter) ───
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
            get statusBarItem() { return controller.statusBarItem; },
            get statusBarResetTimeout() { return controller.statusBarResetTimeout; },
            set statusBarResetTimeout(v) { controller.statusBarResetTimeout = v; },

            // ─── Logger ───
            log: (msg: string) => this.log(msg),

            // ─── Controller methods (NOT in E5) ───
            promptAndSendToButler: () => this.promptAndSendToButler(),

            // ─── Cross-module E5 methods ───
            showController: () => this.showController(),
            showDashboard: () => this.showDashboard(),
            updateController: () => this.updateController(),
            updateDashboard: () => this.updateDashboard(),
            openMaidAgentFile: (filename: string) => this.openMaidAgentFile(filename),
            openFileWithPreview: (filePath: string) => this.openFileWithPreview(filePath),
            openDashboardInBrowser: () => this.openDashboardInBrowser(),
            showStatusBarNotification: (icon: string, message: string) => this.showStatusBarNotification(icon, message),
        };
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
        return WorkspaceInit.initializeGlobalSettings(ctx);
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
        const terminal = vscode.window.createTerminal({
            name: '📦 tmux インストール',
            shellPath: CURRENT_ENV === 'windows-native' ? 'wsl.exe' : undefined
        });
        terminal.show();

        // OS別のインストールコマンドを決定
        let installCmd: string;
        if (CURRENT_ENV === 'macos') {
            // macOS: Homebrew使用
            installCmd = 'brew install tmux';
        } else if (CURRENT_ENV === 'linux') {
            // Linux: パッケージマネージャを自動検出
            installCmd = 'if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y tmux; ' +
                'elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y tmux; ' +
                'elif command -v pacman >/dev/null 2>&1; then sudo pacman -S --noconfirm tmux; ' +
                'elif command -v zypper >/dev/null 2>&1; then sudo zypper install -y tmux; ' +
                'else echo "対応するパッケージマネージャが見つかりません"; fi';
        } else {
            // Windows (WSL): apt-get使用
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

        if (CURRENT_ENV === 'windows-native') {
            this.log('【Windows + WSL環境】');
            this.log('1. WSLターミナルを開く');
            this.log('2. 以下のコマンドを実行:');
            this.log('   sudo apt-get update');
            this.log('   sudo apt-get install -y tmux');
            this.log('');
            this.log('※ WSLがインストールされていない場合:');
            this.log('   PowerShellを管理者権限で開き、以下を実行:');
            this.log('   wsl --install');
        } else if (CURRENT_ENV === 'macos') {
            this.log('【macOS環境】');
            this.log('Homebrewを使用:');
            this.log('   brew install tmux');
        } else {
            this.log('【Linux環境】');
            this.log('Ubuntu/Debian:');
            this.log('   sudo apt-get install tmux');
            this.log('');
            this.log('Fedora/RHEL:');
            this.log('   sudo dnf install tmux');
        }

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

    private createFileWatcherContext(): FileWatcher.FileWatcherContext {
        return {
            maidAgentPath: this.maidAgentPath,
            agents: this.agents,
            context: this.context,
            log: (msg: string) => this.log(msg),
            updateController: () => this.updateController(),
            sendMessageToAgent: (agentId: string, message: string) => this.sendMessageToAgent(agentId, message),
        };
    }

    public startWatchingFiles(silent: boolean = false): void {
        FileWatcher.startWatchingFiles(
            this.createFileWatcherContext(),
            this.fileWatcherState,
            silent
        );
    }

    public stopWatchingFiles(): void {
        FileWatcher.stopWatchingFiles(
            this.createFileWatcherContext(),
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

    private createUserCommandContext(): UserCommands.UserCommandContext {
        return {
            agents: this.agents,
            sendTaskToButler: (taskDescription: string) => this.sendTaskToButler(taskDescription),
            sendMessageToAgent: (agentId: string, message: string) => this.sendMessageToAgent(agentId, message),
        };
    }

    public async promptAndSendToButler(): Promise<void> {
        return UserCommands.promptAndSendToButler(this.createUserCommandContext());
    }

    public async promptAndSendToMaid(): Promise<void> {
        return UserCommands.promptAndSendToMaid(this.createUserCommandContext());
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
        if (CURRENT_ENV !== 'windows-native') {
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
        this.log(`[RuntimeMode] モード変更: ${previousMode || '未設定'} → ${selection.mode}`);

        // サーバー再起動
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔄 サーバーを再起動中...',
            cancellable: false
        }, async () => {
            try {
                const { runShellCommand } = await import('./setup/pm2-setup');
                runShellCommand('pm2 restart maid-agent-messenger', { stdio: 'pipe' });
                this.log('[RuntimeMode] サーバー再起動完了');
            } catch (error) {
                this.log(`[RuntimeMode] サーバー再起動失敗: ${error}`);
                throw error;
            }
        });

        const modeLabel = selection.mode === 'wsl' ? 'WSL (tmux)' : 'Windows直接実行 (psmux)';
        vscode.window.showInformationMessage(`✅ ランタイムモードを ${modeLabel} に変更しました`);
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
