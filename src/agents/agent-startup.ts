/**
 * エージェント起動・インフラストラクチャ関連の関数群
 * extension.ts の MultiAgentController から抽出
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Agent, AgentContext } from '../types';
import { MAID_AGENT_DIR } from '../constants';
import { CURRENT_ENV, isTmuxAvailable, getTmuxVersion, isWslAvailable } from '../utils/environment';
import { getSessionNameFromPath, getGlobalMaidAgentPath } from '../utils/helpers';
import { TmuxManager } from '../tmux/tmux-manager';
import * as Pm2Setup from '../setup/pm2-setup';
import * as WslSetup from '../setup/wsl-setup';

// =========================================================================
// エージェント管理
// =========================================================================

/**
 * tmuxセッションを初期化
 */
export function initializeTmuxSession(ctx: AgentContext): void {
    if (!ctx.tmuxManager) return;

    try {
        ctx.tmuxManager.createSession();
        ctx.log(`[tmux] セッション '${ctx.tmuxSessionName}' を作成しました`);

        // セッション名をファイルに保存（maid-notify用）
        ctx.saveSessionNameToFile();

        // 通知システムを自動開始（ファイル監視含む）- サイレントモード
        ctx.startWatchingFiles(true);
    } catch (error) {
        ctx.log(`[tmux] セッション作成エラー: ${error}`);
    }
}

/**
 * セッション名をファイルに保存（maid-notify用）
 */
export function saveSessionNameToFile(ctx: AgentContext): void {
    if (!ctx.maidAgentPath || !ctx.tmuxSessionName) return;

    try {
        const configDir = path.join(ctx.maidAgentPath, 'system', 'config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        const sessionFile = path.join(configDir, '.session-name');
        fs.writeFileSync(sessionFile, ctx.tmuxSessionName);
        ctx.log(`[tmux] セッション名を保存: ${sessionFile}`);
    } catch (error) {
        ctx.log(`[tmux] セッション名保存エラー: ${error}`);
    }
}

/**
 * VSCodeターミナルでtmuxセッションにアタッチ（表示用）
 */
export function openTmuxViewer(ctx: AgentContext): void {
    if (!ctx.tmuxManager) return;

    // 既存のビューアがあれば表示
    if (ctx.tmuxViewerTerminal) {
        ctx.tmuxViewerTerminal.show();
        return;
    }

    // tmuxセッションがなければ作成
    ctx.initializeTmuxSession();

    // VSCodeターミナルでtmuxにアタッチ
    if (CURRENT_ENV === 'windows-native') {
        // Windows環境: WSLシェルを使用してtmuxにアタッチ
        const wslPath = ctx.tmuxManager?.getWslWorkingDirectory() || '/home';
        ctx.tmuxViewerTerminal = vscode.window.createTerminal({
            name: '🎩 Maid Agent (tmux)',
            shellPath: 'wsl.exe',
            shellArgs: ['-e', 'bash', '-c', `cd "${wslPath}" && tmux attach-session -t ${ctx.tmuxSessionName}`]
        });
    } else {
        // WSL/Linux/macOS環境: 直接tmuxにアタッチ
        ctx.tmuxViewerTerminal = vscode.window.createTerminal({
            name: '🎩 Maid Agent (tmux)',
            cwd: ctx.workspaceRoot
        });
        ctx.tmuxViewerTerminal.sendText(`tmux attach-session -t ${ctx.tmuxSessionName}`);
    }
    ctx.tmuxViewerTerminal.show();

    ctx.log('[tmux] ビューアターミナルを開きました');
}

/**
 * 役割別の--append-system-prompt用テキストを生成
 * コンパクション後もシステムプロンプトの一部として維持される静的な役割情報
 */
export function getRolePrompt(ctx: AgentContext, agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string {
    switch (role) {
        case 'butler':
            return [
                '[Maid Agent System] 役割: 執事シルヴィア(butler)',
                'MCPツール: create_task, list_tasks, get_task, get_team_status',
                '通知: .maid-agent/system/bin/maid-notify chief "msg"',
                '禁止: 自分でファイル操作(BF001), メイドへ直接指示(BF002)',
                '指示書: .maid-agent/agents/instructions/butler.md',
                'ペルソナ: .maid-agent/agents/personas/butler.md',
            ].join(' / ');

        case 'chiefMaid':
            return [
                '[Maid Agent System] 役割: メイド長ビオラ(chief)',
                'MCPツール: list_tasks, get_task, create_task, assign_task, update_task, get_team_status',
                '通知: .maid-agent/system/bin/maid-notify {maid_id} "msg"',
                '禁止: 自分でタスク実行(CF001), 執事への通知(CF002)',
                '指示書: .maid-agent/agents/instructions/chief.md',
                'ペルソナ: .maid-agent/agents/personas/chief.md',
            ].join(' / ');

        case 'maid':
            return [
                `[Maid Agent System] 役割: メイド${maidName || 'メイド'}(${agentId})`,
                'MCPツール: get_my_task, update_status',
                '通知: .maid-agent/system/bin/maid-notify chief "msg"',
                '禁止: 執事に直接報告(MF001), ご主人様に直接連絡(MF002)',
                '指示書: .maid-agent/agents/instructions/maid.md',
                `ペルソナ: .maid-agent/agents/personas/${agentId}.md`,
            ].join(' / ');
    }
}

/**
 * エージェントでClaude Codeを起動し、役割を認識させる
 * --append-system-promptで役割情報をシステムプロンプトに注入（コンパクション耐性あり）
 * 初期プロンプトを引数として渡すことで、起動と指示を1コマンドで実行
 */
export async function launchClaudeWithRole(ctx: AgentContext, agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void> {
    const agent = ctx.agents.get(agentId);
    if (!agent || !ctx.tmuxManager) return;

    // 役割に応じた指示を作成
    // 重要: コンパクション後も通信方法を忘れないよう、QUICK_REFERENCE.md への言及を含める
    let instruction: string;
    switch (role) {
        case 'butler':
            instruction = 'あなたは執事のシルヴィアです。.maid-agent/agents/instructions/butler.md を読んで役割を把握してください。通信方法は .maid-agent/agents/instructions/QUICK_REFERENCE.md に記載があります。また、.maid-agent/agents/personas/butler.md を読んで口調・話し方を把握してください。準備ができたら、ご主人様からの指示をお待ちください。';
            break;
        case 'chiefMaid':
            instruction = 'あなたはメイド長のビオラです。.maid-agent/agents/instructions/chief.md を読んで役割を把握してください。通信方法は .maid-agent/agents/instructions/QUICK_REFERENCE.md に記載があります。また、.maid-agent/agents/personas/chief.md を読んで口調・話し方を把握してください。準備ができたら、シルヴィア（執事）からの指示をお待ちください。';
            break;
        case 'maid':
            const maidId = agentId;
            instruction = `あなたはメイドの${maidName || 'メイド'}です。.maid-agent/agents/instructions/maid.md を読んで役割を把握してください。通信方法は .maid-agent/agents/instructions/QUICK_REFERENCE.md に記載があります。また、.maid-agent/agents/personas/${maidId}.md を読んで口調・話し方を把握してください。準備ができたら、ビオラ（メイド長）からの指示をお待ちください。`;
            break;
    }

    // シェルエスケープ（シングルクォートをエスケープ）
    const escapedInstruction = instruction.replace(/'/g, "'\\''");

    // 役割別プロンプト生成（--append-system-prompt用、コンパクション耐性あり）
    const rolePrompt = ctx.getRolePrompt(agentId, role, maidName);
    const escapedRolePrompt = rolePrompt.replace(/'/g, "'\\''");

    // tmuxウィンドウが準備できるまで待つ
    await ctx.delay(500);

    // Claude Code を初期プロンプト付きで起動（tmux send-keys経由）
    // --append-system-prompt: コンパクション後も維持される静的な役割情報
    const command = `claude --dangerously-skip-permissions --append-system-prompt '${escapedRolePrompt}' '${escapedInstruction}'`;
    ctx.tmuxManager.sendKeys(agent.tmuxWindow, command, true);

    const roleLabel = agent.role === 'butler' ? '執事' :
                     agent.role === 'chiefMaid' ? 'メイド長' : 'メイド';
    ctx.log(`[${agent.name}] ${roleLabel}をお呼びしました`);

    agent.status = 'idle';
    ctx.updateAgentPanel();

    // 保留中のメッセージがあれば配信
    await ctx.deliverPendingMessages(agentId);
}

// =========================================================================
// 階層構造の起動
// =========================================================================

/**
 * 既存のtmuxセッションからエージェントを復帰
 */
export async function resumeSessions(ctx: AgentContext): Promise<void> {
    if (!await ctx.ensureTmuxAvailable()) {
        return;
    }

    // tmuxManagerがない場合は初期化
    if (!ctx.tmuxManager) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('ワークスペースが開かれていません');
            return;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const sessionName = getSessionNameFromPath(workspacePath);
        ctx.tmuxManager = new TmuxManager(sessionName, workspacePath);
    }

    // セッションが存在するかチェック
    if (!ctx.tmuxManager.sessionExists()) {
        vscode.window.showInformationMessage('復帰可能なセッションがありません。Call コマンドで新規に呼び出してください。');
        return;
    }

    // 既存のウィンドウを取得
    const windows = ctx.tmuxManager.listWindows();
    if (windows.length === 0) {
        vscode.window.showInformationMessage('復帰可能なエージェントがありません。');
        return;
    }

    // エージェント名とウィンドウ名のマッピング
    const agentMapping: { [key: string]: { name: string; role: 'butler' | 'chiefMaid' | 'maid'; emoji: string } } = {
        'butler': { name: 'シルヴィア', role: 'butler', emoji: '🎩' },
        'chief': { name: 'ビオラ', role: 'chiefMaid', emoji: '👑' },
        'emma': { name: 'エマ', role: 'maid', emoji: '🌸' },
        'sophia': { name: 'ソフィア', role: 'maid', emoji: '📚' },
        'lily': { name: 'リリー', role: 'maid', emoji: '🎨' },
        'rose': { name: 'ローズ', role: 'maid', emoji: '🌹' },
        'alice': { name: 'アリス', role: 'maid', emoji: '🔧' },
        'may': { name: 'メイ', role: 'maid', emoji: '🍰' },
        'flora': { name: 'フローラ', role: 'maid', emoji: '🌷' },
        'luna': { name: 'ルナ', role: 'maid', emoji: '🌙' }
    };

    let resumedCount = 0;
    const resumedNames: string[] = [];

    for (const windowName of windows) {
        // 既に登録済みならスキップ
        if (ctx.agents.has(windowName)) {
            continue;
        }

        const mapping = agentMapping[windowName];
        if (mapping) {
            // エージェントを登録（Claudeコマンドは送信しない）
            ctx.createAgent(mapping.name, windowName, mapping.role, mapping.emoji);
            // statusをidleに設定（既に稼働中の想定）
            const agent = ctx.agents.get(windowName);
            if (agent) {
                agent.status = 'idle';
            }
            resumedCount++;
            resumedNames.push(`${mapping.emoji} ${mapping.name}`);
            ctx.log(`[復帰] ${mapping.name}（${windowName}）を復帰しました`);
        }
    }

    if (resumedCount > 0) {
        // maidAgentPathを設定
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            ctx.maidAgentPath = path.join(workspaceFolder.uri.fsPath, '.maid-agent');

            // 監視システムを開始（サイレントモード）
            ctx.startWatchingFiles(true);
        }

        // tmuxビューアを開く
        ctx.openTmuxViewer();

        vscode.window.showInformationMessage(`${resumedNames.join('、')} が復帰しました！`);
        ctx.updateController();
        ctx.updateAgentPanel();
    } else {
        vscode.window.showInformationMessage('新たに復帰可能なエージェントはありませんでした。');
    }
}

/**
 * 既存セッションが存在するかチェックし、存在する場合は復帰を提案
 * @returns true: 続行OK, false: キャンセル
 */
export async function checkExistingSessionAndPrompt(ctx: AgentContext, agentId: string, agentName: string): Promise<'new' | 'resume' | 'cancel'> {
    if (!ctx.tmuxManager) return 'new';

    // ウィンドウが既に存在するかチェック
    if (ctx.tmuxManager.windowExists(agentId)) {
        const choice = await vscode.window.showWarningMessage(
            `${agentName}のセッションが既に存在します。`,
            '復帰する', '新規起動（上書き）', 'キャンセル'
        );

        if (choice === '復帰する') {
            return 'resume';
        } else if (choice === '新規起動（上書き）') {
            // 既存ウィンドウを終了
            ctx.tmuxManager.killWindow(agentId);
            await ctx.delay(100);
            return 'new';
        } else {
            return 'cancel';
        }
    }

    return 'new';
}

// =========================================================================
// Claude Code 起動（手動用 - 通常は自動起動）
// =========================================================================

export function startClaudeOnAgent(ctx: AgentContext, agentId: string): void {
    const agent = ctx.agents.get(agentId);
    if (!agent) return;

    // 役割別プロンプト生成（--append-system-prompt用、コンパクション耐性あり）
    const rolePrompt = ctx.getRolePrompt(agentId, agent.role, agent.name);
    const escapedRolePrompt = rolePrompt.replace(/'/g, "'\\''");

    // Claude Code を権限スキップモードで起動（役割情報付き）
    ctx.sendToAgent(agentId, `claude --dangerously-skip-permissions --append-system-prompt '${escapedRolePrompt}'`);
}

export async function startClaudeOnAllAgents(ctx: AgentContext): Promise<void> {
    let count = 0;
    for (const [id, agent] of ctx.agents) {
        // 役割別プロンプト生成（--append-system-prompt用、コンパクション耐性あり）
        const rolePrompt = ctx.getRolePrompt(id, agent.role, agent.name);
        const escapedRolePrompt = rolePrompt.replace(/'/g, "'\\''");

        ctx.sendToAgent(id, `claude --dangerously-skip-permissions --append-system-prompt '${escapedRolePrompt}'`);
        await ctx.delay(500); // 各エージェント間で少し待つ
        count++;
    }

    if (count > 0) {
        vscode.window.showInformationMessage(`🤖 ${count}人のエージェントがClaude Codeを起動しました`);
    }
}

// =========================================================================
// 初期化・環境チェック
// =========================================================================

export async function ensureInitialized(ctx: AgentContext): Promise<boolean> {
    // tmuxが利用可能かチェック
    if (!await ctx.ensureTmuxAvailable()) {
        return false;
    }

    if (!ctx.maidAgentPath || !fs.existsSync(ctx.maidAgentPath)) {
        const choice = await vscode.window.showWarningMessage(
            'Maid Agent が初期化されていません。初期化しますか？',
            '初期化する', 'キャンセル'
        );
        if (choice === '初期化する') {
            return await ctx.initializeWorkspace();
        }
        return false;
    }

    // MCPサーバーのヘルスチェック（Windows環境のみ）
    if (CURRENT_ENV === 'windows-native') {
        await ctx.ensureMcpServerRunning();
    }

    // セッション数の警告チェック
    await ctx.checkSessionCountWarning();

    return true;
}

/**
 * MCPサーバーが起動しているか確認し、起動していなければ起動する
 */
export async function ensureMcpServerRunning(ctx: AgentContext): Promise<void> {
    return Pm2Setup.ensureMcpServerRunning(ctx.createSetupContext());
}

/**
 * tmuxが利用可能かチェックし、なければインストールを提案
 */
export async function ensureTmuxAvailable(ctx: AgentContext): Promise<boolean> {
    // Windows環境ではまずWSLをチェック
    if (CURRENT_ENV === 'windows-native') {
        if (!await ctx.ensureWslAvailable()) {
            return false;
        }
    }

    if (isTmuxAvailable()) {
        return true;
    }

    const envInfo = CURRENT_ENV === 'windows-native'
        ? 'Windows環境でWSL経由でtmuxを使用します。'
        : `現在の環境: ${CURRENT_ENV}`;

    const choice = await vscode.window.showErrorMessage(
        `tmuxがインストールされていません。\n${envInfo}\n\ntmuxをインストールしますか？`,
        'インストールする',
        'インストール方法を表示',
        'キャンセル'
    );

    if (choice === 'インストールする') {
        return await ctx.installTmux();
    } else if (choice === 'インストール方法を表示') {
        ctx.showTmuxInstallInstructions();
        return false;
    }

    return false;
}

/**
 * maid-agentセッション数をチェックし、しきい値を超えていたら警告
 */
export async function checkSessionCountWarning(ctx: AgentContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('maidAgent');
    const threshold = config.get<number>('sessionWarningThreshold', 10);

    const { count, sessions } = TmuxManager.countMaidAgentSessions();

    if (count >= threshold) {
        const sessionList = sessions.slice(0, 5).join('\n  • ');
        const moreText = count > 5 ? `\n  ...他 ${count - 5} セッション` : '';

        const choice = await vscode.window.showWarningMessage(
            `⚠️ maid-agentセッションが ${count} 個存在します（しきい値: ${threshold}）\n` +
            `古いセッションのクリーンアップを検討してください。`,
            'セッション一覧を表示',
            '全てクリーンアップ',
            '続行'
        );

        if (choice === 'セッション一覧を表示') {
            // チェックボックス形式でセッション選択
            const items = sessions.map(sessionName => {
                const isCurrent = sessionName === ctx.tmuxSessionName;
                return {
                    label: isCurrent ? `$(star) ${sessionName}` : sessionName,
                    description: isCurrent ? '(現在のセッション)' : '',
                    sessionName: sessionName,
                    picked: false
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                canPickMany: true,
                placeHolder: '終了するセッションを選択してください（複数選択可）',
                title: `maid-agent セッション一覧 (${count}個)`
            });

            if (selected && selected.length > 0) {
                const confirmMsg = selected.some(s => s.sessionName === ctx.tmuxSessionName)
                    ? `${selected.length} 個のセッションを終了しますか？\n⚠️ 現在のセッションも含まれています！`
                    : `${selected.length} 個のセッションを終了しますか？`;

                const confirm = await vscode.window.showWarningMessage(
                    confirmMsg,
                    '終了する',
                    'キャンセル'
                );

                if (confirm === '終了する') {
                    let killedCount = 0;
                    for (const item of selected) {
                        try {
                            const cmd = CURRENT_ENV === 'windows-native'
                                ? `wsl tmux kill-session -t ${item.sessionName}`
                                : `tmux kill-session -t ${item.sessionName}`;
                            execSync(cmd, { stdio: 'pipe' });
                            killedCount++;
                            ctx.log(`[クリーンアップ] セッション終了: ${item.sessionName}`);
                        } catch {
                            ctx.log(`[クリーンアップ] 終了失敗（既に終了済み?）: ${item.sessionName}`);
                        }
                    }
                    vscode.window.showInformationMessage(`${killedCount} 個のセッションを終了しました`);
                }
            }
        } else if (choice === '全てクリーンアップ') {
            const confirm = await vscode.window.showWarningMessage(
                `本当に ${count} 個の maid-agent セッションを全て終了しますか？\n` +
                `（現在のセッションも含まれます）`,
                '全て終了',
                'キャンセル'
            );
            if (confirm === '全て終了') {
                sessions.forEach(sessionName => {
                    try {
                        const cmd = CURRENT_ENV === 'windows-native'
                            ? `wsl tmux kill-session -t ${sessionName}`
                            : `tmux kill-session -t ${sessionName}`;
                        execSync(cmd, { stdio: 'pipe' });
                    } catch {
                        // 既に終了している場合は無視
                    }
                });
                vscode.window.showInformationMessage(`${count} 個のセッションをクリーンアップしました`);
                ctx.log(`[クリーンアップ] ${count} 個のセッションを終了しました`);
            }
        }
        // '続行' または閉じた場合は何もせず続行
    }
}
