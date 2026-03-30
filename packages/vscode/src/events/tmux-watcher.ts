/**
 * tmuxウィンドウ監視モジュール
 *
 * tmuxセッション内のアクティブウィンドウを監視し、
 * 現在のエージェントをパネルに反映する。
 */

import * as vscode from 'vscode';
import { Agent } from '../types';
import { getMultiplexerCommand } from '../utils/environment';
import { ITerminalMultiplexer } from '../multiplexer';
import { AgentPanelProvider } from '../ui/agent-panel-provider';
import { getSavedRuntimeMode } from '../setup/global-init';

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
}

/**
 * tmux監視の状態を初期化
 */
export function createTmuxWatcherState(): TmuxWatcherState {
    return {
        pollingInterval: undefined,
        lastDetectedAgentId: null,
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
        // ランタイムモードに応じてマルチプレクサコマンドを取得
        const runtimeMode = getSavedRuntimeMode();
        const muxCmd = getMultiplexerCommand(runtimeMode);
        const result = require('child_process').execSync(
            `${muxCmd} display-message -t "${ctx.tmuxSessionName}" -p "#{window_name}"`,
            { encoding: 'utf-8', timeout: 1000 }
        ).trim();

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
        startTmuxWindowPolling(ctx, state);
    } else if (!agentId && terminalName.includes('Maid Agent')) {
        // ターミナル名でtmuxビューアを判定（参照比較の代替）
        ctx.log(`[AgentPanel] tmuxビューア検出（名前ベース）: ${terminalName}`);
        agentId = getCurrentTmuxWindowAgent(ctx);
        startTmuxWindowPolling(ctx, state);
    } else {
        stopTmuxWindowPolling(ctx, state);
    }

    ctx.agentPanelProvider.setCurrentAgent(agentId);
}

/**
 * tmuxウィンドウのポーリングを開始（500msごとにチェック）
 */
export function startTmuxWindowPolling(
    ctx: TmuxWatcherContext,
    state: TmuxWatcherState
): void {
    if (state.pollingInterval) return; // 既に実行中

    state.pollingInterval = setInterval(() => {
        const currentAgentId = getCurrentTmuxWindowAgent(ctx);

        // 変更があった場合のみ更新
        if (currentAgentId !== state.lastDetectedAgentId) {
            ctx.log(`[AgentPanel] tmuxウィンドウ変更検出: ${state.lastDetectedAgentId} → ${currentAgentId}`);
            state.lastDetectedAgentId = currentAgentId;
            if (ctx.agentPanelProvider) {
                ctx.agentPanelProvider.setCurrentAgent(currentAgentId);
            }
        }
    }, 500);

    ctx.log('[tmux] ウィンドウ監視ポーリングを開始');
}

/**
 * tmuxウィンドウのポーリングを停止
 */
export function stopTmuxWindowPolling(
    ctx: TmuxWatcherContext,
    state: TmuxWatcherState
): void {
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = undefined;
        state.lastDetectedAgentId = null;
        ctx.log('[tmux] ウィンドウ監視ポーリングを停止');
    }
}

/**
 * tmux監視の状態をクリーンアップ
 */
export function disposeTmuxWatcher(state: TmuxWatcherState): void {
    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = undefined;
    }
    state.lastDetectedAgentId = null;
}
