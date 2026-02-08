import { describe, it, expect, vi, beforeEach } from 'vitest';

// vscode モックを定義
vi.mock('vscode', () => ({
    window: {
        showQuickPick: vi.fn(),
        showWarningMessage: vi.fn(),
        showInformationMessage: vi.fn(),
        withProgress: vi.fn(),
    },
    ProgressLocation: { Notification: 15 },
}));

import * as vscode from 'vscode';
import type { Agent, AgentContext } from '../../types';

// テスト対象は実装後にインポート
// killPick, restartPick をテスト

/**
 * テスト用 AgentContext のモックを生成
 */
function createMockCtx(agents: Map<string, Agent> = new Map()): AgentContext {
    return {
        agents,
        workspaceRoot: '/test/workspace',
        maidAgentPath: '/test/workspace/.maid-agent',
        outputChannel: { appendLine: vi.fn() } as any,
        context: {} as any,
        tmuxManager: { killWindow: vi.fn(), createWindow: vi.fn(), windowExists: vi.fn() } as any,
        tmuxSessionName: 'test-session',
        tmuxViewerTerminal: undefined,
        agentPanelProvider: undefined,
        statusBarItem: undefined,
        statusBarResetTimeout: undefined,
        log: vi.fn(),
        updateController: vi.fn(),
        updateAgentPanel: vi.fn(),
        delay: vi.fn().mockResolvedValue(undefined),
        startWatchingFiles: vi.fn(),
        initializeWorkspace: vi.fn().mockResolvedValue(true),
        installTmux: vi.fn().mockResolvedValue(true),
        showTmuxInstallInstructions: vi.fn(),
        createSetupContext: vi.fn(),
        ensureWslAvailable: vi.fn().mockResolvedValue(true),
        createAgent: vi.fn((name, id, role, emoji) => {
            const agent: Agent = { name, id, tmuxWindow: id, role, status: 'idle' };
            agents.set(id, agent);
            return agent;
        }),
        sendToAgent: vi.fn().mockReturnValue(true),
        sendMessageToAgent: vi.fn().mockResolvedValue(true),
        deliverPendingMessages: vi.fn().mockResolvedValue(undefined),
        initializeTmuxSession: vi.fn(),
        saveSessionNameToFile: vi.fn(),
        openTmuxViewer: vi.fn(),
        getRolePrompt: vi.fn().mockReturnValue(''),
        launchClaudeWithRole: vi.fn().mockResolvedValue(undefined),
        ensureInitialized: vi.fn().mockResolvedValue(true),
        checkExistingSessionAndPrompt: vi.fn().mockResolvedValue('new'),
        checkSessionCountWarning: vi.fn().mockResolvedValue(undefined),
        ensureMcpServerRunning: vi.fn().mockResolvedValue(undefined),
        ensureTmuxAvailable: vi.fn().mockResolvedValue(true),
        captureAgentOutput: vi.fn().mockReturnValue(''),
        resumeSessions: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * テスト用エージェントデータを生成
 */
function createTestAgents(): Map<string, Agent> {
    const agents = new Map<string, Agent>();
    agents.set('butler', { name: 'シルヴィア', id: 'butler', tmuxWindow: 'butler', role: 'butler', status: 'idle' });
    agents.set('chief', { name: 'ビオラ', id: 'chief', tmuxWindow: 'chief', role: 'chiefMaid', status: 'idle' });
    agents.set('emma', { name: 'エマ', id: 'emma', tmuxWindow: 'emma', role: 'maid', status: 'working' });
    agents.set('rose', { name: 'ローズ', id: 'rose', tmuxWindow: 'rose', role: 'maid', status: 'idle' });
    return agents;
}

// ===================================================================
// killPick テスト
// ===================================================================
describe('killPick', () => {
    let killPick: (ctx: AgentContext) => Promise<void>;
    let killAgent: (ctx: AgentContext, agentId: string) => void;

    beforeEach(async () => {
        vi.restoreAllMocks();
        // 動的インポートで最新のモジュールを取得
        const mod = await import('../agent-lifecycle');
        killPick = mod.killPick;
        killAgent = mod.killAgent;
    });

    it('起動中のエージェントがいない場合、警告メッセージを表示すること', async () => {
        const ctx = createMockCtx();

        await killPick(ctx);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            '起動中のエージェントがいません'
        );
    });

    it('QuickPick でキャンセルした場合、何も終了しないこと', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);

        await killPick(ctx);

        // エージェント数は変わらない
        expect(agents.size).toBe(4);
    });

    it('空の選択の場合、何も終了しないこと', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue([] as any);

        await killPick(ctx);

        expect(agents.size).toBe(4);
    });

    it('単一エージェントを選択して終了できること', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);

        vi.mocked(vscode.window.showQuickPick).mockResolvedValue([
            { label: '☕ エマ', description: 'emma', detail: 'ステータス: working', agentId: 'emma' }
        ] as any);

        await killPick(ctx);

        // emma が削除されている
        expect(agents.has('emma')).toBe(false);
        // 他のエージェントは残っている
        expect(agents.has('butler')).toBe(true);
        expect(agents.has('chief')).toBe(true);
        expect(agents.has('rose')).toBe(true);
        // 完了メッセージ
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('複数エージェントを選択して終了できること', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);

        vi.mocked(vscode.window.showQuickPick).mockResolvedValue([
            { label: '☕ エマ', description: 'emma', detail: 'ステータス: working', agentId: 'emma' },
            { label: '🌹 ローズ', description: 'rose', detail: 'ステータス: idle', agentId: 'rose' },
        ] as any);

        await killPick(ctx);

        expect(agents.has('emma')).toBe(false);
        expect(agents.has('rose')).toBe(false);
        expect(agents.has('butler')).toBe(true);
        expect(agents.has('chief')).toBe(true);
    });

    it('QuickPick に canPickMany: true が渡されること', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);

        await killPick(ctx);

        expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ canPickMany: true })
        );
    });

    it('エージェントがロール順（butler→chiefMaid→maid）で表示されること', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);

        await killPick(ctx);

        const items = vi.mocked(vscode.window.showQuickPick).mock.calls[0][0] as any[];
        // butler, chief, emma, rose の順
        expect(items[0].agentId).toBe('butler');
        expect(items[1].agentId).toBe('chief');
        // maid 2人は butler/chief の後
        const maidIds = items.slice(2).map((i: any) => i.agentId);
        expect(maidIds).toContain('emma');
        expect(maidIds).toContain('rose');
    });
});

// ===================================================================
// restartPick テスト
// ===================================================================
describe('restartPick', () => {
    let restartPick: (ctx: AgentContext) => Promise<void>;

    beforeEach(async () => {
        vi.restoreAllMocks();
        const mod = await import('../agent-lifecycle');
        restartPick = mod.restartPick;
    });

    it('起動中のエージェントがいない場合、警告メッセージを表示すること', async () => {
        const ctx = createMockCtx();

        await restartPick(ctx);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            '起動中のエージェントがいません'
        );
    });

    it('QuickPick でキャンセルした場合、何も再起動しないこと', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);

        await restartPick(ctx);

        expect(ctx.createAgent).not.toHaveBeenCalled();
        expect(ctx.launchClaudeWithRole).not.toHaveBeenCalled();
    });

    it('単一メイドを選択して再起動できること', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);

        vi.mocked(vscode.window.showQuickPick).mockResolvedValue([
            { label: '☕ エマ', description: 'emma', detail: 'ステータス: working', agentId: 'emma', agentRole: 'maid', agentName: 'エマ', agentEmoji: '☕' }
        ] as any);

        // withProgress はコールバックを即座に実行
        vi.mocked(vscode.window.withProgress).mockImplementation(async (_options, callback) => {
            return callback({ report: vi.fn() } as any, {} as any);
        });

        await restartPick(ctx);

        // killAgent が呼ばれた（agents mapから削除される）
        // createAgent が呼ばれた
        expect(ctx.createAgent).toHaveBeenCalledWith('エマ', 'emma', 'maid', '☕');
        // launchClaudeWithRole が呼ばれた
        expect(ctx.launchClaudeWithRole).toHaveBeenCalledWith('emma', 'maid', 'エマ');
        // 完了メッセージ
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('執事を再起動する場合、maidName を渡さないこと', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);

        vi.mocked(vscode.window.showQuickPick).mockResolvedValue([
            { label: '🎩 シルヴィア', description: 'butler', detail: 'ステータス: idle', agentId: 'butler', agentRole: 'butler', agentName: 'シルヴィア', agentEmoji: '🎩' }
        ] as any);

        vi.mocked(vscode.window.withProgress).mockImplementation(async (_options, callback) => {
            return callback({ report: vi.fn() } as any, {} as any);
        });

        await restartPick(ctx);

        expect(ctx.createAgent).toHaveBeenCalledWith('シルヴィア', 'butler', 'butler', '🎩');
        expect(ctx.launchClaudeWithRole).toHaveBeenCalledWith('butler', 'butler', undefined);
    });

    it('withProgress が使用されること', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);

        vi.mocked(vscode.window.showQuickPick).mockResolvedValue([
            { label: '☕ エマ', description: 'emma', detail: 'ステータス: working', agentId: 'emma', agentRole: 'maid', agentName: 'エマ', agentEmoji: '☕' }
        ] as any);

        vi.mocked(vscode.window.withProgress).mockImplementation(async (_options, callback) => {
            return callback({ report: vi.fn() } as any, {} as any);
        });

        await restartPick(ctx);

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                location: 15, // ProgressLocation.Notification
                cancellable: false,
            }),
            expect.any(Function)
        );
    });

    it('QuickPick に canPickMany: true が渡されること', async () => {
        const agents = createTestAgents();
        const ctx = createMockCtx(agents);
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined as any);

        await restartPick(ctx);

        expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ canPickMany: true })
        );
    });
});
