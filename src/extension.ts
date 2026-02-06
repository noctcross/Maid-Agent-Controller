import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, exec } from 'child_process';
import { ExecutionEnvironment, Agent, MaidConfig, RuleModuleMeta, SkillMeta, SetupContext, AgentContext } from './types';
import { MAID_AGENT_DIR, GLOBAL_MAID_AGENT_DIR, TMUX_SESSION_PREFIX, MAIDS_MAP, DEFAULT_MAID_ORDER, MAIDS, AGENT_COLORS } from './constants';
import { CURRENT_ENV, detectEnvironment, windowsToWslPath, isTmuxAvailable, getTmuxVersion, isWslAvailable } from './utils/environment';
import { simpleMarkdownToHtml } from './utils/markdown';
import { getGlobalMaidAgentPath, hashString, getSessionNameFromPath, getOrderedMaids } from './utils/helpers';
import { TmuxManager } from './tmux/tmux-manager';
import { AgentPanelProvider } from './ui/agent-panel-provider';
import * as WorkspaceInit from './setup/workspace-initializer';
import * as WslSetup from './setup/wsl-setup';
import * as Pm2Setup from './setup/pm2-setup';
import * as RulesSkills from './setup/rules-skills';
import * as AgentLifecycle from './agents/agent-lifecycle';
import * as AgentComm from './agents/agent-communication';
import * as AgentStartup from './agents/agent-startup';

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
    private tmuxManager: TmuxManager | undefined;
    private tmuxViewerTerminal: vscode.Terminal | undefined;  // tmuxセッション表示用
    private tmuxSessionName: string = '';  // ワークスペース固有のセッション名
    private tmuxWindowPollingInterval: NodeJS.Timeout | undefined;  // tmuxウィンドウ監視用
    private lastDetectedAgentId: string | null = null;  // 前回検出したエージェントID
    private statusBarItem: vscode.StatusBarItem | undefined;  // ステータスバー通知用
    private statusBarResetTimeout: NodeJS.Timeout | undefined;  // ステータスバー表示リセット用

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Maid Agent');
    }

    setContext(context: vscode.ExtensionContext): void {
        this.context = context;
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (this.workspaceRoot) {
            this.maidAgentPath = path.join(this.workspaceRoot, MAID_AGENT_DIR);
            // ワークスペースパスからセッション名を生成（ディレクトリ名 + 短いハッシュ）
            this.tmuxSessionName = getSessionNameFromPath(this.workspaceRoot);
            this.tmuxManager = new TmuxManager(this.tmuxSessionName, this.workspaceRoot);
        }
    }

    /**
     * 現在のtmuxセッション名を取得
     */
    getTmuxSessionName(): string {
        return this.tmuxSessionName;
    }

    setAgentPanelProvider(provider: AgentPanelProvider): void {
        this.agentPanelProvider = provider;
        // ログ出力用に outputChannel を共有
        provider.setOutputChannel(this.outputChannel);
    }

    setStatusBarItem(item: vscode.StatusBarItem): void {
        this.statusBarItem = item;
    }

    /**
     * ステータスバーに一時的なメッセージを表示（5秒後に元に戻る）
     */
    private showStatusBarNotification(icon: string, message: string): void {
        if (!this.statusBarItem) return;

        // 既存のリセットタイマーをクリア
        if (this.statusBarResetTimeout) {
            clearTimeout(this.statusBarResetTimeout);
        }

        // ステータスバーを更新
        this.statusBarItem.text = `${icon} ${message}`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

        // 5秒後に元に戻す
        this.statusBarResetTimeout = setTimeout(() => {
            if (this.statusBarItem) {
                this.statusBarItem.text = '🎩 Controller';
                this.statusBarItem.backgroundColor = undefined;
            }
        }, 5000);
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
    setCurrentAgentFromTerminal(terminal: vscode.Terminal | undefined): void {
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

    private createSetupContext(): SetupContext {
        return {
            workspaceRoot: this.workspaceRoot!,
            maidAgentPath: this.maidAgentPath!,
            globalMaidAgentPath: getGlobalMaidAgentPath(),
            extensionPath: this.context!.extensionPath,
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

            // ─── Logger ───
            log: (msg: string) => this.log(msg),

            // ─── Controller methods (NOT in E4, stay in controller) ───
            updateDashboard: () => this.updateDashboard(),
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

    async initializeWorkspace(): Promise<boolean> {
        return WorkspaceInit.initializeWorkspace(this.createSetupContext());
    }

    async initializeGlobalSettings(): Promise<boolean> {
        return WorkspaceInit.initializeGlobalSettings(this.createSetupContext());
    }

    async promoteRuleToGlobal(): Promise<void> {
        return RulesSkills.promoteRuleToGlobal(
            this.createSetupContext(),
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

    openTmuxViewer(): void {
        AgentStartup.openTmuxViewer(this.createAgentContext());
    }

    createAgent(name: string, id: string, role: Agent['role'], emoji: string): Agent {
        return AgentLifecycle.createAgent(this.createAgentContext(), name, id, role, emoji);
    }

    sendToAgent(agentId: string, command: string): boolean {
        return AgentComm.sendToAgent(this.createAgentContext(), agentId, command);
    }

    async sendMessageToAgent(agentId: string, message: string): Promise<boolean> {
        return AgentComm.sendMessageToAgent(this.createAgentContext(), agentId, message);
    }

    captureAgentOutput(agentId: string, lines: number = 100): string {
        return AgentComm.captureAgentOutput(this.createAgentContext(), agentId, lines);
    }

    private getRolePrompt(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string {
        return AgentStartup.getRolePrompt(this.createAgentContext(), agentId, role, maidName);
    }

    async launchClaudeWithRole(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void> {
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

    async resumeSessions(): Promise<void> {
        return AgentStartup.resumeSessions(this.createAgentContext());
    }

    private async checkExistingSessionAndPrompt(agentId: string, agentName: string): Promise<'new' | 'resume' | 'cancel'> {
        return AgentStartup.checkExistingSessionAndPrompt(this.createAgentContext(), agentId, agentName);
    }

    async startButler(): Promise<void> {
        return AgentLifecycle.startButler(this.createAgentContext());
    }

    async startChiefMaid(): Promise<void> {
        return AgentLifecycle.startChiefMaid(this.createAgentContext());
    }

    async startSelectedMaids(): Promise<void> {
        return AgentLifecycle.startSelectedMaids(this.createAgentContext());
    }

    async startMaidsByCount(): Promise<void> {
        return AgentLifecycle.startMaidsByCount(this.createAgentContext());
    }

    async startMaidsByCountRandom(): Promise<void> {
        return AgentLifecycle.startMaidsByCountRandom(this.createAgentContext());
    }

    async startAllByCount(): Promise<void> {
        return AgentLifecycle.startAllByCount(this.createAgentContext());
    }

    async startAllByCountRandom(): Promise<void> {
        return AgentLifecycle.startAllByCountRandom(this.createAgentContext());
    }

    async startAllAgents(): Promise<void> {
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
        return WslSetup.ensureWslAvailable(this.createSetupContext());
    }

    private async installTmux(): Promise<boolean> {
        const terminal = vscode.window.createTerminal({
            name: '📦 tmux インストール',
            shellPath: CURRENT_ENV === 'windows-native' ? 'wsl.exe' : undefined
        });
        terminal.show();

        const installCmd = 'sudo apt-get update && sudo apt-get install -y tmux';
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

    async sendTaskToButler(taskDescription: string): Promise<void> {
        return AgentComm.sendTaskToButler(this.createAgentContext(), taskDescription);
    }

    async notifyChief(message: string): Promise<void> {
        return AgentComm.notifyChief(this.createAgentContext(), message);
    }

    async notifyMaid(maidId: string, message: string): Promise<void> {
        return AgentComm.notifyMaid(this.createAgentContext(), maidId, message);
    }

    // =========================================================================
    // Claude Code 起動（agents/ モジュールへの委譲）
    // =========================================================================

    startClaudeOnAgent(agentId: string): void {
        AgentStartup.startClaudeOnAgent(this.createAgentContext(), agentId);
    }

    async startClaudeOnAllAgents(): Promise<void> {
        return AgentStartup.startClaudeOnAllAgents(this.createAgentContext());
    }

    // =========================================================================
    // ファイル監視
    // =========================================================================

    startWatchingFiles(silent: boolean = false): void {
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
            this.updateDashboard();


            // reports/*.md が更新されたらメイド長への報告チェック
            if (uri.fsPath.includes('/reports/') && fileName.endsWith('.md') && fileName !== '.gitkeep') {
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
            this.pendingReportChecks.delete(maidName);

            // 通知履歴ログを確認
            if (!this.maidAgentPath) return;

            const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
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
        }, 5000);

        this.pendingReportChecks.set(maidName, timer);
    }

    stopWatchingFiles(): void {
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
    async manualProcessNotifications(): Promise<void> {
        this.log('[デバッグ] 通知履歴を表示');

        if (!this.maidAgentPath) {
            vscode.window.showErrorMessage('maidAgentPath が設定されていません');
            return;
        }

        const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
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
    showDebugStatus(): void {
        const agentList = Array.from(this.agents.entries()).map(([id, agent]) => {
            return `  - ${id}: ${agent.name} (${agent.role}, ${agent.status})`;
        }).join('\n');

        // 通知履歴の件数を取得
        let notifyCount = 0;
        if (this.maidAgentPath) {
            const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
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
            '🎩 Controller',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true  // 非表示時も状態を保持
            }
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
                    case 'showTaskDashboard':
                        this.showWebDashboard();
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        this.updateDashboard();
    }

    // =========================================================================
    // Webダッシュボード（MCPサーバー版）
    // =========================================================================

    private webDashboardPanel: vscode.WebviewPanel | undefined;
    private webDashboardPollingInterval: NodeJS.Timeout | undefined;
    private webDashboardInitialized = false; // 初回HTML設定済みフラグ
    private readonly WEB_DASHBOARD_POLLING_INTERVAL = 10000; // 10秒

    // Webview側の完了セクション表示設定（ポーリング時に使用）
    private completedViewState = {
        limit: 10,
        offset: 0,
        reviewed: undefined as string | undefined,
        starred: undefined as string | undefined,
        hash: ''
    };

    showWebDashboard(): void {
        if (this.webDashboardPanel) {
            this.webDashboardPanel.reveal();
            this.updateWebDashboard();
            return;
        }

        this.webDashboardPanel = vscode.window.createWebviewPanel(
            'maidAgentWebDashboard',
            '📋 Dashboard',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.webDashboardPanel.onDidDispose(() => {
            this.webDashboardPanel = undefined;
            this.webDashboardInitialized = false;
            this.stopWebDashboardPolling();
        });

        // 自動更新ポーリングを開始
        this.startWebDashboardPolling();

        this.webDashboardPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this.updateWebDashboard();
                        break;
                    case 'openInBrowser':
                        this.openDashboardInBrowser();
                        break;
                    case 'showController':
                        this.showDashboard();
                        break;
                    case 'openFile':
                        this.openFileWithPreview(message.path);
                        break;
                    case 'toggleReview':
                        this.toggleTaskReview(message.taskId, message.reviewed);
                        break;
                    case 'toggleStar':
                        this.toggleTaskStar(message.taskId, message.starred);
                        break;
                    case 'completedPage':
                        this.fetchCompletedPage(message.offset, message.limit, message.reviewed, message.starred);
                        break;
                    case 'updateCompletedViewState':
                        // Webviewから表示設定を受け取り保持（ポーリング時に使用）
                        this.completedViewState = {
                            limit: message.limit ?? 10,
                            offset: message.offset ?? 0,
                            reviewed: message.reviewed,
                            starred: message.starred,
                            hash: message.hash ?? ''
                        };
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        this.updateWebDashboard();
    }

    private async updateWebDashboard(): Promise<void> {
        if (!this.webDashboardPanel) return;

        // workspaceRootがない場合は再取得を試みる
        let projectPath = this.workspaceRoot;
        if (!projectPath) {
            projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        }

        if (!projectPath) {
            // ワークスペースが開かれていない場合のエラー表示
            this.webDashboardPanel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, sans-serif;
                            background: #1e1e1e;
                            color: #cccccc;
                            padding: 40px;
                            text-align: center;
                        }
                        .error-icon { font-size: 4rem; margin-bottom: 20px; }
                        .error-title { font-size: 1.5rem; color: #f14c4c; margin-bottom: 10px; }
                        .error-message { color: #808080; }
                    </style>
                </head>
                <body>
                    <div class="error-icon">📁</div>
                    <div class="error-title">ワークスペースが開かれていません</div>
                    <div class="error-message">フォルダを開いてから再度お試しください</div>
                </body>
                </html>
            `;
            return;
        }

        const serverUrl = 'http://localhost:3100';
        const normalizedPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(projectPath)
            : projectPath;

        try {
            // 初回はHTMLを取得、2回目以降はJSON APIで部分更新
            if (!this.webDashboardInitialized) {
                await this.initializeWebDashboard(serverUrl, normalizedPath);
                this.webDashboardInitialized = true;
            } else {
                await this.updateWebDashboardData(serverUrl, normalizedPath);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.webDashboardPanel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, sans-serif;
                            background: #1e1e1e;
                            color: #cccccc;
                            padding: 40px;
                            text-align: center;
                        }
                        .error-icon { font-size: 4rem; margin-bottom: 20px; }
                        .error-title { font-size: 1.5rem; color: #f14c4c; margin-bottom: 10px; }
                        .error-message { color: #808080; margin-bottom: 20px; }
                        .btn {
                            background: #569cd6;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 1rem;
                        }
                        .hint { margin-top: 30px; font-size: 0.9rem; color: #808080; }
                        code { background: #333; padding: 2px 6px; border-radius: 3px; }
                    </style>
                </head>
                <body>
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">MCPサーバーに接続できません</div>
                    <div class="error-message">${message}</div>
                    <button class="btn" onclick="location.reload()">🔄 再試行</button>
                    <div class="hint">
                        <p>MCPサーバーが起動していることを確認してください:</p>
                        <code>pm2 status maid-agent-messenger</code>
                    </div>
                </body>
                </html>
            `;
        }
    }

    /**
     * Webダッシュボードの自動更新ポーリングを開始
     */
    private startWebDashboardPolling(): void {
        if (this.webDashboardPollingInterval) return;

        this.webDashboardPollingInterval = setInterval(() => {
            if (this.webDashboardPanel) {
                this.updateWebDashboard();
            } else {
                this.stopWebDashboardPolling();
            }
        }, this.WEB_DASHBOARD_POLLING_INTERVAL);

        this.log('[WebDashboard] 自動更新ポーリング開始（10秒間隔）');
    }

    /**
     * Webダッシュボードの自動更新ポーリングを停止
     */
    private stopWebDashboardPolling(): void {
        if (this.webDashboardPollingInterval) {
            clearInterval(this.webDashboardPollingInterval);
            this.webDashboardPollingInterval = undefined;
            this.log('[WebDashboard] 自動更新ポーリング停止');
        }
    }

    /**
     * Webダッシュボードを初期化（初回HTML設定）
     * postMessageリスナーを追加してJSON更新に対応
     */
    private async initializeWebDashboard(serverUrl: string, projectPath: string): Promise<void> {
        if (!this.webDashboardPanel) return;

        const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(projectPath)}`;
        const response = await fetch(dashboardUrl);

        if (!response.ok) {
            throw new Error(`Dashboard fetch failed: ${response.status}`);
        }

        let html = await response.text();

        // postMessageリスナーを追加（VSCode Webview用）
        // 拡張機能からpostMessageで送信されたJSON更新を受け取り、
        // 既存のupdateStats/updateTaskListsWithMeta関数を呼び出す
        const messageListenerScript = `
            <script>
                // postMessageでJSON更新・レポート表示を受け取るリスナー
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'dashboardUpdate') {
                        if (message.stats && typeof updateStats === 'function') {
                            updateStats(message.stats);
                        }
                        // completedMeta付きの場合はupdateTaskListsWithMetaを使用
                        if (message.tasks && typeof updateTaskListsWithMeta === 'function') {
                            updateTaskListsWithMeta(message.tasks, message.completedMeta);
                        } else if (message.tasks && typeof updateTaskLists === 'function') {
                            updateTaskLists(message.tasks);
                        }
                    } else if (message.type === 'showReport') {
                        if (typeof showReportOverlay === 'function') {
                            showReportOverlay(message.html, message.fileName);
                        }
                    } else if (message.type === 'completedPageUpdate') {
                        if (typeof updateCompletedSection === 'function') {
                            updateCompletedSection(message.html, message.total, message.offset, message.limit);
                        }
                    } else if (message.type === 'refreshCompletedPage') {
                        if (typeof requestCompletedPage === 'function') {
                            requestCompletedPage();
                        }
                    }
                });
            </script>
        `;

        // </body>の前にスクリプトを挿入
        html = html.replace('</body>', messageListenerScript + '</body>');

        this.webDashboardPanel.webview.html = html;
        this.log('[WebDashboard] 初回HTML設定完了（postMessageリスナー追加済み）');
    }

    /**
     * WebダッシュボードをJSON APIで部分更新
     * 展開状態を保持したままデータのみ更新
     * Webviewの完了セクション表示設定を送信し、ハッシュ比較で差分検知
     */
    private async updateWebDashboardData(serverUrl: string, projectPath: string): Promise<void> {
        if (!this.webDashboardPanel) return;

        // Webviewの表示設定をクエリパラメータに含める
        const state = this.completedViewState;
        let dataUrl = `${serverUrl}/dashboard/data?project=${encodeURIComponent(projectPath)}`;
        dataUrl += `&completedLimit=${state.limit}`;
        dataUrl += `&completedOffset=${state.offset}`;
        if (state.reviewed) dataUrl += `&completedReviewed=${state.reviewed}`;
        if (state.starred) dataUrl += `&completedStarred=${state.starred}`;
        if (state.hash) dataUrl += `&completedHash=${state.hash}`;

        const response = await fetch(dataUrl);

        if (!response.ok) {
            throw new Error(`Dashboard data fetch failed: ${response.status}`);
        }

        const data = await response.json() as {
            stats: { pendingCount: number; workingCount: number; blockedCount: number; completedTodayCount: number; timestamp: string };
            tasks: { pending: string; working: string; blocked: string; completed?: string; actionRequired: string };
            completedMeta?: { changed: boolean; hash: string; total: number };
        };

        // ハッシュを更新
        if (data.completedMeta?.hash) {
            this.completedViewState.hash = data.completedMeta.hash;
        }

        // postMessageでWebviewにデータを送信
        // Webview側のリスナーがupdateStats/updateTaskListsWithMetaを呼び出す
        this.webDashboardPanel.webview.postMessage({
            type: 'dashboardUpdate',
            stats: data.stats,
            tasks: data.tasks,
            completedMeta: data.completedMeta
        });

        this.log('[WebDashboard] JSON APIで部分更新送信');
    }

    /**
     * 完了タスクのレビュー済みフラグをトグル
     */
    private async toggleTaskReview(taskId: string, reviewed: boolean): Promise<void> {
        const serverUrl = 'http://localhost:3100';
        let projectPath = this.workspaceRoot;
        if (!projectPath) return;
        const normalizedPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(projectPath)
            : projectPath;
        try {
            await fetch(`${serverUrl}/api/tasks/${taskId}/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': normalizedPath },
                body: JSON.stringify({ reviewed }),
            });
            // PATCH成功後、webviewに完了ページ再取得シグナルを送信
            this.webDashboardPanel?.webview.postMessage({ type: 'refreshCompletedPage' });
        } catch (error) {
            this.log(`[WebDashboard] Review toggle failed: ${error}`);
        }
    }

    /**
     * 完了タスクのスターフラグをトグル
     */
    private async toggleTaskStar(taskId: string, starred: boolean): Promise<void> {
        const serverUrl = 'http://localhost:3100';
        let projectPath = this.workspaceRoot;
        if (!projectPath) return;
        const normalizedPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(projectPath)
            : projectPath;
        try {
            await fetch(`${serverUrl}/api/tasks/${taskId}/star`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': normalizedPath },
                body: JSON.stringify({ starred }),
            });
            // PATCH成功後、webviewに完了ページ再取得シグナルを送信
            this.webDashboardPanel?.webview.postMessage({ type: 'refreshCompletedPage' });
        } catch (error) {
            this.log(`[WebDashboard] Star toggle failed: ${error}`);
        }
    }

    /**
     * 完了タスクのページネーションデータを取得してWebviewに送信
     */
    private async fetchCompletedPage(offset: number, limit: number, reviewed?: string, starred?: string): Promise<void> {
        const serverUrl = 'http://localhost:3100';
        let projectPath = this.workspaceRoot;
        if (!projectPath || !this.webDashboardPanel) return;
        const normalizedPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(projectPath)
            : projectPath;
        try {
            let url = `${serverUrl}/dashboard/completed?project=${encodeURIComponent(normalizedPath)}&offset=${offset}&limit=${limit}`;
            if (reviewed === 'yes') url += '&reviewed=yes';
            else if (reviewed === 'no') url += '&reviewed=no';
            if (starred === 'yes') url += '&starred=yes';
            else if (starred === 'no') url += '&starred=no';
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const data = await response.json() as { html: string; total: number; offset: number; limit: number; hasMore: boolean };
            this.webDashboardPanel.webview.postMessage({
                type: 'completedPageUpdate',
                html: data.html,
                total: data.total,
                offset: data.offset,
                limit: data.limit,
            });
        } catch (error) {
            this.log(`[WebDashboard] Completed page fetch failed: ${error}`);
        }
    }

    /**
     * ブラウザでWebダッシュボードを開く
     */
    public openDashboardInBrowser(): void {
        if (!this.workspaceRoot) return;
        const serverUrl = 'http://localhost:3100';
        // Windows環境の場合はWSLパスに変換
        const normalizedPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(this.workspaceRoot)
            : this.workspaceRoot;
        const dashboardUrl = `${serverUrl}/dashboard?project=${encodeURIComponent(normalizedPath)}`;
        vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    }

    private async openMaidAgentFile(filename: string): Promise<void> {
        if (!this.maidAgentPath) return;
        const filePath = path.join(this.maidAgentPath, filename);
        if (fs.existsSync(filePath)) {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);

            // Markdownファイルの場合はプレビューも表示
            if (filename.endsWith('.md')) {
                await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(filePath));
            }
        }
    }

    /**
     * ファイルを開き、マークダウンの場合はプレビューも表示
     * Webダッシュボードからの報告書リンク用
     */
    private reportViewerPanel: vscode.WebviewPanel | undefined;

    private async openFileWithPreview(filePath: string): Promise<void> {
        try {
            // Windowsパス（C:/...）をそのまま使用
            // WSL環境では/mnt/c/...に変換が必要
            let normalizedPath = filePath;
            if (CURRENT_ENV === 'wsl' && /^[A-Z]:\//i.test(filePath)) {
                // Windowsパス → WSLパス変換
                const driveLetter = filePath[0].toLowerCase();
                normalizedPath = `/mnt/${driveLetter}/${filePath.slice(3)}`;
            }

            // ファイルの存在確認
            if (!fs.existsSync(normalizedPath)) {
                vscode.window.showErrorMessage(`ファイルが見つかりません: ${filePath}`);
                return;
            }

            // ファイル内容を読み込み、HTMLに変換
            const content = fs.readFileSync(normalizedPath, 'utf-8');
            const fileName = path.basename(normalizedPath);
            const isMarkdown = /\.(md|markdown)$/i.test(filePath);

            const contentHtml = isMarkdown
                ? simpleMarkdownToHtml(content)
                : `<pre class="md-code-block"><code>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;

            // 既存パネルがあれば内容を更新して表示
            if (this.reportViewerPanel) {
                this.reportViewerPanel.title = `📄 ${fileName}`;
                this.setReportViewerHtml(contentHtml, fileName);
                this.reportViewerPanel.reveal(vscode.ViewColumn.Active);
                return;
            }

            // Controller/Dashboardと同じ ViewColumn.Active で開く
            this.reportViewerPanel = vscode.window.createWebviewPanel(
                'maidAgentReportViewer',
                `📄 ${fileName}`,
                vscode.ViewColumn.Active,
                { enableScripts: false, retainContextWhenHidden: false }
            );

            this.reportViewerPanel.onDidDispose(() => {
                this.reportViewerPanel = undefined;
            });

            this.setReportViewerHtml(contentHtml, fileName);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`ファイルを開けませんでした: ${message}`);
        }
    }

    private setReportViewerHtml(contentHtml: string, fileName: string): void {
        if (!this.reportViewerPanel) return;
        this.reportViewerPanel.webview.html = `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 16px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
            line-height: 1.6;
            font-size: 13px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e94560;
        }
        h1 { color: #e94560; margin: 0; font-size: 1.2em; }
        .content {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 16px;
        }
        .md-h1 { font-size: 1.4em; color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 6px; margin: 16px 0 12px 0; }
        .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
        .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
        .md-p { margin: 8px 0; }
        .md-ul { margin: 6px 0; padding-left: 25px; }
        .md-li { margin: 4px 0; list-style-type: disc; }
        .md-checkbox { padding: 4px 0; }
        .md-checkbox.checked { color: #81c784; }
        .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .md-table th, .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
        .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
        .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
        .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
        .md-hr { border: none; border-top: 1px solid #444; margin: 16px 0; }
        .md-link { color: #4fc3f7; }
        strong { color: #ffc107; }
        em { font-style: italic; color: #aaa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📄 ${fileName}</h1>
    </div>
    <div class="content">
        ${contentHtml}
    </div>
</body>
</html>`;
    }








    /**
     * Serializerからコントローラパネルを復元する
     */
    restoreControllerPanel(panel: vscode.WebviewPanel): void {
        this.dashboardPanel = panel;

        // パネル破棄時の処理を再設定
        panel.onDidDispose(() => {
            this.dashboardPanel = undefined;
        });

        // メッセージハンドラを再設定
        panel.webview.onDidReceiveMessage(
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
                    case 'showTaskDashboard':
                        this.showWebDashboard();
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        // パネル内容を更新
        this.updateDashboard();
    }

    /**
     * SerializerからWebダッシュボードパネルを復元する
     */
    restoreWebDashboardPanel(panel: vscode.WebviewPanel): void {
        this.webDashboardPanel = panel;

        // パネル破棄時の処理を再設定
        panel.onDidDispose(() => {
            this.webDashboardPanel = undefined;
            this.stopWebDashboardPolling();
        });

        // 自動更新ポーリングを開始
        this.startWebDashboardPolling();

        // メッセージハンドラを再設定
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        this.updateWebDashboard();
                        break;
                    case 'openInBrowser':
                        this.openDashboardInBrowser();
                        break;
                    case 'showController':
                        this.showDashboard();
                        break;
                    case 'openFile':
                        this.openFileWithPreview(message.path);
                        break;
                }
            },
            undefined,
            this.context?.subscriptions
        );

        // パネル内容を更新
        this.updateWebDashboard();
    }


    private updateDashboard(): void {
        if (!this.dashboardPanel) return;

        const butler = this.agents.get('butler');
        const chief = this.agents.get('chief');
        const maids = MAIDS.map(m => this.agents.get(m.id)).filter(Boolean) as Agent[];


        // 会話ログ（history.log）を読み込む
        let conversationLogs = '';
        if (this.maidAgentPath) {
            const historyPath = path.join(this.maidAgentPath, 'notifications', 'history.log');
            if (fs.existsSync(historyPath)) {
                const content = fs.readFileSync(historyPath, 'utf-8');
                const lines = content.trim().split('\n').filter(l => l.length > 0);
                // 最新20件を逆順で表示
                conversationLogs = lines.slice(-20).reverse().map(line => {
                    // [2024-01-01 12:34:56] sender → target: message の形式をパース
                    const match = line.match(/^\[([^\]]+)\] (\w+) → (\w+): (.+)$/);
                    if (match) {
                        const [, timestamp, sender, target, message] = match;
                        return `<div class="conv-entry"><span class="conv-time">${timestamp.split(' ')[1]}</span> <span class="conv-sender">${sender}</span> → <span class="conv-target">${target}</span>: ${message}</div>`;
                    }
                    return `<div class="conv-entry">${line}</div>`;
                }).join('');
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


        .log-container {
            background: #0a0a0a; border-radius: 8px; padding: 10px;
            max-height: 300px; overflow-y: auto;
        }
        .log-entry {
            font-family: 'Consolas', monospace; font-size: 0.75em;
            color: #0f0; padding: 2px 5px; border-bottom: 1px solid #222;
        }

        .conv-container {
            background: #0a0a0a; border-radius: 8px; padding: 10px;
            max-height: 300px; overflow-y: auto;
        }
        .conv-entry {
            font-family: 'Consolas', monospace; font-size: 0.75em;
            color: #ddd; padding: 4px 5px; border-bottom: 1px solid #222;
        }
        .conv-time { color: #666; }
        .conv-sender { color: #4fc3f7; font-weight: bold; }
        .conv-target { color: #81c784; font-weight: bold; }


        @media (max-width: 600px) { .two-column { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <h1>🎩 Maid Agent Controller</h1>
    <p class="subtitle">執事 → メイド長 → メイド の階層構造</p>

    <div class="action-bar">
        <button class="action-btn" onclick="sendTask()">📝 執事に指令</button>
        <button class="action-btn secondary" onclick="refresh()">🔄 更新</button>
        <button class="action-btn secondary" onclick="showTaskDashboard()">📋 Tasks</button>
        <button class="action-btn secondary" onclick="openFile('queue/butler_to_chief.yaml')">📂 Queue</button>
    </div>

    <div class="two-column">
        <div class="section">
            <h2>💬 会話ログ</h2>
            <div class="conv-container">
                ${conversationLogs || '<div class="conv-entry">会話ログはございません</div>'}
            </div>
        </div>
        <div class="section">
            <h2>📜 システムログ</h2>
            <div class="log-container">
                ${recentLogs || '<div class="log-entry">ログはございません</div>'}
            </div>
        </div>
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
        function showTaskDashboard() { vscode.postMessage({ command: 'showTaskDashboard' }); }
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
        // tmuxビューアターミナルが閉じられた場合
        if (terminal === this.tmuxViewerTerminal) {
            this.tmuxViewerTerminal = undefined;
            this.log('[tmux] ビューアターミナルが閉じられました');
            // 注: tmuxセッション自体は継続中（バックグラウンドで動作）
            return;
        }
    }

    killAgent(agentId: string): void {
        AgentLifecycle.killAgent(this.createAgentContext(), agentId);
    }

    dispose(): void {
        // tmuxセッションを終了（オプション - ユーザーが選択できるようにしても良い）
        // this.tmuxManager?.killSession();

        // ポーリングを停止
        this.stopTmuxWindowPolling();

        // ステータスバー通知タイマーを停止
        if (this.statusBarResetTimeout) {
            clearTimeout(this.statusBarResetTimeout);
        }

        // ビューアターミナルを閉じる
        this.tmuxViewerTerminal?.dispose();

        // その他のリソースをクリーンアップ
        this.outputChannel.dispose();
        this.dashboardPanel?.dispose();
        this.fileWatcher?.dispose();
    }

    /**
     * tmuxセッションを終了
     */
    killTmuxSession(): void {
        if (this.tmuxManager) {
            this.tmuxManager.killSession();
            this.agents.clear();
            this.log('[tmux] セッションを終了しました');
            vscode.window.showInformationMessage('🎩 Maid Agent セッションを終了しました');
        }
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


    // コントローラパネルの永続化（VSCode再起動時に復元）
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('multiAgentDashboard', {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
                // パネルのオプションを再設定
                panel.webview.options = { enableScripts: true };
                controller.restoreControllerPanel(panel);
            }
        })
    );

    // Webダッシュボードパネルの永続化（VSCode再起動時に復元）
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('maidAgentWebDashboard', {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
                // パネルのオプションを再設定
                panel.webview.options = { enableScripts: true };
                controller.restoreWebDashboardPanel(panel);
            }
        })
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
        vscode.commands.registerCommand('multiAgent.initializeGlobal', async () => {
            const success = await controller.initializeGlobalSettings();
            if (success) {
                const globalPath = getGlobalMaidAgentPath();
                vscode.window.showInformationMessage(`🌐 グローバル設定を初期化しました: ${globalPath}`);
                // フォルダを開く
                const uri = vscode.Uri.file(globalPath);
                vscode.commands.executeCommand('revealFileInOS', uri);
            }
        }),
        vscode.commands.registerCommand('multiAgent.resumeSessions', () => {
            controller.resumeSessions();
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
        vscode.commands.registerCommand('multiAgent.showWebDashboard', () => {
            controller.showWebDashboard();
        }),
        vscode.commands.registerCommand('multiAgent.openDashboardInBrowser', () => {
            controller.openDashboardInBrowser();
        }),
        vscode.commands.registerCommand('multiAgent.watchFiles', () => {
            controller.startWatchingFiles();
        }),
        vscode.commands.registerCommand('multiAgent.stopWatchFiles', () => {
            controller.stopWatchingFiles();
        }),
        vscode.commands.registerCommand('multiAgent.openTmuxViewer', () => {
            controller.openTmuxViewer();
        }),
        vscode.commands.registerCommand('multiAgent.killSession', () => {
            controller.killTmuxSession();
        }),
        vscode.commands.registerCommand('multiAgent.processNotifications', () => {
            controller.manualProcessNotifications();
        }),
        vscode.commands.registerCommand('multiAgent.showStatus', () => {
            controller.showDebugStatus();
        }),
        vscode.commands.registerCommand('multiAgent.promoteRuleToGlobal', () => {
            controller.promoteRuleToGlobal();
        }),
    ];

    context.subscriptions.push(...commands);

    // Dashboard ボタン（タスク一覧）
    const dashboardStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    dashboardStatusBarItem.text = '📋 Dashboard';
    dashboardStatusBarItem.command = 'multiAgent.showWebDashboard';
    dashboardStatusBarItem.tooltip = 'クリックでタスク一覧を表示';
    dashboardStatusBarItem.show();
    context.subscriptions.push(dashboardStatusBarItem);

    // Controller ボタン（コントローラー）
    const controllerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    controllerStatusBarItem.text = '🎩 Controller';
    controllerStatusBarItem.command = 'multiAgent.showDashboard';
    controllerStatusBarItem.tooltip = 'クリックでコントローラーを表示';
    controllerStatusBarItem.show();
    context.subscriptions.push(controllerStatusBarItem);

    // コントローラーにステータスバーを設定（通知用）
    controller.setStatusBarItem(controllerStatusBarItem);

    // IDE起動時の自動復帰機能
    const autoResumeEnabled = vscode.workspace.getConfiguration('maidAgent').get<boolean>('autoResumeOnStartup', true);
    if (autoResumeEnabled) {
        // 少し遅延させてから自動復帰を試行（VSCodeの初期化完了を待つ）
        setTimeout(async () => {
            try {
                // 既存のTmuxセッションがあるかチェック
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const workspacePath = workspaceFolder.uri.fsPath;
                    const sessionName = getSessionNameFromPath(workspacePath);

                    // セッションが存在するかチェック
                    let sessionExists = false;
                    try {
                        if (CURRENT_ENV === 'windows-native') {
                            execSync(`wsl tmux has-session -t "${sessionName}" 2>/dev/null`, { encoding: 'utf-8', stdio: 'pipe' });
                        } else {
                            execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`, { encoding: 'utf-8', stdio: 'pipe' });
                        }
                        sessionExists = true;
                    } catch {
                        sessionExists = false;
                    }

                    if (sessionExists) {
                        // 自動復帰を実行
                        await controller.resumeSessions();
                    }
                }
            } catch (error) {
                // 自動復帰に失敗しても致命的ではないのでログのみ
                console.error('[Maid Agent] 自動復帰に失敗:', error);
            }
        }, 2000); // 2秒後に実行
    }
}

export function deactivate() {
    controller?.dispose();
}
