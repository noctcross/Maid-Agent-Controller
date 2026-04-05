/**
 * web-dashboard.ts のユニットテスト
 *
 * IDE版ダッシュボード（Webviewパネル）の動作をテスト
 * - postMessageハンドラ
 * - fetch代行処理
 * - ファイルオープン処理
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// vscode モックを定義（beforeEachより前に定義）
const mockPostMessage = vi.fn();
const mockOnDidReceiveMessage = vi.fn();
const mockReveal = vi.fn();
const mockOnDidDispose = vi.fn();

vi.mock('vscode', () => ({
    window: {
        createWebviewPanel: vi.fn(() => ({
            webview: {
                html: '',
                postMessage: mockPostMessage,
                onDidReceiveMessage: mockOnDidReceiveMessage,
            },
            reveal: mockReveal,
            onDidDispose: mockOnDidDispose,
        })),
        showTextDocument: vi.fn(),
        showErrorMessage: vi.fn(),
    },
    workspace: {
        openTextDocument: vi.fn(),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    },
    ViewColumn: { Active: 1 },
    Uri: {
        file: vi.fn((path: string) => ({ fsPath: path })),
        parse: vi.fn((url: string) => ({ toString: () => url })),
    },
    env: {
        openExternal: vi.fn(),
    },
    commands: {
        executeCommand: vi.fn(),
    },
}));

// fs モックを定義
vi.mock('fs', () => ({
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => '# Test Content'),
    readdirSync: vi.fn(() => []),
}));

// path モック（node:path）
vi.mock('path', () => ({
    join: vi.fn((...args: string[]) => args.join('/')),
    basename: vi.fn((path: string) => path.split('/').pop() || ''),
}));

// グローバル fetch モック
const mockFetch = vi.fn();
global.fetch = mockFetch;

// 環境変数モック
vi.mock('../../utils/environment', () => ({
    CURRENT_ENV: 'wsl',
    windowsToWslPath: vi.fn((path: string) => path),
    ENV: {
        platform: 'wsl',
        isWindowsNative: () => false,
        isWsl: () => true,
        isMacOS: () => false,
        isPsmux: () => false,
        getMultiplexerCommand: () => 'tmux',
        windowsToWslPath: (p: string) => p,
        normalizePathForServer: (p: string) => p,
        needsWslPrefix: () => false,
        setRuntimeMode: vi.fn(),
        getRuntimeMode: vi.fn(() => undefined),
    },
}));

// path-validator モック
vi.mock('../../utils/path-validator', () => ({
    isPathWithinRoot: vi.fn(() => true),
    isPathWithinRootCrossEnv: vi.fn(() => true),
    normalizePathForValidation: vi.fn((path: string) => path),
}));

// markdown モック
vi.mock('../../utils/markdown', () => ({
    simpleMarkdownToHtml: vi.fn((content: string) => `<p>${content}</p>`),
}));

// html-escape モック
vi.mock('../../utils/html-escape', () => ({
    escapeHtml: vi.fn((str: string) => str),
}));

// constants モック
vi.mock('../../constants', () => ({
    DASHBOARD_SERVER_URL: 'http://localhost:3100',
    DASHBOARD_MAX_CONSECUTIVE_FAILURES: 3,
}));

import type { ViewContext } from '../../types';
import type { DataFetcherContext } from '../dashboard';

describe('web-dashboard', () => {
    let mockCtx: ViewContext;
    let mockDataCtx: DataFetcherContext;

    beforeEach(() => {
        vi.clearAllMocks();

        // ViewContext モック
        mockCtx = {
            dashboardPanel: undefined,
            dashboardInitialized: false,
            dashboardConsecutiveFailures: 0,
            workspaceRoot: '/test/workspace',
            maidAgentPath: '/test/workspace/.maid-agent',
            completedViewState: {
                limit: 10,
                offset: 0,
                hash: '',
                completedSortField: undefined,
            },
            log: vi.fn(),
            showController: vi.fn(),
            context: {
                subscriptions: [],
            },
        } as unknown as ViewContext;

        // fetch のデフォルトモック
        mockFetch.mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('<html><body></body></html>'),
            json: () => Promise.resolve({
                stats: { pendingCount: 0, workingCount: 0, masterWaitingCount: 0, completedTodayCount: 0, timestamp: '12:00' },
                tasks: { pending: '', working: '', masterWaiting: '', masterReview: '' },
            }),
        });

        // DataFetcherContext モック（initializeDashboard / updateDashboardData 用）
        mockDataCtx = {
            dashboardPanel: undefined,
            workspaceRoot: '/test/workspace',
            dashboardInitialized: false,
            dashboardConsecutiveFailures: 0,
            completedViewState: {
                limit: 10,
                offset: 0,
                hash: '',
                completedSortField: undefined,
            },
            log: vi.fn(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initializeDashboard', () => {
        it('MCPサーバーからHTMLを取得してWebviewに設定すること', async () => {
            const { initializeDashboard } = await import('../dashboard');

            // dashboardPanel を設定
            const mockPanel = {
                webview: {
                    html: '',
                    postMessage: mockPostMessage,
                    onDidReceiveMessage: mockOnDidReceiveMessage,
                },
                reveal: mockReveal,
                onDidDispose: mockOnDidDispose,
            };
            mockDataCtx.dashboardPanel = mockPanel as unknown as typeof mockCtx.dashboardPanel;

            const serverUrl = 'http://localhost:3100';
            const projectPath = '/test/project';

            await initializeDashboard(mockDataCtx, serverUrl, projectPath);

            // fetch が正しいURLで呼ばれたことを確認
            expect(mockFetch).toHaveBeenCalledWith(
                `${serverUrl}/dashboard?project=${encodeURIComponent(projectPath)}`
            );

            // HTMLが設定されたことを確認
            expect(mockPanel.webview.html).toContain('<script>');
            expect(mockPanel.webview.html).toContain('dashboardUpdate');
        });

        it('postMessageリスナースクリプトが注入されること', async () => {
            const { initializeDashboard } = await import('../dashboard');

            const mockPanel = {
                webview: {
                    html: '',
                    postMessage: mockPostMessage,
                    onDidReceiveMessage: mockOnDidReceiveMessage,
                },
                reveal: mockReveal,
                onDidDispose: mockOnDidDispose,
            };
            mockDataCtx.dashboardPanel = mockPanel as unknown as typeof mockCtx.dashboardPanel;

            await initializeDashboard(mockDataCtx, 'http://localhost:3100', '/test/project');

            const html = mockPanel.webview.html;

            // postMessageリスナーが含まれていることを確認
            expect(html).toContain("window.addEventListener('message'");
            expect(html).toContain('dashboardUpdate');
            expect(html).toContain('updateStats');
            expect(html).toContain('updateV2Sections');
        });
    });

    describe('updateDashboardData', () => {
        it('JSON APIでデータを取得してpostMessageで送信すること', async () => {
            const { updateDashboardData } = await import('../dashboard');

            const mockPanel = {
                webview: {
                    html: '',
                    postMessage: mockPostMessage,
                    onDidReceiveMessage: mockOnDidReceiveMessage,
                },
                reveal: mockReveal,
                onDidDispose: mockOnDidDispose,
            };
            mockDataCtx.dashboardPanel = mockPanel as unknown as typeof mockCtx.dashboardPanel;

            const serverUrl = 'http://localhost:3100';
            const projectPath = '/test/project';

            await updateDashboardData(mockDataCtx, serverUrl, projectPath);

            // JSON APIが呼ばれたことを確認
            expect(mockFetch).toHaveBeenCalled();
            const fetchCall = mockFetch.mock.calls[0][0] as string;
            expect(fetchCall).toContain('/dashboard/data');
            expect(fetchCall).toContain('completedLimit=10');
            expect(fetchCall).toContain('completedOffset=0');

            // postMessageが送信されたことを確認
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'dashboardUpdate',
                    stats: expect.any(Object),
                    tasks: expect.any(Object),
                })
            );
        });

        it('v2Html/v2データがpostMessageに含まれること', async () => {
            const { updateDashboardData } = await import('../dashboard');

            const mockPanel = {
                webview: {
                    html: '',
                    postMessage: mockPostMessage,
                    onDidReceiveMessage: mockOnDidReceiveMessage,
                },
                reveal: mockReveal,
                onDidDispose: mockOnDidDispose,
            };
            mockDataCtx.dashboardPanel = mockPanel as unknown as typeof mockCtx.dashboardPanel;

            // v2Html/v2を含むレスポンス
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    stats: { pendingCount: 1 },
                    tasks: { pending: '<div>task</div>' },
                    v2Html: { goals: '<div>goals</div>', reviewQueue: '<div>queue</div>' },
                    v2: { v2ReviewQueue: [] },
                }),
            });

            await updateDashboardData(mockDataCtx, 'http://localhost:3100', '/test/project');

            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'dashboardUpdate',
                    v2Html: expect.objectContaining({ goals: expect.any(String) }),
                    v2: expect.any(Object),
                })
            );
        });
    });

    describe('fetchCompletedPage', () => {
        it('完了タスクのページネーションデータを取得してpostMessageで送信すること', async () => {
            const { fetchCompletedPage } = await import('../web-dashboard');

            mockCtx.dashboardPanel = {
                webview: {
                    html: '',
                    postMessage: mockPostMessage,
                    onDidReceiveMessage: mockOnDidReceiveMessage,
                },
                reveal: mockReveal,
                onDidDispose: mockOnDidDispose,
            } as unknown as typeof mockCtx.dashboardPanel;

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    html: '<div>completed tasks</div>',
                    total: 50,
                    offset: 10,
                    limit: 10,
                    hasMore: true,
                }),
            });

            await fetchCompletedPage(mockCtx, 10, 10, 'completedAt');

            // APIが正しいパラメータで呼ばれたことを確認
            const fetchCall = mockFetch.mock.calls[0][0] as string;
            expect(fetchCall).toContain('/dashboard/completed');
            expect(fetchCall).toContain('offset=10');
            expect(fetchCall).toContain('limit=10');
            expect(fetchCall).toContain('completedSortField=completedAt');

            // postMessageが送信されたことを確認
            expect(mockPostMessage).toHaveBeenCalledWith({
                type: 'completedPageUpdate',
                html: '<div>completed tasks</div>',
                total: 50,
                offset: 10,
                limit: 10,
            });
        });
    });

    describe('openDashboardInBrowser', () => {
        it('ブラウザでダッシュボードURLを開くこと', async () => {
            const { openDashboardInBrowser } = await import('../web-dashboard');
            const vscode = await import('vscode');

            mockCtx.workspaceRoot = '/test/workspace';

            openDashboardInBrowser(mockCtx);

            expect(vscode.env.openExternal).toHaveBeenCalledWith(
                expect.objectContaining({
                    toString: expect.any(Function),
                })
            );
        });
    });

    describe('updateDashboard エラーハンドリング', () => {
        it('サーバー接続失敗時にエラー画面を表示すること', async () => {
            const { updateDashboard } = await import('../web-dashboard');

            mockCtx.dashboardPanel = {
                webview: {
                    html: '',
                    postMessage: mockPostMessage,
                    onDidReceiveMessage: mockOnDidReceiveMessage,
                },
                reveal: mockReveal,
                onDidDispose: mockOnDidDispose,
            } as unknown as typeof mockCtx.dashboardPanel;

            // ECONNREFUSED エラーをシミュレート
            const error = new Error('Connection refused');
            (error as NodeJS.ErrnoException).code = 'ECONNREFUSED';
            mockFetch.mockRejectedValueOnce(error);

            await updateDashboard(mockCtx);

            // エラー画面が表示されたことを確認
            expect(mockCtx.dashboardPanel!.webview.html).toContain('MCPサーバーに接続できません');
            expect(mockCtx.dashboardPanel!.webview.html).toContain('再試行');
        });

        it('連続失敗回数がカウントされること', async () => {
            const { updateDashboard } = await import('../web-dashboard');

            mockCtx.dashboardPanel = {
                webview: {
                    html: '',
                    postMessage: mockPostMessage,
                    onDidReceiveMessage: mockOnDidReceiveMessage,
                },
                reveal: mockReveal,
                onDidDispose: mockOnDidDispose,
            } as unknown as typeof mockCtx.dashboardPanel;

            // 通常のエラー（ECONNREFUSED以外）
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            await updateDashboard(mockCtx);

            // 失敗カウントが増加したことを確認
            expect(mockCtx.dashboardConsecutiveFailures).toBe(1);
        });
    });
});
