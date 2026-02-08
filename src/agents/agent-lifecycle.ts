import * as vscode from 'vscode';
import { Agent, AgentContext } from '../types';
import { MAIDS } from '../constants';
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
    ctx.updateController();
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

    ctx.updateController();
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

    ctx.updateController();
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
    ctx.updateController();
}

/**
 * エージェントのロールに対応する絵文字を返す
 */
function agentEmoji(agent: Agent): string {
    switch (agent.role) {
        case 'butler': return '🎩';
        case 'chiefMaid': return '👑';
        case 'maid': return '🎀';
        default: return '❓';
    }
}

/**
 * Kill Pick - エージェントを選んで終了
 */
export async function killPick(ctx: AgentContext): Promise<void> {
    if (ctx.agents.size === 0) {
        vscode.window.showWarningMessage('起動中のエージェントがいません');
        return;
    }

    const roleOrder: Record<string, number> = { butler: 0, chiefMaid: 1, maid: 2 };
    const items = Array.from(ctx.agents.values())
        .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9))
        .map(agent => ({
            label: `${agentEmoji(agent)} ${agent.name}`,
            description: agent.id,
            detail: `ステータス: ${agent.status}`,
            agentId: agent.id
        }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: '終了するエージェントを選択してください'
    });

    if (!selected || selected.length === 0) return;

    for (const item of selected) {
        killAgent(ctx, item.agentId);
    }

    const names = selected.map(s => s.label).join(', ');
    vscode.window.showInformationMessage(`${names} を終了しました`);
}

/**
 * Restart Pick - エージェントを選んで再起動（Kill + Call）
 */
export async function restartPick(ctx: AgentContext): Promise<void> {
    if (ctx.agents.size === 0) {
        vscode.window.showWarningMessage('起動中のエージェントがいません');
        return;
    }

    const roleOrder: Record<string, number> = { butler: 0, chiefMaid: 1, maid: 2 };
    const items = Array.from(ctx.agents.values())
        .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9))
        .map(agent => ({
            label: `${agentEmoji(agent)} ${agent.name}`,
            description: agent.id,
            detail: `ステータス: ${agent.status}`,
            agentId: agent.id,
            agentRole: agent.role,
            agentName: agent.name,
            agentEmoji: agentEmoji(agent)
        }));

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: '再起動するエージェントを選択してください'
    });

    if (!selected || selected.length === 0) return;

    const RESTART_DELAY_MS = 500;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '再起動中...',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < selected.length; i++) {
            const item = selected[i];
            progress.report({
                message: `${item.label} を再起動中...`,
                increment: 100 / selected.length
            });

            // 1. Kill
            killAgent(ctx, item.agentId);

            // 2. 待機（tmux ウィンドウ削除完了を待つ）
            await new Promise(resolve => setTimeout(resolve, RESTART_DELAY_MS));

            // 3. Call（新規ウィンドウ作成 + Claude 起動）
            ctx.createAgent(item.agentName, item.agentId, item.agentRole, item.agentEmoji);
            await ctx.launchClaudeWithRole(
                item.agentId,
                item.agentRole,
                item.agentRole === 'maid' ? item.agentName : undefined
            );
        }
    });

    const names = selected.map(s => s.label).join(', ');
    vscode.window.showInformationMessage(`${names} を再起動しました`);
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
    ctx.updateController();
}
