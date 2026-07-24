/**
 * tmuxウィンドウ監視モジュール
 *
 * tmuxセッション内のアクティブウィンドウを監視し、
 * 現在のエージェントをパネルに反映する。
 *
 * 監視方式は2段構え:
 * 1. control mode 常駐クライアント（イベント駆動・プロセス生成ゼロ）… tmux のみ
 * 2. 500msポーリング … psmux、または control mode が利用不能な場合のフォールバック
 *    （ポーリングは1回ごとに cmd/wsl/conhost プロセスを生成するため、
 *      カーネルメモリリークの増幅要因になる。可能な限り 1. を使う）
 */

import * as vscode from 'vscode';
import { Agent } from '../types';
import { ITerminalMultiplexer } from '../multiplexer';
import { AgentPanelProvider } from '../ui/agent-panel-provider';
import { ControlModeClient } from './control-mode-client';

/**
 * tmux監視に必要なコンテキスト
 */
export interface TmuxWatcherContext {
    agents: Map<string, Agent>;
    tmuxManager: ITerminalMultiplexer | undefined;
    tmuxSessionName: string;
    tmuxViewerTerminal: vscode.Terminal | undefined;
    agentPanelProvider: AgentPanelProvider | undefined;
    log: (msg: string) => void;
}

/**
 * tmux監視の状態
 */
export interface TmuxWatcherState {
    pollingInterval: NodeJS.Timeout | undefined;
    lastDetectedAgentId: string | null;
    /** control mode 常駐クライアント（イベント駆動監視） */
    controlModeClient: ControlModeClient | undefined;
    /** control mode が失敗しポーリングへ恒久フォールバックしたか */
    controlModeFailed: boolean;
}

/**
 * tmux監視の状態を初期化
 */
export function createTmuxWatcherState(): TmuxWatcherState {
    return {
        pollingInterval: undefined,
        lastDetectedAgentId: null,
        controlModeClient: undefined,
        controlModeFailed: false,
    };
}

/**
 * tmuxの現在のウィンドウ名からエージェントIDを取得
 */
export function getCurrentTmuxWindowAgent(ctx: TmuxWatcherContext): string | null {
    if (!ctx.tmuxManager || !ctx.tmuxSessionName) {
        return null;
    }

    try {
        // multiplexer層経由で現在のウィンドウ名を取得
        const result = ctx.tmuxManager.getCurrentWindowName();
        if (!result) {
            return null;
        }

        // ウィンドウ名がエージェントIDと一致するか確認
        if (ctx.agents.has(result)) {
            return result;
        }

        // デバッグ: ウィンドウ名が見つかったが登録エージェントに存在しない場合
        const registeredAgents = Array.from(ctx.agents.keys()).join(', ');
        ctx.log(`[AgentPanel] ウィンドウ '${result}' は登録エージェントに存在しません (登録: ${registeredAgents || 'なし'})`);
    } catch {
        // tmuxコマンドが失敗した場合は無視（ポーリング中は頻繁に呼ばれるためログ省略）
    }
    return null;
}

/**
 * ターミナルから現在のエージェントを設定
 */
export function setCurrentAgentFromTerminal(
    ctx: TmuxWatcherContext,
    state: TmuxWatcherState,
    terminal: vscode.Terminal | undefined,
    getAgentIdFromTerminal: (terminal: vscode.Terminal) => string | null
): void {
    if (!ctx.agentPanelProvider) return;

    if (!terminal) {
        stopTmuxWindowPolling(ctx, state);
        ctx.agentPanelProvider.setCurrentAgent(null);
        return;
    }

    // まず従来の方式を試す
    let agentId = getAgentIdFromTerminal(terminal);

    // tmuxビューアターミナルの場合、tmuxのウィンドウ名から特定 + ポーリング開始
    const isTmuxViewer = terminal === ctx.tmuxViewerTerminal;
    const terminalName = terminal.name;

    if (!agentId && isTmuxViewer) {
        agentId = getCurrentTmuxWindowAgent(ctx);
        startTmuxWindowWatching(ctx, state);
    } else if (!agentId && terminalName.includes('Maid Agent')) {
        // ターミナル名でtmuxビューアを判定（参照比較の代替）
        ctx.log(`[AgentPanel] tmuxビューア検出（名前ベース）: ${terminalName}`);
        agentId = getCurrentTmuxWindowAgent(ctx);
        startTmuxWindowWatching(ctx, state);
    } else {
        stopTmuxWindowPolling(ctx, state);
    }

    ctx.agentPanelProvider.setCurrentAgent(agentId);
}

/**
 * 検出したウィンドウ名をエージェントIDに解決し、変更時のみパネルへ反映する
 */
function handleDetectedWindowName(
    ctx: TmuxWatcherContext,
    state: TmuxWatcherState,
    windowName: string | null
): void {
    const currentAgentId = windowName && ctx.agents.has(windowName) ? windowName : null;

    if (currentAgentId !== state.lastDetectedAgentId) {
        ctx.log(`[AgentPanel] tmuxウィンドウ変更検出: ${state.lastDetectedAgentId} → ${currentAgentId}`);
        state.lastDetectedAgentId = currentAgentId;
        if (ctx.agentPanelProvider) {
            ctx.agentPanelProvider.setCurrentAgent(currentAgentId);
        }
    }
}

/**
 * tmuxウィンドウの監視を開始
 *
 * control mode（イベント駆動）を優先し、非対応または失敗時のみポーリングを使う。
 */
export function startTmuxWindowWatching(
    ctx: TmuxWatcherContext,
    state: TmuxWatcherState
): void {
    if (state.controlModeClient || state.pollingInterval) return; // 既に実行中

    const spawnSpec = !state.controlModeFailed
        ? ctx.tmuxManager?.getControlModeSpawn() ?? null
        : null;

    if (!spawnSpec) {
        startTmuxWindowPolling(ctx, state);
        return;
    }

    state.controlModeClient = new ControlModeClient({
        command: spawnSpec.command,
        args: spawnSpec.args,
        sessionName: ctx.tmuxSessionName,
        onWindowName: (name) => handleDetectedWindowName(ctx, state, name),
        onLog: (msg) => ctx.log(msg),
        onFatal: () => {
            // control mode が使えない環境ではポーリングへフォールバック
            ctx.log('[tmux] control mode が利用できないためポーリングへフォールバックします');
            state.controlModeFailed = true;
            state.controlModeClient = undefined;
            startTmuxWindowPolling(ctx, state);
        },
    });
    state.controlModeClient.start();
    ctx.log('[tmux] control mode によるウィンドウ監視を開始（イベント駆動）');
}

/**
 * tmuxウィンドウのポーリングを開始（500msごとにチェック）
 *
 * 注意: 1回ごとに子プロセスを生成するため、control mode が使えない場合の
 * フォールバック専用。直接呼ばず startTmuxWindowWatching を使うこと。
 */
export function startTmuxWindowPolling(
    ctx: TmuxWatcherContext,
    state: TmuxWatcherState
): void {
    if (state.pollingInterval) return; // 既に実行中

    state.pollingInterval = setInterval(() => {
        const currentAgentId = getCurrentTmuxWindowAgent(ctx);
        handleDetectedWindowName(ctx, state, currentAgentId);
    }, 500);

    ctx.log('[tmux] ウィンドウ監視ポーリングを開始');
}

/**
 * tmuxウィンドウの監視を停止（control mode・ポーリング共通）
 */
export function stopTmuxWindowPolling(
    ctx: TmuxWatcherContext,
    state: TmuxWatcherState
): void {
    let stopped = false;
    if (state.controlModeClient) {
        state.controlModeClient.dispose();
        state.controlModeClient = undefined;
        stopped = true;
    }
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = undefined;
        stopped = true;
    }
    if (stopped) {
        state.lastDetectedAgentId = null;
        ctx.log('[tmux] ウィンドウ監視を停止');
    }
}

/**
 * tmux監視の状態をクリーンアップ
 */
export function disposeTmuxWatcher(state: TmuxWatcherState): void {
    if (state.controlModeClient) {
        state.controlModeClient.dispose();
        state.controlModeClient = undefined;
    }
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = undefined;
    }
    state.lastDetectedAgentId = null;
}
