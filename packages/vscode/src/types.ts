import * as vscode from 'vscode';
import type { ITerminalMultiplexer, IMultiplexerFactory } from './multiplexer';
import type { AgentPanelProvider } from './ui/agent-panel-provider';
import type { MaidAgentSettings } from './utils/settings-loader';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 実行環境の種類
 */
export type ExecutionEnvironment = 'wsl' | 'windows-native' | 'linux' | 'macos';

/**
 * ランタイムモード（Windows環境でのみ選択可能）
 * - 'wsl': WSL + tmux を使用
 * - 'windows-native': Windows直接実行（psmux）
 * - 'both': 両方の環境をセットアップ
 */
export type RuntimeMode = 'wsl' | 'windows-native' | 'both';

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
    tmuxManager: ITerminalMultiplexer | undefined;
    multiplexerFactory: IMultiplexerFactory;
    tmuxSessionName: string;
    tmuxViewerTerminal: vscode.Terminal | undefined;
    agentPanelProvider: AgentPanelProvider | undefined;
    statusBarItem: vscode.StatusBarItem | undefined;
    statusBarResetTimeout: NodeJS.Timeout | undefined;
    settings: MaidAgentSettings | undefined;

    // ─── Logger ───
    log(message: string): void;

    // ─── Controller methods (NOT in E4) ───
    updateController(): void;
    updateAgentPanel(): void;
    delay(ms: number): Promise<void>;
    startWatchingFiles(silent?: boolean): void;
    initializeWorkspace(): Promise<boolean>;
    installTmux(): Promise<boolean>;
    showTmuxInstallInstructions(): void;
    createSetupContext(): SetupContext | undefined;
    ensureWslAvailable(): Promise<boolean>;

    // ─── Cross-module E4 methods (delegated through controller) ───
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
}

/**
 * Webダッシュボードの完了セクション表示設定
 */
export interface CompletedViewState {
    limit: number;
    offset: number;
    hash: string;
    completedSortField: string | undefined;
}

// =============================================================================
// グローバル設定関連の型定義
// =============================================================================

/**
 * グローバル設定で実行可能なセットアップ項目
 */
export type SetupItem = 'passwordlessSudo' | 'pm2Install' | 'pm2Startup';

/**
 * 事前調査結果（Phase 1）
 */
export interface GlobalRequirements {
    // 環境情報
    isWindows: boolean;
    isMac: boolean;
    isLinux: boolean;

    // 必要なアクション（事前調査結果）
    needsWslInstall: boolean;        // Windows: WSL未インストール
    needsUbuntuInstall: boolean;     // Windows: Ubuntu未インストール
    needsPasswordlessSudo: boolean;  // Windows: sudoers未設定
    needsPm2Install: boolean;        // 全環境: pm2未インストール
    needsPm2Startup: boolean;        // 全環境: startup未設定

    // 派生情報
    needsSudoPassword: boolean;      // 上記いずれかがtrueでパスワードレス未設定
    needsAnyAction: boolean;         // 何らかのアクションが必要
    needsReboot: boolean;            // WSL/Ubuntuインストール時
}

/**
 * ユーザー入力一括取得結果（Phase 2）
 */
export interface UnifiedUserInput {
    approved: boolean;           // 全体の承認
    password?: string;           // sudoパスワード（必要な場合）
    skippedItems: SetupItem[];   // スキップする項目
}

/**
 * セットアップ実行結果（Phase 3）
 */
export interface SetupResult {
    success: boolean;
    completedSteps: string[];
    failedStep?: string;
    error?: string;
}

/**
 * ビューシステム共通コンテキスト
 * UI関連メソッドをスタンドアロン関数に渡すためのインターフェース
 */
export interface ViewContext {
    // ─── State ───
    agents: Map<string, Agent>;
    workspaceRoot: string | undefined;
    maidAgentPath: string | undefined;
    logs: string[];
    context: vscode.ExtensionContext | undefined;

    // ─── Panel State (mutable via getter/setter) ───
    controllerPanel: vscode.WebviewPanel | undefined;
    dashboardPanel: vscode.WebviewPanel | undefined;
    dashboardInitialized: boolean;
    dashboardConsecutiveFailures: number;  // ダッシュボード接続の連続失敗回数
    completedViewState: CompletedViewState;
    reportViewerPanel: vscode.WebviewPanel | undefined;
    statusBarItem: vscode.StatusBarItem | undefined;
    statusBarResetTimeout: NodeJS.Timeout | undefined;

    // ─── Logger ───
    log(message: string): void;

    // ─── Controller methods (NOT in E5) ───
    promptAndSendToButler(): Promise<void>;

    // ─── Cross-module E5 methods (delegated through controller) ───
    showController(): void;
    showDashboard(): void;
    updateController(): void;
    updateDashboard(): Promise<void>;
    openMaidAgentFile(filename: string): Promise<void>;
    openFileWithPreview(filePath: string): Promise<void>;
    openDashboardInBrowser(): void;
    showStatusBarNotification(icon: string, message: string): void;
}
