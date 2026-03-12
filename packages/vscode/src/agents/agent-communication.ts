import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, AgentContext } from '../types';

/**
 * エージェント通信関連の関数群
 * MultiAgentController から抽出した通信メソッドをスタンドアロン関数化
 */

/**
 * エージェントにコマンドを送信
 * tmux send-keys経由でコマンドを実行
 */
export function sendToAgent(ctx: AgentContext, agentId: string, command: string): boolean {
    const agent = ctx.agents.get(agentId);
    if (!agent || !ctx.tmuxManager) {
        ctx.log(`[ERROR] ${agentId} が見つかりません`);
        return false;
    }

    try {
        ctx.tmuxManager.sendKeys(agent.tmuxWindow, command, true);
        agent.status = 'working';
        ctx.log(`[${agent.name}] → ${command.substring(0, 60)}...`);
        ctx.updateController();
        return true;
    } catch (error) {
        ctx.log(`[ERROR] send-keys失敗: ${error}`);
        return false;
    }
}

/**
 * エージェントにメッセージを送信（2段階送信 - Claude Code通知用）
 * メッセージとEnterを別々に送信
 */
export async function sendMessageToAgent(ctx: AgentContext, agentId: string, message: string): Promise<boolean> {
    const agent = ctx.agents.get(agentId);
    if (!agent || !ctx.tmuxManager) {
        ctx.log(`[ERROR] ${agentId} が見つかりません`);
        return false;
    }

    try {
        // ステップ0: copy mode（スクロールモード）を解除
        // ユーザーがマウススクロールした場合、入力を受け付けない状態になっている可能性がある
        ctx.tmuxManager.cancelCopyMode(agent.tmuxWindow);
        await ctx.delay(50);

        // ステップ1: メッセージ送信（Enterなし）
        ctx.tmuxManager.sendKeys(agent.tmuxWindow, message, false);

        // 少し待つ（バッファリング対策）
        await ctx.delay(100);

        // ステップ2: Enter送信
        ctx.tmuxManager.sendKeys(agent.tmuxWindow, '', true);

        ctx.log(`[${agent.name}] 📨 ${message.substring(0, 60)}...`);
        return true;
    } catch (error) {
        ctx.log(`[ERROR] send-keys失敗: ${error}`);
        return false;
    }
}

/**
 * エージェントの出力をキャプチャ（tmux capture-pane経由）
 */
export function captureAgentOutput(ctx: AgentContext, agentId: string, lines: number = 100): string {
    const agent = ctx.agents.get(agentId);
    if (!agent || !ctx.tmuxManager) {
        return '';
    }

    return ctx.tmuxManager.capturePane(agent.tmuxWindow, lines);
}

/**
 * エージェント起動時に保留中のメッセージを配信
 */
export async function deliverPendingMessages(ctx: AgentContext, agentId: string): Promise<void> {
    if (!ctx.maidAgentPath) return;

    const pendingFile = path.join(ctx.maidAgentPath, 'notifications', 'pending', `${agentId}.txt`);

    if (!fs.existsSync(pendingFile)) return;

    try {
        const content = fs.readFileSync(pendingFile, 'utf-8').trim();
        if (!content) return;

        const messages = content.split('\n');
        ctx.log(`[${agentId}] ${messages.length}件の保留メッセージを配信します`);

        // 少し待ってから配信（Claude起動を待つ）
        await ctx.delay(3000);

        // 保留メッセージをまとめて通知
        const summary = `【保留メッセージ ${messages.length}件】\n` + messages.join('\n');
        await ctx.sendMessageToAgent(agentId, summary);

        // 配信完了後、保留ファイルを削除
        fs.unlinkSync(pendingFile);
        ctx.log(`[${agentId}] 保留メッセージを配信し、キューをクリアしました`);
    } catch (error) {
        ctx.log(`[${agentId}] 保留メッセージ配信エラー: ${error}`);
    }
}

/**
 * ご主人様から執事にタスクを送信
 * 執事がタスクを分解し、メイド長に指示を出す起点
 */
export async function sendTaskToButler(ctx: AgentContext, taskDescription: string): Promise<void> {
    const butler = ctx.agents.get('butler');
    if (!butler) {
        vscode.window.showWarningMessage('執事がおりません。先に起動してください。');
        return;
    }

    if (!ctx.maidAgentPath) return;

    ctx.log(`[タスク] ご主人様からの指令: ${taskDescription}`);

    // 執事にタスクを直接送信（2段階送信）
    // 執事がタスクを分解し、butler_to_chief.yaml に書き込む
    const instruction = `ご主人様からの指令です: ${taskDescription}\n\nこのタスクを分析し、必要に応じてサブタスクに分解して .maid-agent/system/data/queue/butler_to_chief.yaml に記載し、メイド長に通知してください。`;
    await ctx.sendMessageToAgent('butler', instruction);

    vscode.window.showInformationMessage('🎩 執事にタスクを送信しました');
    ctx.updateController();
}

/**
 * 執事からメイド長への通知（butler.md の指示に従って実行される）
 * 執事のClaudeが内部的に使用するためのヘルパー
 */
export async function notifyChief(ctx: AgentContext, message: string): Promise<void> {
    const chief = ctx.agents.get('chief');
    if (!chief) {
        ctx.log('[WARN] メイド長がおりません');
        return;
    }
    await ctx.sendMessageToAgent('chief', message);
}

/**
 * メイド長からメイドへの通知（chief.md の指示に従って実行される）
 * メイド長のClaudeが内部的に使用するためのヘルパー
 */
export async function notifyMaid(ctx: AgentContext, maidId: string, message: string): Promise<void> {
    const maid = ctx.agents.get(maidId);
    if (!maid) {
        ctx.log(`[WARN] メイド ${maidId} がおりません`);
        return;
    }
    await ctx.sendMessageToAgent(maidId, message);
}
