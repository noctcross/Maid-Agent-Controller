/**
 * ユーザー入力コマンドモジュール
 *
 * ユーザーからの入力を受け付け、エージェントにタスクを送信する。
 */

import * as vscode from 'vscode';
import { Agent } from '../types';
import { getOrderedMaids } from '../utils/helpers';

/**
 * ユーザーコマンドに必要なコンテキスト
 */
export interface UserCommandContext {
    agents: Map<string, Agent>;
    sendTaskToButler: (taskDescription: string) => Promise<void>;
    sendMessageToAgent: (agentId: string, message: string) => Promise<boolean>;
}

/**
 * 執事への指令入力プロンプトを表示
 */
export async function promptAndSendToButler(ctx: UserCommandContext): Promise<void> {
    const command = await vscode.window.showInputBox({
        prompt: '執事への指令を入力してください、ご主人様',
        placeHolder: '例: このプロジェクトを分析して改善点を洗い出してください'
    });

    if (command) {
        await ctx.sendTaskToButler(command);
    }
}

/**
 * メイドへの指示入力プロンプトを表示
 */
export async function promptAndSendToMaid(ctx: UserCommandContext): Promise<void> {
    const orderedMaids = getOrderedMaids();
    const maidOptions = orderedMaids
        .filter(m => ctx.agents.has(m.id))
        .map(m => ({ label: `${m.emoji} ${m.name}`, id: m.id }));

    if (maidOptions.length === 0) {
        vscode.window.showWarningMessage('メイドがまだおりません。先に起動してください。');
        return;
    }

    const selected = await vscode.window.showQuickPick(maidOptions, {
        placeHolder: '指示を送るメイドを選んでください'
    });

    if (!selected) return;

    const command = await vscode.window.showInputBox({
        prompt: `${selected.label}への指示を入力してください`,
        placeHolder: '例: このファイルをレビューしてください'
    });

    if (command) {
        // 2段階送信でメイドに指示
        await ctx.sendMessageToAgent(selected.id, command);
    }
}
