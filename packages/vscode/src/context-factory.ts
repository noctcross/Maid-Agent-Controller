/**
 * Context Factory
 *
 * MultiAgentController から各モジュールに渡す Context オブジェクトの生成を担当。
 * controller.ts のプロパティを ControllerState インターフェース経由で受け取り、
 * AgentContext / ViewContext / SetupContext / 各 WatcherContext を構築する。
 */
import * as vscode from 'vscode';
import { Agent, SetupContext, AgentContext, ViewContext, CompletedViewState } from './types';
import { MultiplexerFactory, ITerminalMultiplexer } from './multiplexer';
import { AgentPanelProvider } from './ui/agent-panel-provider';
import { getGlobalMaidAgentPath } from './utils/helpers';
import { MaidAgentSettings } from './utils/settings-loader';
import * as FileWatcher from './events/file-watcher';
import * as TmuxWatcher from './events/tmux-watcher';
import * as UserCommands from './commands/user-commands';

// =============================================================================
// Controller State インターフェース
// =============================================================================

/**
 * MultiAgentController の内部状態を参照するためのインターフェース。
 * Context Factory がコントローラーのプロパティにアクセスするために使用。
 */
export interface ControllerState {
    // ─── Mutable State ───
    agents: Map<string, Agent>;
    outputChannel: vscode.OutputChannel;
    logs: string[];
    context: vscode.ExtensionContext | undefined;
    workspaceRoot: string | undefined;
    maidAgentPath: string | undefined;
    agentPanelProvider: AgentPanelProvider | undefined;
    tmuxManager: ITerminalMultiplexer | undefined;
    multiplexerFactory: MultiplexerFactory;
    tmuxViewerTerminal: vscode.Terminal | undefined;
    tmuxSessionName: string;
    statusBarItem: vscode.StatusBarItem | undefined;
    statusBarResetTimeout: NodeJS.Timeout | undefined;
    controllerPanel: vscode.WebviewPanel | undefined;
    dashboardPanel: vscode.WebviewPanel | undefined;
    dashboardInitialized: boolean;
    dashboardConsecutiveFailures: number;
    completedViewState: CompletedViewState;
    reportViewerPanel: vscode.WebviewPanel | undefined;
    settings: MaidAgentSettings | undefined;

    // ─── Methods ───
    log(msg: string): void;
    updateController(): void;
    updateAgentPanel(): void;
    delay(ms: number): Promise<void>;
    startWatchingFiles(silent?: boolean): void;
    initializeWorkspace(): Promise<boolean>;
    installTmux(): Promise<boolean>;
    showTmuxInstallInstructions(): void;
    ensureWslAvailable(): Promise<boolean>;
    createAgent(name: string, id: string, role: Agent['role'], emoji: string): Agent;
    sendToAgent(agentId: string, command: string): boolean;
    sendMessageToAgent(agentId: string, message: string): Promise<boolean>;
    deliverPendingMessages(agentId: string): Promise<void>;
    initializeTmuxSession(): void;
    saveSessionNameToFile(): void;
    openTmuxViewer(): void;
    getSystemPromptFilePath(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string | null;
    getFallbackRolePrompt(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string;
    launchClaudeWithRole(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void>;
    ensureInitialized(): Promise<boolean>;
    checkExistingSessionAndPrompt(agentId: string, agentName: string): Promise<'new' | 'resume' | 'cancel'>;
    checkSessionCountWarning(): Promise<void>;
    ensureTmuxAvailable(): Promise<boolean>;
    captureAgentOutput(agentId: string, lines?: number): string;
    resumeSessions(): Promise<void>;
    showController(): void;
    showDashboard(): void;
    updateDashboard(): Promise<void>;
    openMaidAgentFile(filename: string): Promise<void>;
    openFileWithPreview(filePath: string): Promise<void>;
    openDashboardInBrowser(): void;
    showStatusBarNotification(icon: string, message: string): void;
    promptAndSendToButler(): Promise<void>;
    sendTaskToButler(taskDescription: string): Promise<void>;
    getAgentIdFromTerminal(terminal: vscode.Terminal): string | null;
}

// =============================================================================
// Context 生成関数
// =============================================================================

/**
 * SetupContext を生成
 */
export function createSetupContext(state: ControllerState): SetupContext | undefined {
    if (!state.workspaceRoot || !state.maidAgentPath || !state.context) {
        state.log('[setup] SetupContext生成不可: 必要なプロパティが未初期化');
        return undefined;
    }
    return {
        workspaceRoot: state.workspaceRoot,
        maidAgentPath: state.maidAgentPath,
        globalMaidAgentPath: getGlobalMaidAgentPath(),
        extensionPath: state.context.extensionPath,
        outputChannel: state.outputChannel,
        log: (msg: string) => state.log(msg),
        context: state.context,
    };
}

/**
 * AgentContext を生成
 */
export function createAgentContext(state: ControllerState): AgentContext {
    return {
        // ─── State (getter/setter proxies for mutable properties) ───
        agents: state.agents,
        get workspaceRoot() { return state.workspaceRoot; },
        get maidAgentPath() { return state.maidAgentPath; },
        set maidAgentPath(v) { state.maidAgentPath = v; },
        outputChannel: state.outputChannel,
        get context() { return state.context; },
        get tmuxManager() { return state.tmuxManager; },
        set tmuxManager(v) { state.tmuxManager = v; },
        tmuxSessionName: state.tmuxSessionName,
        get tmuxViewerTerminal() { return state.tmuxViewerTerminal; },
        set tmuxViewerTerminal(v) { state.tmuxViewerTerminal = v; },
        get agentPanelProvider() { return state.agentPanelProvider; },
        get statusBarItem() { return state.statusBarItem; },
        get statusBarResetTimeout() { return state.statusBarResetTimeout; },
        set statusBarResetTimeout(v) { state.statusBarResetTimeout = v; },
        get settings() { return state.settings; },
        multiplexerFactory: state.multiplexerFactory,

        // ─── Logger ───
        log: (msg: string) => state.log(msg),

        // ─── Controller methods ───
        updateController: () => state.updateController(),
        updateAgentPanel: () => state.updateAgentPanel(),
        delay: (ms: number) => state.delay(ms),
        startWatchingFiles: (silent?: boolean) => state.startWatchingFiles(silent),
        initializeWorkspace: () => state.initializeWorkspace(),
        installTmux: () => state.installTmux(),
        showTmuxInstallInstructions: () => state.showTmuxInstallInstructions(),
        createSetupContext: () => createSetupContext(state),
        ensureWslAvailable: () => state.ensureWslAvailable(),

        // ─── Cross-module methods ───
        createAgent: (name, id, role, emoji) => state.createAgent(name, id, role, emoji),
        sendToAgent: (agentId, command) => state.sendToAgent(agentId, command),
        sendMessageToAgent: (agentId, message) => state.sendMessageToAgent(agentId, message),
        deliverPendingMessages: (agentId) => state.deliverPendingMessages(agentId),
        initializeTmuxSession: () => state.initializeTmuxSession(),
        saveSessionNameToFile: () => state.saveSessionNameToFile(),
        openTmuxViewer: () => state.openTmuxViewer(),
        getSystemPromptFilePath: (agentId, role, maidName?) => state.getSystemPromptFilePath(agentId, role, maidName),
        getFallbackRolePrompt: (agentId, role, maidName?) => state.getFallbackRolePrompt(agentId, role, maidName),
        launchClaudeWithRole: (agentId, role, maidName?) => state.launchClaudeWithRole(agentId, role, maidName),
        ensureInitialized: () => state.ensureInitialized(),
        checkExistingSessionAndPrompt: (agentId, agentName) => state.checkExistingSessionAndPrompt(agentId, agentName),
        checkSessionCountWarning: () => state.checkSessionCountWarning(),
        ensureTmuxAvailable: () => state.ensureTmuxAvailable(),
        captureAgentOutput: (agentId, lines?) => state.captureAgentOutput(agentId, lines),
        resumeSessions: () => state.resumeSessions(),
    };
}

/**
 * ViewContext を生成
 */
export function createViewContext(state: ControllerState): ViewContext {
    return {
        // ─── State ───
        agents: state.agents,
        get workspaceRoot() { return state.workspaceRoot; },
        get maidAgentPath() { return state.maidAgentPath; },
        logs: state.logs,
        get context() { return state.context; },

        // ─── Panel State (mutable via getter/setter) ───
        get controllerPanel() { return state.controllerPanel; },
        set controllerPanel(v) { state.controllerPanel = v; },
        get dashboardPanel() { return state.dashboardPanel; },
        set dashboardPanel(v) { state.dashboardPanel = v; },
        get dashboardInitialized() { return state.dashboardInitialized; },
        set dashboardInitialized(v) { state.dashboardInitialized = v; },
        get dashboardConsecutiveFailures() { return state.dashboardConsecutiveFailures; },
        set dashboardConsecutiveFailures(v) { state.dashboardConsecutiveFailures = v; },
        get completedViewState() { return state.completedViewState; },
        set completedViewState(v) { state.completedViewState = v; },
        get reportViewerPanel() { return state.reportViewerPanel; },
        set reportViewerPanel(v) { state.reportViewerPanel = v; },
        get statusBarItem() { return state.statusBarItem; },
        get statusBarResetTimeout() { return state.statusBarResetTimeout; },
        set statusBarResetTimeout(v) { state.statusBarResetTimeout = v; },

        // ─── Logger ───
        log: (msg: string) => state.log(msg),

        // ─── Controller methods ───
        promptAndSendToButler: () => state.promptAndSendToButler(),

        // ─── Cross-module methods ───
        showController: () => state.showController(),
        showDashboard: () => state.showDashboard(),
        updateController: () => state.updateController(),
        updateDashboard: () => state.updateDashboard(),
        openMaidAgentFile: (filename: string) => state.openMaidAgentFile(filename),
        openFileWithPreview: (filePath: string) => state.openFileWithPreview(filePath),
        openDashboardInBrowser: () => state.openDashboardInBrowser(),
        showStatusBarNotification: (icon: string, message: string) => state.showStatusBarNotification(icon, message),
    };
}

/**
 * TmuxWatcherContext を生成
 */
export function createTmuxWatcherContext(state: ControllerState): TmuxWatcher.TmuxWatcherContext {
    return {
        agents: state.agents,
        tmuxManager: state.tmuxManager,
        tmuxSessionName: state.tmuxSessionName,
        tmuxViewerTerminal: state.tmuxViewerTerminal,
        agentPanelProvider: state.agentPanelProvider,
        log: (msg: string) => state.log(msg),
    };
}

/**
 * FileWatcherContext を生成
 */
export function createFileWatcherContext(state: ControllerState): FileWatcher.FileWatcherContext {
    return {
        maidAgentPath: state.maidAgentPath,
        agents: state.agents,
        context: state.context,
        log: (msg: string) => state.log(msg),
        updateController: () => state.updateController(),
        sendMessageToAgent: (agentId: string, message: string) => state.sendMessageToAgent(agentId, message),
    };
}

/**
 * UserCommandContext を生成
 */
export function createUserCommandContext(state: ControllerState): UserCommands.UserCommandContext {
    return {
        agents: state.agents,
        sendTaskToButler: (taskDescription: string) => state.sendTaskToButler(taskDescription),
        sendMessageToAgent: (agentId: string, message: string) => state.sendMessageToAgent(agentId, message),
    };
}
