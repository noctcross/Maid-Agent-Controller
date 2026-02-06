import * as vscode from 'vscode';
import type { TmuxManager } from './tmux/tmux-manager';
import type { AgentPanelProvider } from './ui/agent-panel-provider';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 実行環境の種類
 */
export type ExecutionEnvironment = 'wsl' | 'windows-native' | 'linux' | 'macos';

export interface Agent {
    name: string;
    id: string;
    terminal?: vscode.Terminal;  // VSCodeターミナル（tmuxビューア用、オプショナル）
    tmuxWindow: string;          // tmuxウィンドウ名
    role: 'butler' | 'chiefMaid' | 'maid';
    status: 'offline' | 'idle' | 'working' | 'done';
}

export interface MaidConfig {
    name: string;
    id: string;
    emoji: string;
}

/**
 * ルールモジュールのメタデータ
 */
export interface RuleModuleMeta {
    name: string;
    description: string;
    auto_select: boolean;
    target_roles: ('common' | 'butler' | 'chief' | 'maid')[];
    filePath: string;
}

/**
 * スキルのメタデータ
 */
export interface SkillMeta {
    name: string;
    description: string;
    auto_select: boolean;
    filePath: string;
}

/**
 * Setup系関数で使用する共通コンテキスト
 * MultiAgentControllerのインスタンスデータをスタンドアロン関数に渡すためのインターフェース
 */
export interface SetupContext {
    workspaceRoot: string;
    maidAgentPath: string;
    globalMaidAgentPath: string;
    extensionPath: string;
    outputChannel: vscode.OutputChannel;
    log: (message: string) => void;
}

/**
 * Agent系関数で使用する共通コンテキスト
 * MultiAgentControllerの状態とメソッドをスタンドアロン関数に渡すためのインターフェース
 * getter/setter付きオブジェクトとして生成し、mutable プロパティの変更をコントローラに反映
 */
export interface AgentContext {
    // ─── State ───
    agents: Map<string, Agent>;
    workspaceRoot: string | undefined;
    maidAgentPath: string | undefined;
    outputChannel: vscode.OutputChannel;
    context: vscode.ExtensionContext | undefined;
    tmuxManager: TmuxManager | undefined;
    tmuxSessionName: string;
    tmuxViewerTerminal: vscode.Terminal | undefined;
    agentPanelProvider: AgentPanelProvider | undefined;
    statusBarItem: vscode.StatusBarItem | undefined;
    statusBarResetTimeout: NodeJS.Timeout | undefined;

    // ─── Logger ───
    log(message: string): void;

    // ─── Controller methods (NOT in E4) ───
    updateDashboard(): void;
    updateAgentPanel(): void;
    delay(ms: number): Promise<void>;
    startWatchingFiles(silent?: boolean): void;
    initializeWorkspace(): Promise<boolean>;
    installTmux(): Promise<boolean>;
    showTmuxInstallInstructions(): void;
    createSetupContext(): SetupContext;
    ensureWslAvailable(): Promise<boolean>;

    // ─── Cross-module E4 methods (delegated through controller) ───
    createAgent(name: string, id: string, role: Agent['role'], emoji: string): Agent;
    sendToAgent(agentId: string, command: string): boolean;
    sendMessageToAgent(agentId: string, message: string): Promise<boolean>;
    deliverPendingMessages(agentId: string): Promise<void>;
    initializeTmuxSession(): void;
    saveSessionNameToFile(): void;
    openTmuxViewer(): void;
    getRolePrompt(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string;
    launchClaudeWithRole(agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void>;
    ensureInitialized(): Promise<boolean>;
    checkExistingSessionAndPrompt(agentId: string, agentName: string): Promise<'new' | 'resume' | 'cancel'>;
    checkSessionCountWarning(): Promise<void>;
    ensureMcpServerRunning(): Promise<void>;
    ensureTmuxAvailable(): Promise<boolean>;
    captureAgentOutput(agentId: string, lines?: number): string;
    resumeSessions(): Promise<void>;
}
