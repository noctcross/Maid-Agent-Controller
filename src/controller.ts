import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, SetupContext, AgentContext, ViewContext, CompletedViewState } from './types';
import { MAID_AGENT_DIR, NOTIFICATIONS_SUBDIR } from './constants';
import { CURRENT_ENV, isTmuxAvailable, getTmuxVersion } from './utils/environment';
import { getGlobalMaidAgentPath, getSessionNameFromPath, getOrderedMaids } from './utils/helpers';
import { TmuxManager } from './tmux/tmux-manager';
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
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private agentPanelProvider: AgentPanelProvider | undefined;
    private tmuxManager: TmuxManager | undefined;
    private tmuxViewerTerminal: vscode.Terminal | undefined;  // tmuxセッション表示用
    private tmuxSessionName: string = '';  // ワークスペース固有のセッション名
    private tmuxWindowPollingInterval: NodeJS.Timeout | undefined;  // tmuxウィンドウ監視用
    private lastDetectedAgentId: string | null = null;  // 前回検出したエージェントID
    private statusBarItem: vscode.StatusBarItem | undefined;  // ステータスバー通知用
    private statusBarResetTimeout: NodeJS.Timeout | undefined;  // ステータスバー表示リセット用
    private dashboardPanel: vscode.WebviewPanel | undefined;
    private dashboardInitialized = false;
    private dashboardConsecutiveFailures = 0;  // ダッシュボード接続の連続失敗回数
    private completedViewState: CompletedViewState = { limit: 10, offset: 0, reviewed: undefined, starred: undefined, hash: '', completedSortField: undefined };
    private reportViewerPanel: vscode.WebviewPanel | undefined;
    private settings: MaidAgentSettings | undefined;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Maid Agent');
    }

    public setContext(context: vscode.ExtensionContext): void {
        this.context = context;
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (this.workspaceRoot) {
            this.maidAgentPath = path.join(this.workspaceRoot, MAID_AGENT_DIR);
            // ワークスペースパスからセッション名を生成（ディレクトリ名 + 短いハッシュ）
            this.tmuxSessionName = getSessionNameFromPath(this.workspaceRoot);
            this.tmuxManager = new TmuxManager(this.tmuxSessionName, this.workspaceRoot);
            // settings.yaml を読み込み
            this.settings = loadSettings(this.maidAgentPath);
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

    /**
     * tmuxの現在のウィンドウ名からエージェントIDを取得
     */
    private getCurrentTmuxWindowAgent(): string | null {
        if (!this.tmuxManager || !this.tmuxSessionName) {
            return null;
        }

        try {
            // Windows環境では wsl tmux を使用
            const tmuxCmd = CURRENT_ENV === 'windows-native' ? 'wsl tmux' : 'tmux';
            const result = require('child_process').execSync(
                `${tmuxCmd} display-message -t "${this.tmuxSessionName}" -p "#{window_name}"`,
                { encoding: 'utf-8', timeout: 1000 }
            ).trim();

            // ウィンドウ名がエージェントIDと一致するか確認
            if (this.agents.has(result)) {
                return result;
            }

            // デバッグ: ウィンドウ名が見つかったが登録エージェントに存在しない場合
            // (一時的なログ - 安定したら削除可能)
            const registeredAgents = Array.from(this.agents.keys()).join(', ');
            this.log(`[AgentPanel] ウィンドウ '${result}' は登録エージェントに存在しません (登録: ${registeredAgents || 'なし'})`);
        } catch {
            // tmuxコマンドが失敗した場合は無視（ポーリング中は頻繁に呼ばれるためログ省略）
        }
        return null;
    }

    // 現在のエージェントを設定（パネル更新用）
    public setCurrentAgentFromTerminal(terminal: vscode.Terminal | undefined): void {
        if (!this.agentPanelProvider) return;

        if (!terminal) {
            this.stopTmuxWindowPolling();
            this.agentPanelProvider.setCurrentAgent(null);
            return;
        }

        // まず従来の方式を試す
        let agentId = this.getAgentIdFromTerminal(terminal);

        // tmuxビューアターミナルの場合、tmuxのウィンドウ名から特定 + ポーリング開始
        const isTmuxViewer = terminal === this.tmuxViewerTerminal;
        const terminalName = terminal.name;

        if (!agentId && isTmuxViewer) {
            agentId = this.getCurrentTmuxWindowAgent();
            this.startTmuxWindowPolling();
        } else if (!agentId && terminalName.includes('Maid Agent')) {
            // ターミナル名でtmuxビューアを判定（参照比較の代替）
            this.log(`[AgentPanel] tmuxビューア検出（名前ベース）: ${terminalName}`);
            agentId = this.getCurrentTmuxWindowAgent();
            this.startTmuxWindowPolling();
        } else {
            this.stopTmuxWindowPolling();
        }

        this.agentPanelProvider.setCurrentAgent(agentId);
    }

    /**
     * tmuxウィンドウのポーリングを開始（500msごとにチェック）
     */
    private startTmuxWindowPolling(): void {
        if (this.tmuxWindowPollingInterval) return; // 既に実行中

        this.tmuxWindowPollingInterval = setInterval(() => {
            const currentAgentId = this.getCurrentTmuxWindowAgent();

            // 変更があった場合のみ更新
            if (currentAgentId !== this.lastDetectedAgentId) {
                this.log(`[AgentPanel] tmuxウィンドウ変更検出: ${this.lastDetectedAgentId} → ${currentAgentId}`);
                this.lastDetectedAgentId = currentAgentId;
                if (this.agentPanelProvider) {
                    this.agentPanelProvider.setCurrentAgent(currentAgentId);
                }
            }
        }, 500);

        this.log('[tmux] ウィンドウ監視ポーリングを開始');
    }

    /**
     * tmuxウィンドウのポーリングを停止
     */
    private stopTmuxWindowPolling(): void {
        if (this.tmuxWindowPollingInterval) {
            clearInterval(this.tmuxWindowPollingInterval);
            this.tmuxWindowPollingInterval = undefined;
            this.lastDetectedAgentId = null;
            this.log('[tmux] ウィンドウ監視ポーリングを停止');
        }
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
            getRolePrompt: (agentId, role, maidName?) => this.getRolePrompt(agentId, role, maidName),
            launchClaudeWithRole: (agentId, role, maidName?) => this.launchClaudeWithRole(agentId, role, maidName),
            ensureInitialized: () => this.ensureInitialized(),
            checkExistingSessionAndPrompt: (agentId, agentName) => this.checkExistingSessionAndPrompt(agentId, agentName),
            checkSessionCountWarning: () => this.checkSessionCountWarning(),
            ensureMcpServerRunning: () => this.ensureMcpServerRunning(),
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

    private getRolePrompt(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string {
        return AgentStartup.getRolePrompt(this.createAgentContext(), agentId, role, maidName);
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

    private async ensureMcpServerRunning(): Promise<void> {
        return AgentStartup.ensureMcpServerRunning(this.createAgentContext());
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
    // ファイル監視
    // =========================================================================

    public startWatchingFiles(silent: boolean = false): void {
        if (!this.maidAgentPath) return;

        // 既に監視中なら何もしない
        if (this.fileWatcher) {
            if (!silent) {
                vscode.window.showInformationMessage('📁 ファイル監視・通知システムは既に動作中です');
            }
            return;
        }

        // queue/*.yaml と reports/*.md を監視
        const pattern = new vscode.RelativePattern(
            this.maidAgentPath,
            '{queue/*.yaml,reports/*.md}'
        );

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidChange((uri) => {
            const fileName = path.basename(uri.fsPath);
            this.log(`[ファイル変更] ${fileName}`);
            this.updateController();


            // reports/*.md が更新されたらメイド長への報告チェック
            const reportsDir = `${path.sep}reports${path.sep}`;
            if (uri.fsPath.includes(reportsDir) && fileName.endsWith('.md') && fileName !== '.gitkeep') {
                const maidName = fileName.replace('.md', '');
                this.checkMaidReportToChief(maidName);
            }
        });

        this.context?.subscriptions.push(this.fileWatcher);
        this.log('[ファイル監視] 開始');

        // 注: エージェント間通知は直接 tmux send-keys で行われるため、
        // pending.json の監視は不要になりました

        if (!silent) {
            vscode.window.showInformationMessage('📁 ファイル監視を開始しました');
        }
    }


    // 報告チェック用のタイマーを管理
    private pendingReportChecks: Map<string, NodeJS.Timeout> = new Map();

    /**
     * メイドがメイド長に報告したかチェック
     * reports/*.md 更新後、5秒以内にchief宛の通知がなければリマインド
     */
    private checkMaidReportToChief(maidName: string): void {
        // 既存のタイマーがあればクリア（連続更新対応）
        const existingTimer = this.pendingReportChecks.get(maidName);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        this.log(`[報告チェック] ${maidName} のレポート更新を検知、5秒後にチェック`);

        // 5秒後にチェック
        const timer = setTimeout(async () => {
            try {
            this.pendingReportChecks.delete(maidName);

            // 通知履歴ログを確認
            if (!this.maidAgentPath) return;

            const historyPath = path.join(this.maidAgentPath, NOTIFICATIONS_SUBDIR, 'history.log');
            let hasNotifiedChief = false;

            try {
                if (fs.existsSync(historyPath)) {
                    const content = fs.readFileSync(historyPath, 'utf-8');
                    const lines = content.trim().split('\n');

                    // 直近30秒以内にこのメイドからchiefへの通知があるかチェック
                    // ログ形式: [2025-01-29 12:34:56] sender → target: message
                    const now = Date.now();
                    const thirtySecondsAgo = now - 30000;

                    const pattern = new RegExp(`^\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\] ${maidName} → chief:`);

                    for (const line of lines.reverse()) {  // 新しいものから確認
                        const match = line.match(pattern);
                        if (match) {
                            const notifyTime = new Date(match[1]).getTime();
                            if (notifyTime > thirtySecondsAgo) {
                                hasNotifiedChief = true;
                                break;
                            }
                            // 30秒より古い通知なら、それ以前は確認不要
                            break;
                        }
                    }
                }
            } catch {
                // パースエラーなどは無視
            }

            if (!hasNotifiedChief) {
                // メイドがアクティブかチェック
                const maid = this.agents.get(maidName);
                if (maid) {
                    this.log(`[報告チェック] ${maidName} がメイド長への報告を忘れている可能性`);

                    // リマインドを送信
                    const reminder = `レポートを更新したようですが、メイド長への報告はお済みですか？\n完了した場合は .maid-agent/system/bin/maid-notify chief "タスク完了の報告" を実行してください。`;
                    await this.sendMessageToAgent(maidName, reminder);

                    this.log(`[報告チェック] ${maidName} にリマインドを送信しました`);
                }
            } else {
                this.log(`[報告チェック] ${maidName} は正常にメイド長へ報告済み`);
            }
            } catch (error) {
                this.log(`[報告チェック] ${maidName} のチェック中にエラー: ${error}`);
            }
        }, 5000);

        this.pendingReportChecks.set(maidName, timer);
    }

    public stopWatchingFiles(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
        this.log('[ファイル監視] 停止');
        vscode.window.showInformationMessage('📁 ファイル監視・通知システムを停止しました');
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
fileWatcher: ${this.fileWatcher ? '稼働中' : '停止'}

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
    // ユーザー入力
    // =========================================================================

    public async promptAndSendToButler(): Promise<void> {
        const command = await vscode.window.showInputBox({
            prompt: '執事への指令を入力してください、ご主人様',
            placeHolder: '例: このプロジェクトを分析して改善点を洗い出してください'
        });

        if (command) {
            await this.sendTaskToButler(command);
        }
    }

    public async promptAndSendToMaid(): Promise<void> {
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
     * クリーンアップダイアログを表示
     */
    public async showCleanup(): Promise<void> {
        return Cleanup.showCleanupQuickPick(
            this.workspaceRoot,
            (msg: string) => this.log(msg)
        );
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

        // ポーリングを停止
        this.stopTmuxWindowPolling();

        // ステータスバー通知タイマーを停止
        if (this.statusBarResetTimeout) {
            clearTimeout(this.statusBarResetTimeout);
        }

        // 報告チェックタイマーを全クリア
        for (const timer of this.pendingReportChecks.values()) {
            clearTimeout(timer);
        }
        this.pendingReportChecks.clear();

        // ビューアターミナルを閉じる
        this.tmuxViewerTerminal?.dispose();

        // その他のリソースをクリーンアップ
        this.outputChannel.dispose();
        this.controllerPanel?.dispose();
        this.dashboardPanel?.dispose();
        this.fileWatcher?.dispose();
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
