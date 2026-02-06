import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, AgentContext } from '../types';
import { MAIDS, MAIDS_MAP, MAID_AGENT_DIR } from '../constants';
import { getOrderedMaids } from '../utils/helpers';

// =============================================================================
// エージェントライフサイクル管理
// =============================================================================

/**
 * エージェントを作成（tmuxウィンドウと内部状態の準備）
 */
export function createAgent(ctx: AgentContext, name: string, id: string, role: Agent['role'], emoji: string): Agent {
    if (!ctx.workspaceRoot || !ctx.tmuxManager) {
        throw new Error('ワークスペースが初期化されていません');
    }

    // tmuxセッションがなければ作成
    ctx.initializeTmuxSession();

    // tmuxウィンドウを作成
    const windowName = id;
    if (!ctx.tmuxManager.windowExists(windowName)) {
        ctx.tmuxManager.createWindow(windowName);
    }

    const agent: Agent = {
        name,
        id,
        tmuxWindow: windowName,
        role,
        status: 'idle'
    };
    ctx.agents.set(id, agent);

    ctx.log(`[${name}] 準備完了 (tmux window: ${windowName})`);
    ctx.updateAgentPanel();
    return agent;
}

/**
 * エージェントを終了（tmuxウィンドウと内部状態のクリーンアップ）
 */
export function killAgent(ctx: AgentContext, agentId: string): void {
    const agent = ctx.agents.get(agentId);
    if (!agent || !ctx.tmuxManager) return;

    // tmuxウィンドウを終了
    ctx.tmuxManager.killWindow(agent.tmuxWindow);
    ctx.agents.delete(agentId);
    ctx.updateAgentPanel();
    ctx.updateDashboard();
    ctx.log(`[${agent.name}] を終了しました`);
}

/**
 * 執事を起動
 */
export async function startButler(ctx: AgentContext): Promise<void> {
    if (!await ctx.ensureInitialized()) return;

    if (ctx.agents.has('butler')) {
        vscode.window.showWarningMessage('執事は既にお仕えしております');
        return;
    }

    // 既存セッションのチェック
    const action = await ctx.checkExistingSessionAndPrompt('butler', 'シルヴィア（執事）');
    if (action === 'cancel') return;

    ctx.createAgent('シルヴィア', 'butler', 'butler', '🎩');

    // tmuxビューアを開く
    ctx.openTmuxViewer();

    if (action === 'new') {
        // 新規起動: Claude Code を起動し、役割を認識させる
        await ctx.launchClaudeWithRole('butler', 'butler');
        vscode.window.showInformationMessage('🎩 シルヴィアがお仕えする準備ができました！');
    } else {
        // 復帰: Claudeコマンドは送信しない
        const agent = ctx.agents.get('butler');
        if (agent) agent.status = 'idle';
        vscode.window.showInformationMessage('🎩 シルヴィアが復帰しました！');
    }

    ctx.updateDashboard();
}

/**
 * メイド長を起動
 */
export async function startChiefMaid(ctx: AgentContext): Promise<void> {
    if (!await ctx.ensureInitialized()) return;

    if (ctx.agents.has('chief')) {
        vscode.window.showWarningMessage('メイド長は既にお仕えしております');
        return;
    }

    // 既存セッションのチェック
    const action = await ctx.checkExistingSessionAndPrompt('chief', 'ビオラ（メイド長）');
    if (action === 'cancel') return;

    ctx.createAgent('ビオラ', 'chief', 'chiefMaid', '👑');

    // tmuxビューアを開く（まだ開いていなければ）
    ctx.openTmuxViewer();

    if (action === 'new') {
        // 新規起動: Claude Code を起動し、役割を認識させる
        await ctx.launchClaudeWithRole('chief', 'chiefMaid');
        vscode.window.showInformationMessage('👑 ビオラがお仕えする準備ができました！');
    } else {
        // 復帰: Claudeコマンドは送信しない
        const agent = ctx.agents.get('chief');
        if (agent) agent.status = 'idle';
        vscode.window.showInformationMessage('👑 ビオラが復帰しました！');
    }

    ctx.updateDashboard();
}

/**
 * メイドを選択して起動
 */
export async function startSelectedMaids(ctx: AgentContext): Promise<void> {
    if (!await ctx.ensureInitialized()) return;

    // 未起動のメイドのみ選択肢に（設定順）
    const orderedMaids = getOrderedMaids();
    const availableMaids = orderedMaids.filter(m => !ctx.agents.has(m.id));

    if (availableMaids.length === 0) {
        vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
        return;
    }

    const items = availableMaids.map(m => ({
        label: `${m.emoji} ${m.name}`,
        id: m.id,
        picked: false
    }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: '起動するメイドを選択してください（複数選択可）'
    });

    if (!selected || selected.length === 0) {
        return;
    }

    for (const item of selected) {
        const maid = MAIDS.find(m => m.id === item.id);
        if (maid) {
            ctx.createAgent(maid.name, maid.id, 'maid', maid.emoji);
            // Claude Code を起動し、役割を認識させる
            await ctx.launchClaudeWithRole(maid.id, 'maid', maid.name);
        }
    }

    vscode.window.showInformationMessage(`🎀 メイド${selected.length}人がお仕えする準備ができました！`);
    ctx.updateDashboard();
}

/**
 * Call Maids xN - メイドN人を順番に起動
 */
export async function startMaidsByCount(ctx: AgentContext): Promise<void> {
    await _startMaidsByCountInternal(ctx, false);
}

/**
 * Call Maids xN -r - メイドN人をランダムに起動
 */
export async function startMaidsByCountRandom(ctx: AgentContext): Promise<void> {
    await _startMaidsByCountInternal(ctx, true);
}

/**
 * メイドN人を起動（内部実装）
 */
async function _startMaidsByCountInternal(ctx: AgentContext, random: boolean): Promise<void> {
    if (!await ctx.ensureInitialized()) return;

    const orderedMaids = getOrderedMaids();
    const availableMaids = orderedMaids.filter(m => !ctx.agents.has(m.id));

    if (availableMaids.length === 0) {
        vscode.window.showWarningMessage('メイドは既に全員お仕えしております');
        return;
    }

    const countStr = await vscode.window.showInputBox({
        prompt: `何人のメイドをお呼びしますか？（1〜${availableMaids.length}人）${random ? '【ランダム】' : '【順番】'}`,
        placeHolder: '例: 3',
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 1) {
                return '1以上の数値を入力してください';
            }
            if (num > availableMaids.length) {
                return `最大${availableMaids.length}人まで指定できます`;
            }
            return null;
        }
    });

    if (!countStr) return;

    const count = parseInt(countStr);

    let maidsToStart: typeof availableMaids;
    if (random) {
        const shuffled = [...availableMaids].sort(() => Math.random() - 0.5);
        maidsToStart = shuffled.slice(0, count);
    } else {
        maidsToStart = availableMaids.slice(0, count);
    }

    // 進捗表示付きでお呼び出し
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '🎀 メイドお仕えの準備中...',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < maidsToStart.length; i++) {
            const maid = maidsToStart[i];
            progress.report({
                message: `${maid.name}お仕えの準備中...`,
                increment: (100 / maidsToStart.length)
            });
            ctx.createAgent(maid.name, maid.id, 'maid', maid.emoji);
            await ctx.launchClaudeWithRole(maid.id, 'maid', maid.name);
        }
    });

    const maidNames = maidsToStart.map(m => m.name).join('、');
    vscode.window.showInformationMessage(`🎀 ${maidNames} がお仕えの準備を整えました！`);
    ctx.updateDashboard();
}

/**
 * Call All xN - 執事 + メイド長 + メイドN人を順番に起動
 */
export async function startAllByCount(ctx: AgentContext): Promise<void> {
    await _startAllByCountInternal(ctx, false);
}

/**
 * Call All xN -r - 執事 + メイド長 + メイドN人をランダムに起動
 */
export async function startAllByCountRandom(ctx: AgentContext): Promise<void> {
    await _startAllByCountInternal(ctx, true);
}

/**
 * 執事 + メイド長 + メイドN人を起動（内部実装）
 */
async function _startAllByCountInternal(ctx: AgentContext, random: boolean): Promise<void> {
    if (!await ctx.ensureInitialized()) return;

    const orderedMaids = getOrderedMaids();
    const availableMaids = orderedMaids.filter(m => !ctx.agents.has(m.id));

    if (availableMaids.length === 0) {
        vscode.window.showWarningMessage('メイドは既に全員お仕えしております。Call All をお使いください。');
        return;
    }

    const countStr = await vscode.window.showInputBox({
        prompt: `メイドを何人お呼びしますか？（1〜${availableMaids.length}人）執事+メイド長もお呼び ${random ? '【ランダム】' : '【順番】'}`,
        placeHolder: '例: 3',
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 1) {
                return '1以上の数値を入力してください';
            }
            if (num > availableMaids.length) {
                return `最大${availableMaids.length}人まで指定できます`;
            }
            return null;
        }
    });

    if (!countStr) return;

    const count = parseInt(countStr);

    // 進捗表示付きでお呼び出し
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '🎩 スタッフお仕えの準備中...',
        cancellable: false
    }, async (progress) => {
        const totalAgents = (ctx.agents.has('butler') ? 0 : 1) +
                           (ctx.agents.has('chief') ? 0 : 1) + count;
        let currentAgent = 0;

        // tmuxビューアを開く
        ctx.openTmuxViewer();

        // 執事・メイド長を先にお呼び
        if (!ctx.agents.has('butler')) {
            progress.report({ message: 'シルヴィア（執事）お仕えの準備中...', increment: 0 });
            ctx.createAgent('シルヴィア', 'butler', 'butler', '🎩');
            await ctx.launchClaudeWithRole('butler', 'butler');
            currentAgent++;
            progress.report({ increment: (100 / totalAgents) });
        }

        if (!ctx.agents.has('chief')) {
            progress.report({ message: 'ビオラ（メイド長）お仕えの準備中...' });
            ctx.createAgent('ビオラ', 'chief', 'chiefMaid', '👑');
            await ctx.launchClaudeWithRole('chief', 'chiefMaid');
            currentAgent++;
            progress.report({ increment: (100 / totalAgents) });
        }

        let maidsToStart: typeof availableMaids;
        if (random) {
            const shuffled = [...availableMaids].sort(() => Math.random() - 0.5);
            maidsToStart = shuffled.slice(0, count);
        } else {
            maidsToStart = availableMaids.slice(0, count);
        }

        for (const maid of maidsToStart) {
            progress.report({ message: `${maid.name}（メイド）お仕えの準備中...` });
            ctx.createAgent(maid.name, maid.id, 'maid', maid.emoji);
            await ctx.launchClaudeWithRole(maid.id, 'maid', maid.name);
            currentAgent++;
            progress.report({ increment: (100 / totalAgents) });
        }

        const maidNames = maidsToStart.map(m => m.name).join('、');
        vscode.window.showInformationMessage(`🎩 執事 + 👑 メイド長 + 🎀 ${maidNames} がお仕えの準備を整えました！`);
        ctx.updateDashboard();
    });
}

/**
 * 全エージェントを起動
 */
export async function startAllAgents(ctx: AgentContext): Promise<void> {
    await startButler(ctx);
    await startChiefMaid(ctx);
    // 全メイドを設定順に起動
    const orderedMaids = getOrderedMaids();
    for (const maid of orderedMaids) {
        if (!ctx.agents.has(maid.id)) {
            ctx.createAgent(maid.name, maid.id, 'maid', maid.emoji);
            await ctx.launchClaudeWithRole(maid.id, 'maid', maid.name);
        }
    }
    ctx.updateDashboard();
}
