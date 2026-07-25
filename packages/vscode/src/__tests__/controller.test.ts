import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vscode モックを定義
vi.mock('vscode', () => ({
    window: {
        createOutputChannel: vi.fn(() => ({
            appendLine: vi.fn(),
            dispose: vi.fn(),
            show: vi.fn(),
        })),
        createWebviewPanel: vi.fn(() => ({
            webview: {
                html: '',
                onDidReceiveMessage: vi.fn(),
                postMessage: vi.fn(),
            },
            onDidDispose: vi.fn(),
            dispose: vi.fn(),
            reveal: vi.fn(),
        })),
        showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
        showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
        showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
        showInputBox: vi.fn(() => Promise.resolve(undefined)),
        showQuickPick: vi.fn(() => Promise.resolve(undefined)),
        terminals: [] as unknown[],
        createTerminal: vi.fn(() => ({
            show: vi.fn(),
            sendText: vi.fn(),
            dispose: vi.fn(),
        })),
        createStatusBarItem: vi.fn(() => ({
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        })),
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
        createFileSystemWatcher: vi.fn(() => ({
            onDidChange: vi.fn(),
            onDidCreate: vi.fn(),
            onDidDelete: vi.fn(),
            dispose: vi.fn(),
        })),
    },
    ViewColumn: { Active: 1 },
    RelativePattern: vi.fn(),
    StatusBarAlignment: { Left: 1, Right: 2 },
    Uri: {
        file: vi.fn((path: string) => ({ fsPath: path })),
    },
}));

// 依存モジュールをモック
vi.mock('../utils/environment', () => ({
    CURRENT_ENV: 'linux',
    isTmuxAvailable: vi.fn(() => true),
    getTmuxVersion: vi.fn(() => '3.3a'),
    ENV: {
        platform: 'linux',
        isWindowsNative: () => false,
        isWsl: () => false,
        isMacOS: () => false,
        isPsmux: () => false,
        isMultiplexerAvailable: () => true,
        isTmuxAvailable: () => true,
        isWslAvailable: () => true,
        getMultiplexerCommand: () => 'tmux',
        getMultiplexerVersion: () => 'tmux 3.3',
        windowsToWslPath: (p: string) => p,
        normalizePathForServer: (p: string) => p,
        needsWslPrefix: () => false,
        getShellType: () => 'bash',
        escapeSendKeys: (v: string) => `'${v}'`,
        quoteCommandArg: (v: string) => `'${v}'`,
        setRuntimeMode: vi.fn(),
        getRuntimeMode: vi.fn(() => undefined),
        getTerminalFactory: vi.fn(() => ({
            createViewerTerminal: vi.fn(() => ({
                show: vi.fn(),
                sendText: vi.fn(),
                dispose: vi.fn(),
            })),
        })),
    },
}));

vi.mock('../utils/helpers', () => ({
    getGlobalMaidAgentPath: vi.fn(() => '/home/user/.maid-agent'),
    getSessionNameFromPath: vi.fn((path: string) => `maid-${path.split('/').pop()}`),
    getOrderedMaids: vi.fn(() => []),
}));

vi.mock('../ui/agent-panel-provider', () => ({
    AgentPanelProvider: vi.fn().mockImplementation(() => ({
        setAgents: vi.fn(),
        setCurrentAgent: vi.fn(),
        setOutputChannel: vi.fn(),
    })),
}));

vi.mock('../setup/workspace-initializer', () => ({
    initializeWorkspace: vi.fn(() => Promise.resolve(true)),
    initializeGlobalSettings: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../utils/settings-loader', () => ({
    loadSettings: vi.fn(() => ({})),
}));

import { MultiAgentController } from '../controller';
import * as vscode from 'vscode';

describe('MultiAgentController', () => {
    let controller: MultiAgentController;

    beforeEach(() => {
        vi.clearAllMocks();
        controller = new MultiAgentController();
    });

    afterEach(() => {
        controller.dispose();
    });

    // =========================================================================
    // コンストラクタ
    // =========================================================================

    describe('constructor', () => {
        it('出力チャンネルが作成されること', () => {
            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Maid Agent');
        });
    });

    // =========================================================================
    // setContext
    // =========================================================================

    describe('setContext', () => {
        it('ワークスペースルートが設定されること', () => {
            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            controller.setContext(mockContext);

            // セッション名が設定されていることを確認（間接的な検証）
            const sessionName = controller.getTmuxSessionName();
            expect(sessionName).toBeDefined();
            expect(sessionName).toContain('maid-');
        });

        it('ワークスペースがない場合でもエラーにならないこと', () => {
            // ワークスペースがない状態をシミュレート
            vi.mocked(vscode.workspace).workspaceFolders = undefined;

            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            expect(() => {
                controller.setContext(mockContext);
            }).not.toThrow();
        });
    });

    // =========================================================================
    // getTmuxSessionName
    // =========================================================================

    describe('getTmuxSessionName', () => {
        it('初期状態では空文字を返すこと', () => {
            const newController = new MultiAgentController();
            expect(newController.getTmuxSessionName()).toBe('');
            newController.dispose();
        });

        it('setContext後にセッション名を返すこと', () => {
            // ワークスペースを再設定
            vi.mocked(vscode.workspace).workspaceFolders = [
                { uri: { fsPath: '/test/my-project' } } as vscode.WorkspaceFolder
            ];

            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            controller.setContext(mockContext);

            const sessionName = controller.getTmuxSessionName();
            expect(sessionName).toContain('maid-');
        });
    });

    // =========================================================================
    // getAgentIdFromTerminal
    // =========================================================================

    describe('getAgentIdFromTerminal', () => {
        it('登録されていないターミナルはnullを返すこと', () => {
            const mockTerminal = {} as vscode.Terminal;
            const result = controller.getAgentIdFromTerminal(mockTerminal);
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // setAgentPanelProvider
    // =========================================================================

    describe('setAgentPanelProvider', () => {
        it('パネルプロバイダーが設定されること', () => {
            const mockProvider = {
                setAgents: vi.fn(),
                setCurrentAgent: vi.fn(),
                setOutputChannel: vi.fn(),
            } as any;

            controller.setAgentPanelProvider(mockProvider);

            // setOutputChannelが呼ばれることを確認
            expect(mockProvider.setOutputChannel).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // setStatusBarItem
    // =========================================================================

    describe('setStatusBarItem', () => {
        it('ステータスバーアイテムが設定されること', () => {
            const mockStatusBar = {
                show: vi.fn(),
                hide: vi.fn(),
            } as any;

            // エラーなく設定できることを確認
            expect(() => {
                controller.setStatusBarItem(mockStatusBar);
            }).not.toThrow();
        });
    });

    // =========================================================================
    // showController / showDashboard（UI委譲）
    // =========================================================================

    describe('UI methods', () => {
        it('showController がエラーなく呼び出せること', () => {
            expect(() => {
                controller.showController();
            }).not.toThrow();
        });

        it('showDashboard がエラーなく呼び出せること', () => {
            expect(() => {
                controller.showDashboard();
            }).not.toThrow();
        });

        it('openDashboardInBrowser がエラーなく呼び出せること', () => {
            expect(() => {
                controller.openDashboardInBrowser();
            }).not.toThrow();
        });
    });

    // =========================================================================
    // initializeWorkspace
    // =========================================================================

    describe('initializeWorkspace', () => {
        it('コンテキスト未設定時はエラーメッセージを表示してfalseを返すこと', async () => {
            // setContextを呼ばずにinitializeWorkspaceを呼ぶ
            const result = await controller.initializeWorkspace();

            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });

        it('コンテキスト設定後は初期化を実行すること', async () => {
            vi.mocked(vscode.workspace).workspaceFolders = [
                { uri: { fsPath: '/test/workspace' } } as vscode.WorkspaceFolder
            ];

            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            controller.setContext(mockContext);

            const result = await controller.initializeWorkspace();

            expect(result).toBe(true);
        });
    });

    // =========================================================================
    // startWatchingFiles / stopWatchingFiles
    // =========================================================================

    describe('file watching', () => {
        beforeEach(() => {
            vi.mocked(vscode.workspace).workspaceFolders = [
                { uri: { fsPath: '/test/workspace' } } as vscode.WorkspaceFolder
            ];

            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            controller.setContext(mockContext);
        });

        it('startWatchingFiles がファイルウォッチャーを作成すること', () => {
            controller.startWatchingFiles(true);

            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
        });

        it('stopWatchingFiles がエラーなく呼び出せること', () => {
            controller.startWatchingFiles(true);

            expect(() => {
                controller.stopWatchingFiles();
            }).not.toThrow();
        });
    });

    // =========================================================================
    // showDebugStatus
    // =========================================================================

    describe('showDebugStatus', () => {
        it('デバッグ情報がメッセージとして表示されること', () => {
            controller.showDebugStatus();

            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // dispose
    // =========================================================================

    describe('dispose', () => {
        it('全リソースが解放されること', () => {
            vi.mocked(vscode.workspace).workspaceFolders = [
                { uri: { fsPath: '/test/workspace' } } as vscode.WorkspaceFolder
            ];

            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            controller.setContext(mockContext);
            controller.startWatchingFiles(true);

            // dispose がエラーなく実行されること
            expect(() => {
                controller.dispose();
            }).not.toThrow();
        });
    });

    // =========================================================================
    // killAll
    // =========================================================================

    describe('killAll', () => {
        it('セッション終了メッセージが表示されること', () => {
            vi.mocked(vscode.workspace).workspaceFolders = [
                { uri: { fsPath: '/test/workspace' } } as vscode.WorkspaceFolder
            ];

            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            controller.setContext(mockContext);
            controller.killAll();

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('全セッションを終了')
            );
        });
    });

    // =========================================================================
    // promptAndSendToButler
    // =========================================================================

    describe('promptAndSendToButler', () => {
        it('入力がキャンセルされた場合は何もしないこと', async () => {
            vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

            await controller.promptAndSendToButler();

            // sendTaskToButlerが呼ばれていないことを間接的に確認
            // （エラーが発生しないこと）
        });
    });

    // =========================================================================
    // openTmuxViewer
    // =========================================================================

    describe('openTmuxViewer', () => {
        it('コンテキスト設定後にエラーなく呼び出せること', () => {
            vi.mocked(vscode.workspace).workspaceFolders = [
                { uri: { fsPath: '/test/workspace' } } as vscode.WorkspaceFolder
            ];

            const mockContext = {
                extensionPath: '/test/extension',
                subscriptions: [],
            } as unknown as vscode.ExtensionContext;

            controller.setContext(mockContext);

            expect(() => {
                controller.openTmuxViewer();
            }).not.toThrow();
        });
    });

    // =========================================================================
    // handleTerminalClosed
    // =========================================================================

    describe('handleTerminalClosed', () => {
        it('未登録のターミナルでもエラーにならないこと', () => {
            const mockTerminal = {} as vscode.Terminal;

            expect(() => {
                controller.handleTerminalClosed(mockTerminal);
            }).not.toThrow();
        });
    });
});
