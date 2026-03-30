import * as vscode from 'vscode';
import { Agent, AgentContext } from '../types';
import { MAIDS, MAIDS_MAP } from '../constants';
import { getOrderedMaids } from '../utils/helpers';
import { ensureServerRunning, MultiplexerType } from '../utils/server-manager';

// =============================================================================
// 共通パイプライン
// =============================================================================

/**
 * エージェント起動仕様
 */
export interface AgentStartSpec {
    name: string;
    id: string;
    role: Agent['role'];
    emoji: string;
    maidName?: string;
}

/**
 * AgentContext から multiplexer.type を取得
 */
function getMultiplexerType(ctx: AgentContext): MultiplexerType {
    return ctx.settings?.multiplexer?.type || 'auto';
}

/**
 * サーバー起動を確認（共通前処理）
 * ensureServerRunning の重複呼び出しを防ぐため、起動系の共通前処理として使用
 */
async function ensureServerReady(ctx: AgentContext): Promise<boolean> {
    if (!await ctx.ensureInitialized()) return false;

    if (!await ensureServerRunning(getMultiplexerType(ctx))) {
        vscode.window.showErrorMessage('サーバーが起動していないため、エージェントを起動できません');
        return false;
    }
    return true;
}

/**
 * 共通エージェント起動パイプライン
 *
 * startButler / startChiefMaid / startSelectedMaids の共通パターンを統合。
 * 1. 既存セッション確認
 * 2. エージェント作成（tmuxウィンドウ）
 * 3. tmuxビューア表示
 * 4. Claude Code起動（新規の場合）/ 復帰
 *
 * 注: ensureInitialized / ensureServerRunning は呼び出し元の責務
 */
async function startAgentPipeline(ctx: AgentContext, spec: AgentStartSpec): Promise<boolean> {
    // 既に起動中のチェック
    if (ctx.agents.has(spec.id)) {
        return false;  // 呼び出し元でメッセージを出す
    }

    // 既存セッションのチェック（P-3: startSelectedMaidsでもチェックするよう統一）
    const action = await ctx.checkExistingSessionAndPrompt(spec.id, `${spec.emoji} ${spec.name}`);
    if (action === 'cancel') return false;

    // エージェント作成
    ctx.createAgent(spec.name, spec.id, spec.role, spec.emoji);

    // tmuxビューアを開く
    ctx.openTmuxViewer();

    if (action === 'new') {
        // 新規起動: Claude Code を起動し、役割を認識させる
        await ctx.launchClaudeWithRole(spec.id, spec.role, spec.maidName);
    } else {
        // 復帰: Claudeコマンドは送信しない
        const agent = ctx.agents.get(spec.id);
        if (agent) agent.status = 'idle';
    }

    return true;
}

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
    if (!await ensureServerReady(ctx)) return;

    if (ctx.agents.has('butler')) {
        vscode.window.showWarningMessage('執事は既にお仕えしております');
        return;
    }

    const started = await startAgentPipeline(ctx, {
        name: 'シルヴィア', id: 'butler', role: 'butler', emoji: '🎩',
    });

    if (started) {
        vscode.window.showInformationMessage('🎩 シルヴィアがお仕えする準備ができました！');
        ctx.updateController();
    }
}

/**
 * メイド長を起動
 */
export async function startChiefMaid(ctx: AgentContext): Promise<void> {
    if (!await ensureServerReady(ctx)) return;

    if (ctx.agents.has('chief')) {
        vscode.window.showWarningMessage('メイド長は既にお仕えしております');
        return;
    }

    const started = await startAgentPipeline(ctx, {
        name: 'ビオラ', id: 'chief', role: 'chiefMaid', emoji: '👑',
    });

    if (started) {
        vscode.window.showInformationMessage('👑 ビオラがお仕えする準備ができました！');
        ctx.updateController();
    }
}

/**
 * メイドを選択して起動
 */
export async function startSelectedMaids(ctx: AgentContext): Promise<void> {
    if (!await ensureServerReady(ctx)) return;

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

    let startedCount = 0;
    for (const item of selected) {
        const maid = MAIDS.find(m => m.id === item.id);
        if (maid) {
            // 共通パイプライン使用（P-3: 既存セッションチェックも統一）
            const started = await startAgentPipeline(ctx, {
                name: maid.name, id: maid.id, role: 'maid', emoji: maid.emoji, maidName: maid.name,
            });
            if (started) startedCount++;
        }
    }

    if (startedCount > 0) {
        vscode.window.showInformationMessage(`🎀 メイド${startedCount}人がお仕えする準備ができました！`);
        ctx.updateController();
    }
}

/**
 * エージェントのロールに対応する絵文字を返す
 */
function agentEmoji(agent: Agent): string {
    switch (agent.role) {
        case 'butler': return '🎩';
        case 'chiefMaid': return '👑';
        case 'maid': return MAIDS_MAP[agent.id]?.emoji ?? '🎀';
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
 * ensureServerReady を1回だけ呼び出し、各start関数に委譲
 */
export async function startAllAgents(ctx: AgentContext): Promise<void> {
    if (!await ensureServerReady(ctx)) return;

    // 執事・メイド長は既存のstart関数経由（内部でensureServerReadyを再呼び出しするが
    // ensureServerRunning は冪等なので問題なし）
    await startButler(ctx);
    await startChiefMaid(ctx);

    // 全メイドを設定順に起動（共通パイプライン使用）
    const orderedMaids = getOrderedMaids();
    for (const maid of orderedMaids) {
        if (!ctx.agents.has(maid.id)) {
            await startAgentPipeline(ctx, {
                name: maid.name, id: maid.id, role: 'maid', emoji: maid.emoji, maidName: maid.name,
            });
        }
    }
    ctx.updateController();
}
