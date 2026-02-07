import { AgentPanelProvider } from '../ui/agent-panel-provider';
import type { Agent } from '../types';

// fs モジュールのモック
jest.mock('fs', () => ({
    existsSync: jest.fn(() => false),
    readdirSync: jest.fn(() => []),
}));

// テスト用 Webview モックを生成するヘルパー
function createMockWebviewView() {
    const mockWebview = {
        options: {} as Record<string, unknown>,
        html: '',
        asWebviewUri: (uri: { fsPath: string }) => ({ toString: () => uri.fsPath }),
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
    };
    return {
        webview: mockWebview,
    };
}

describe('AgentPanelProvider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('viewType', () => {
        it('should have correct static viewType', () => {
            expect(AgentPanelProvider.viewType).toBe('maidAgent.agentPanel');
        });
    });

    describe('メッセージハンドリング', () => {
        it('should call registered callback on message', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const callback = jest.fn();
            provider.onMessage(callback);

            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            // onDidReceiveMessage に渡されたリスナーを取得して呼び出す
            const listener = mockView.webview.onDidReceiveMessage.mock.calls[0][0] as (msg: unknown) => void;
            listener({ command: 'refresh' });

            expect(callback).toHaveBeenCalledWith({ command: 'refresh' });
        });

        it('should handle selectAgent message', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const callback = jest.fn();
            provider.onMessage(callback);

            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            const listener = mockView.webview.onDidReceiveMessage.mock.calls[0][0] as (msg: unknown) => void;
            listener({ command: 'selectAgent', agentId: 'emma' });

            expect(callback).toHaveBeenCalledWith({ command: 'selectAgent', agentId: 'emma' });
        });

        it('should not throw when no callback registered', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);

            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            const listener = mockView.webview.onDidReceiveMessage.mock.calls[0][0] as (msg: unknown) => void;
            expect(() => listener({ command: 'refresh' })).not.toThrow();
        });
    });

    describe('HTML生成', () => {
        it('should generate no-agent HTML when no agent selected', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            expect(mockView.webview.html).toContain('エージェントのターミナルを');
        });

        it('should generate agent HTML with emoji fallback when no image', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            provider.setWorkspaceRoot('/test/workspace');

            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            const agents = new Map<string, Agent>();
            agents.set('emma', { name: 'エマ', id: 'emma', role: 'maid', status: 'working', tmuxWindow: 'emma' });
            provider.setAgents(agents);
            provider.setCurrentAgent('emma');

            expect(mockView.webview.html).toContain('エマ');
            expect(mockView.webview.html).toContain('🎀');
        });

        it('should include agent list section when agents exist', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            const agents = new Map<string, Agent>();
            agents.set('butler', { name: 'シルヴィア', id: 'butler', role: 'butler', status: 'idle', tmuxWindow: 'butler' });
            agents.set('emma', { name: 'エマ', id: 'emma', role: 'maid', status: 'working', tmuxWindow: 'emma' });
            provider.setAgents(agents);

            expect(mockView.webview.html).toContain('チーム');
            expect(mockView.webview.html).toContain('シルヴィア');
            expect(mockView.webview.html).toContain('エマ');
            expect(mockView.webview.html).toContain('🎩');
            expect(mockView.webview.html).toContain('🎀');
        });

        it('should include quick actions section', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            expect(mockView.webview.html).toContain('クイックアクション');
            expect(mockView.webview.html).toContain('Controller');
            expect(mockView.webview.html).toContain('Tasks');
        });
    });

    describe('タスク統計', () => {
        it('should display stats when set', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            provider.setTaskStats({
                pendingCount: 3,
                workingCount: 2,
                blockedCount: 1,
                completedTodayCount: 5,
                actionRequiredCount: 2,
            });

            expect(mockView.webview.html).toContain('待機: 3');
            expect(mockView.webview.html).toContain('進行: 2');
            expect(mockView.webview.html).toContain('完了: 5');
        });

        it('should display alerts when action required or blocked', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            provider.setTaskStats({
                pendingCount: 0,
                workingCount: 0,
                blockedCount: 2,
                completedTodayCount: 0,
                actionRequiredCount: 1,
            });

            expect(mockView.webview.html).toContain('アラート');
            expect(mockView.webview.html).toContain('🚨 要対応: 1件');
            expect(mockView.webview.html).toContain('🚫 ブロック: 2件');
        });

        it('should not display alerts when counts are zero', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            provider.setTaskStats({
                pendingCount: 5,
                workingCount: 1,
                blockedCount: 0,
                completedTodayCount: 3,
                actionRequiredCount: 0,
            });

            expect(mockView.webview.html).not.toContain('section-title">アラート');
            expect(mockView.webview.html).not.toContain('🚨 要対応');
            expect(mockView.webview.html).not.toContain('🚫 ブロック');
        });
    });

    describe('postUpdate', () => {
        it('should send message to webview', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            const mockView = createMockWebviewView();
            provider.resolveWebviewView(mockView as never, {} as never, {} as never);

            provider.postUpdate({ currentAgentId: 'emma' });

            expect(mockView.webview.postMessage).toHaveBeenCalledWith({
                type: 'update',
                currentAgentId: 'emma',
            });
        });

        it('should not throw when view is not resolved', () => {
            const provider = new AgentPanelProvider({ fsPath: '/ext' } as never);
            expect(() => provider.postUpdate({ currentAgentId: 'emma' })).not.toThrow();
        });
    });
});
