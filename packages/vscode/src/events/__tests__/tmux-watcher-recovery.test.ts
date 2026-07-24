import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vscode は型参照のみのため空モック
vi.mock('vscode', () => ({}));
vi.mock('../../ui/agent-panel-provider', () => ({}));

// ControlModeClient をモックし、onFatal を任意タイミングで発火できるようにする
const { clientInstances } = vi.hoisted(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientInstances: [] as any[],
}));

vi.mock('../control-mode-client', () => {
    class FakeControlModeClient {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public options: any;
        public start = vi.fn();
        public dispose = vi.fn();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor(options: any) {
            this.options = options;
            clientInstances.push(this);
        }
    }
    return { ControlModeClient: FakeControlModeClient };
});

import {
    createTmuxWatcherState,
    startTmuxWindowWatching,
    stopTmuxWindowPolling,
    disposeTmuxWatcher,
    CONTROL_MODE_REATTEMPT_MS,
    type TmuxWatcherContext,
    type TmuxWatcherState,
} from '../tmux-watcher';
import { Agent } from '../../types';

function createContext(): TmuxWatcherContext {
    const agents = new Map<string, Agent>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agents.set('emma', {} as any);
    return {
        agents,
        tmuxManager: {
            getControlModeSpawn: vi.fn(() => ({
                command: 'wsl',
                args: ['tmux', '-C', 'attach-session', '-t', 'maid-session'],
            })),
            getCurrentWindowName: vi.fn(() => 'emma'),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        tmuxSessionName: 'maid-session',
        tmuxViewerTerminal: undefined,
        agentPanelProvider: undefined,
        log: vi.fn(),
    };
}

describe('tmux-watcher control mode 自己回復', () => {
    let ctx: TmuxWatcherContext;
    let state: TmuxWatcherState;

    beforeEach(() => {
        vi.useFakeTimers();
        clientInstances.length = 0;
        ctx = createContext();
        state = createTmuxWatcherState();
    });

    afterEach(() => {
        disposeTmuxWatcher(state);
        vi.useRealTimers();
    });

    it('onFatal 後はポーリングにフォールバックすること', () => {
        startTmuxWindowWatching(ctx, state);
        expect(clientInstances).toHaveLength(1);

        clientInstances[0].options.onFatal();
        expect(state.pollingInterval).toBeDefined();

        // ポーリングが実際に動作している
        vi.advanceTimersByTime(500);
        expect(ctx.tmuxManager?.getCurrentWindowName).toHaveBeenCalled();
    });

    it('フォールバック後、クールダウン経過で control mode を再試行すること', () => {
        startTmuxWindowWatching(ctx, state);
        clientInstances[0].options.onFatal();
        expect(state.pollingInterval).toBeDefined();

        vi.advanceTimersByTime(CONTROL_MODE_REATTEMPT_MS);

        // ポーリングが止まり、新しい control mode クライアントが起動している
        expect(state.pollingInterval).toBeUndefined();
        expect(clientInstances).toHaveLength(2);
        expect(clientInstances[1].start).toHaveBeenCalled();
    });

    it('再試行した control mode が再度失敗しても、再びフォールバック＋次の再試行が予約されること', () => {
        startTmuxWindowWatching(ctx, state);
        clientInstances[0].options.onFatal();
        vi.advanceTimersByTime(CONTROL_MODE_REATTEMPT_MS);
        expect(clientInstances).toHaveLength(2);

        clientInstances[1].options.onFatal();
        expect(state.pollingInterval).toBeDefined();

        vi.advanceTimersByTime(CONTROL_MODE_REATTEMPT_MS);
        expect(clientInstances).toHaveLength(3);
    });

    it('監視停止中はクールダウンが経過しても再試行しないこと', () => {
        startTmuxWindowWatching(ctx, state);
        clientInstances[0].options.onFatal();

        stopTmuxWindowPolling(ctx, state);
        vi.advanceTimersByTime(CONTROL_MODE_REATTEMPT_MS * 2);

        expect(clientInstances).toHaveLength(1);
        expect(state.pollingInterval).toBeUndefined();
    });

    it('disposeTmuxWatcher で再試行タイマーもクリアされること', () => {
        startTmuxWindowWatching(ctx, state);
        clientInstances[0].options.onFatal();

        disposeTmuxWatcher(state);
        vi.advanceTimersByTime(CONTROL_MODE_REATTEMPT_MS * 2);

        expect(clientInstances).toHaveLength(1);
    });

    it('監視の再開時（stop→start）は失敗履歴に関係なく control mode を優先すること', () => {
        startTmuxWindowWatching(ctx, state);
        clientInstances[0].options.onFatal();
        stopTmuxWindowPolling(ctx, state);

        startTmuxWindowWatching(ctx, state);
        expect(clientInstances).toHaveLength(2);
        expect(clientInstances[1].start).toHaveBeenCalled();
    });
});
