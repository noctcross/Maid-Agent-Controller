/**
 * openTmuxViewer() の既存タブ再利用テスト（task-1660-1）
 *
 * 起動時（拡張機能再アクティベート時）、メモリ内参照(ctx.tmuxViewerTerminal)は
 * 失われるが VSCode 上には前回作成した 'Maid Agent' タブが実在するケースで、
 * 新規タブを作らず既存タブを再利用することを検証する。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
    window: {
        terminals: [] as Array<{ name: string; show: ReturnType<typeof vi.fn> }>,
        createTerminal: vi.fn(() => ({
            name: '🎩 Maid Agent (tmux)',
            show: vi.fn(),
            sendText: vi.fn(),
            dispose: vi.fn(),
        })),
    },
}));

const createViewerTerminalMock = vi.fn(() => ({
    name: '🎩 Maid Agent (tmux)',
    show: vi.fn(),
    dispose: vi.fn(),
}));

vi.mock('../../utils/environment', () => ({
    ENV: {
        getTerminalFactory: vi.fn(() => ({
            createViewerTerminal: createViewerTerminalMock,
        })),
    },
}));

import * as vscode from 'vscode';
import { openTmuxViewer } from '../agent-startup';
import type { AgentContext } from '../../types';

function createMockContext(overrides: Partial<AgentContext> = {}): AgentContext {
    return {
        tmuxManager: { createSession: vi.fn() } as unknown as AgentContext['tmuxManager'],
        multiplexerFactory: { getType: () => 'tmux' } as unknown as AgentContext['multiplexerFactory'],
        tmuxSessionName: 'maid-agent-test',
        tmuxViewerTerminal: undefined,
        workspaceRoot: '/test/workspace',
        settings: undefined,
        initializeTmuxSession: vi.fn(),
        log: vi.fn(),
        ...overrides,
    } as AgentContext;
}

describe('openTmuxViewer - 既存タブ再利用', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (vscode.window as unknown as { terminals: unknown[] }).terminals = [];
    });

    it('メモリ内参照・実在タブのいずれもない場合は新規作成すること', () => {
        const ctx = createMockContext();

        openTmuxViewer(ctx);

        expect(createViewerTerminalMock).toHaveBeenCalledTimes(1);
        expect(ctx.tmuxViewerTerminal).toBeDefined();
    });

    it('実在するVSCodeタブ（同名）があれば再利用し、新規作成しないこと', () => {
        const existingShow = vi.fn();
        (vscode.window as unknown as { terminals: unknown[] }).terminals = [
            { name: '🎩 Maid Agent (tmux)', show: existingShow },
        ];
        const ctx = createMockContext();

        openTmuxViewer(ctx);

        expect(createViewerTerminalMock).not.toHaveBeenCalled();
        expect(existingShow).toHaveBeenCalledTimes(1);
        expect(ctx.tmuxViewerTerminal).toBe(
            (vscode.window as unknown as { terminals: Array<{ name: string }> }).terminals[0]
        );
    });

    it('リロードを繰り返しても2回目以降は新規タブが増えないこと', () => {
        const ctx1 = createMockContext();
        openTmuxViewer(ctx1);
        expect(createViewerTerminalMock).toHaveBeenCalledTimes(1);

        // 拡張機能の再アクティベートを模し、メモリ内参照を失った新しい ctx を用意。
        // ただし VSCode 上には直前に作成したタブが実在する状態。
        (vscode.window as unknown as { terminals: unknown[] }).terminals = [
            ctx1.tmuxViewerTerminal as unknown as { name: string },
        ];
        const ctx2 = createMockContext();

        openTmuxViewer(ctx2);

        expect(createViewerTerminalMock).toHaveBeenCalledTimes(1);
    });

    it('ctx.tmuxViewerTerminal（メモリ内参照）があれば最優先で再利用すること', () => {
        const memoryShow = vi.fn();
        const ctx = createMockContext({
            tmuxViewerTerminal: { name: 'memory-ref', show: memoryShow } as unknown as AgentContext['tmuxViewerTerminal'],
        });

        openTmuxViewer(ctx);

        expect(memoryShow).toHaveBeenCalledTimes(1);
        expect(createViewerTerminalMock).not.toHaveBeenCalled();
    });
});
