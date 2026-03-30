/**
 * エージェント起動・インフラストラクチャ関連の関数群
 * extension.ts の MultiAgentController から抽出
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Agent, AgentContext } from '../types';
import { AGENTS_MAP, isValidAgentId } from '../constants';
import { ENV, isTmuxAvailable } from '../utils/environment';
import { getSavedRuntimeMode } from '../setup/global-init';
import { getSessionNameFromPath } from '../utils/helpers';
import { escapeForSingleQuote } from '../utils/shell-escape';
// MultiplexerFactory is accessed via ctx.multiplexerFactory
import { getModelForAgent } from '../utils/settings-loader';
import { generateSystemPromptFile } from '../utils/prompt-loader';

// =========================================================================
// Claude Code コマンド構築
// =========================================================================

/**
 * Claude Code の実行パスを取得（psmuxモード用）
 * PATHに追加されていない場合があるため、フルパスを返す
 */
function getClaudeCommandForPsmux(): string {
    const userProfile = process.env.USERPROFILE || '';
    if (!userProfile) return 'claude';  // フォールバック

    // 可能なインストール先をチェック
    const possiblePaths = [
        path.join(userProfile, '.local', 'bin', 'claude.exe'),
        path.join(userProfile, '.claude', 'local', 'claude.exe'),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            // PowerShellではパスにスペースが含まれる可能性があるため、& で実行
            return `& '${p}'`;
        }
    }

    // claude.exe が見つからない場合、ユーザーに案内を表示
    const searchedPaths = possiblePaths.map(p => `  - ${p}`).join('\n');
    vscode.window.showWarningMessage(
        'Claude Code（claude.exe）が検出されませんでした。' +
        'エージェント起動に失敗する可能性があります。',
        'インストール方法を確認',
        '閉じる'
    ).then(choice => {
        if (choice === 'インストール方法を確認') {
            const panel = vscode.window.createOutputChannel('Maid Agent - Claude Code Setup');
            panel.appendLine('=== Claude Code インストール方法 ===');
            panel.appendLine('');
            panel.appendLine('以下のコマンドでインストールできます:');
            panel.appendLine('  npm install -g @anthropic-ai/claude-code');
            panel.appendLine('');
            panel.appendLine('検索したパス:');
            panel.appendLine(searchedPaths);
            panel.appendLine('');
            panel.appendLine('インストール後、Init Global を再実行してください。');
            panel.show();
        }
    });

    return 'claude';  // フォールバック（PATHに存在することを期待）
}

/**
 * Claude Code 起動コマンドを構築（環境に応じた構文で）
 * - tmux (Unix bash): VAR=value command
 * - psmux (Windows PowerShell): $env:VAR = 'value'; & 'path\to\claude.exe'
 */
function buildClaudeCommand(
    ctx: AgentContext,
    agentId: string,
    modelFlag: string,
    initialPrompt?: string
): string {
    const isPsmux = ctx.multiplexerFactory?.getType() === 'psmux';
    const addDirs = `--add-dir .maid-agent/core --add-dir .maid-agent/roles/${agentId}`;

    if (isPsmux) {
        // PowerShell形式: $env:VAR = 'value'; & 'path\to\claude.exe' args
        // PowerShellのシングルクォートはリテラル文字列（' → '' でエスケープ）
        const claudeCmd = getClaudeCommandForPsmux();
        const promptPart = initialPrompt ? ` -- '${initialPrompt.replace(/'/g, "''")}'` : '';
        return `$env:CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD = '1'; ${claudeCmd} --dangerously-skip-permissions${modelFlag} ${addDirs}${promptPart}`;
    } else {
        // Unix bash形式: VAR=value command
        // bash のシングルクォート内ではメタ文字が解釈されないため最も安全
        const promptPart = initialPrompt ? ` -- '${escapeForSingleQuote(initialPrompt)}'` : '';
        return `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --dangerously-skip-permissions${modelFlag} ${addDirs}${promptPart}`;
    }
}

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

        // セッション名をファイルに保存（maidctl notify用）
        ctx.saveSessionNameToFile();

        // 通知システムを自動開始（ファイル監視含む）- サイレントモード
        ctx.startWatchingFiles(true);
    } catch (error) {
        ctx.log(`[tmux] セッション作成エラー: ${error}`);
    }
}

/**
 * セッション名をファイルに保存（maidctl notify用）
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

    // マルチプレクサタイプを取得（設定 > ファクトリ > auto の優先順）
    let multiplexerType = ctx.settings?.multiplexer?.type;
    if (!multiplexerType || multiplexerType === 'auto') {
        multiplexerType = ctx.multiplexerFactory?.getType() || 'auto';
    }
    const isPsmux = multiplexerType === 'psmux';

    // VSCodeターミナルでtmux/psmuxにアタッチ
    if (ENV.isWindowsNative()) {
        if (isPsmux) {
            // psmuxモード: PowerShellでpsmuxにアタッチ
            ctx.tmuxViewerTerminal = vscode.window.createTerminal({
                name: '🎩 Maid Agent (psmux)',
                cwd: ctx.workspaceRoot
            });
            ctx.tmuxViewerTerminal.sendText(`psmux attach-session -t ${ctx.tmuxSessionName}`);
        } else {
            // tmuxモード: WSLシェルを使用してtmuxにアタッチ
            const wslPath = ctx.workspaceRoot ? ENV.windowsToWslPath(ctx.workspaceRoot) : '/home';
            ctx.tmuxViewerTerminal = vscode.window.createTerminal({
                name: '🎩 Maid Agent (tmux)',
                shellPath: 'wsl.exe',
                shellArgs: ['-e', 'bash', '-c', `cd "${wslPath}" && tmux attach-session -t ${ctx.tmuxSessionName}`]
            });
        }
    } else {
        // WSL/Linux/macOS環境: 直接tmuxにアタッチ
        ctx.tmuxViewerTerminal = vscode.window.createTerminal({
            name: '🎩 Maid Agent (tmux)',
            cwd: ctx.workspaceRoot
        });
        ctx.tmuxViewerTerminal.sendText(`tmux attach-session -t ${ctx.tmuxSessionName}`);
    }
    ctx.tmuxViewerTerminal.show();

    ctx.log(`[${isPsmux ? 'psmux' : 'tmux'}] ビューアターミナルを開きました`);
}

/**
 * システムプロンプトファイルのパスを取得（または生成）
 */
export function getSystemPromptFilePath(
    ctx: AgentContext,
    agentId: string,
    role: 'butler' | 'chiefMaid' | 'maid',
    maidName?: string
): string | null {
    if (!ctx.maidAgentPath) {
        ctx.log('[prompt] maidAgentPath が設定されていません');
        return null;
    }

    try {
        const filePath = generateSystemPromptFile(
            ctx.maidAgentPath,
            agentId,
            role,
            maidName
        );
        // Windows環境: 一時ファイルはWindowsパスで生成されるが、
        // Claude CodeはWSL内で起動するためWSLパスに変換が必要
        if (ENV.isWindowsNative()) {
            return ENV.windowsToWslPath(filePath);
        }
        return filePath;
    } catch (error) {
        ctx.log(`[prompt] システムプロンプトファイル生成エラー: ${error}`);
        return null;
    }
}

/**
 * フォールバック用のハードコードプロンプト（ファイル読み込み失敗時）
 * 将来的に削除予定
 */
export function getFallbackRolePrompt(ctx: AgentContext, agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): string {
    switch (role) {
        case 'butler':
            return [
                '[Maid Agent System] 役割: 執事シルヴィア(butler)',
                '禁止: BF001自己ファイル操作, BF002メイド直接指示, BF003ポーリング, BF004コンテキスト未読, BF005タスク状態直接更新',
                'CLI: maidctl task create/list/get, team status, notify chief',
                'task list: --status/--assignee/--summaryで絞込必須, 全件取得禁止',
                '時刻: date -Iseconds',
                '詳細: /skill butler-operation',
                '指示書: .maid-agent/agents/instructions/butler.md',
                'ペルソナ: .maid-agent/agents/personas/butler.md',
                '口調: 冷静沈着 / 語尾「〜でございます」「かしこまりました」',
            ].join(' / ');

        case 'chiefMaid':
            return [
                '[Maid Agent System] 役割: メイド長ビオラ(chief)',
                '禁止: CF001自己実行, CF002執事通知, CF003ポーリング, CF004未読作業, CF005他メイドタスク変更, CF006未登録ID指示',
                'CLI: maidctl task list/assign/update, team status, notify {maid}',
                'task list: --status/--assignee/--summaryで絞込必須, 全件取得禁止',
                '時刻: date -Iseconds',
                '詳細: /skill chief-operation',
                '指示書: .maid-agent/agents/instructions/chief.md',
                'ペルソナ: .maid-agent/agents/personas/chief.md',
                '口調: 厳格,責任感 / 語尾「〜ですよ」「〜なさい」',
            ].join(' / ');

        case 'maid':
            // メイドごとの口調マッピング
            const maidPersonalities: Record<string, string> = {
                emma: '口調: 真面目,誠実 / 語尾「〜ですね」「〜しましょう」',
                sophia: '口調: クール,寡黙 / 語尾「〜です」「了解です」',
                lily: '口調: 元気,明るい / 語尾「〜ですっ」「〜ね♪」',
                rose: '口調: 姉御肌,自信 / 語尾「〜ですわ」「お任せなさい」',
                alice: '口調: 天然,おっとり / 語尾「〜ですね〜」「〜かもです」',
                may: '口調: 控えめ,謙虚 / 語尾「〜させていただきます」',
                flora: '口調: 穏やか,優しい / 語尾「〜ですよ」「〜くださいね」',
                luna: '口調: マイペース,眠そう / 語尾「〜です...」「ふわぁ...」',
            };
            const personality = maidPersonalities[agentId] || '口調: 丁寧 / 語尾「〜です」';
            return [
                `[Maid Agent System] 役割: メイド${maidName || 'メイド'}(${agentId})`,
                '禁止: MF001執事直接報告, MF002ご主人様直接連絡, MF003指示外作業, MF004ポーリング, MF005他メイドタスク',
                'CLI: maidctl my-task → my-status working → 作業 → my-status completed → notify chief',
                `報告: .maid-agent/system/data/reports/current_${agentId}.md`,
                '時刻: date -Iseconds',
                '詳細: /skill maid-operation',
                '指示書: .maid-agent/agents/instructions/maid.md',
                `ペルソナ: .maid-agent/agents/personas/${agentId}.md`,
                personality,
            ].join(' / ');
    }
}

/**
 * エージェントでClaude Codeを起動し、役割を認識させる
 * --add-dir で roles/{agentId} のCLAUDE.mdを読み込み（コンパクション耐性あり）
 * 初期プロンプトを引数として渡すことで、起動と指示を1コマンドで実行
 */
export async function launchClaudeWithRole(ctx: AgentContext, agentId: string, role: 'butler' | 'chiefMaid' | 'maid', maidName?: string): Promise<void> {
    const agent = ctx.agents.get(agentId);
    if (!agent || !ctx.tmuxManager) return;

    // 役割に応じた指示を作成
    // 注: 指示書・ペルソナは .maid-agent/roles/{agentId}/CLAUDE.md から読み込み
    let instruction: string;
    switch (role) {
        case 'butler':
            instruction = 'あなたは執事のシルヴィアです。CLAUDE.mdを確認し、自分の役割とルールを把握してください。準備ができたら、ご主人様からの指示をお待ちください。';
            break;
        case 'chiefMaid':
            instruction = 'あなたはメイド長のビオラです。CLAUDE.mdを確認し、自分の役割とルールを把握してください。準備ができたら、シルヴィア（執事）からの指示をお待ちください。';
            break;
        case 'maid':
            instruction = `あなたはメイドの${maidName || 'メイド'}です。CLAUDE.mdを確認し、自分の役割とルールを把握してください。準備ができたら、ビオラ（メイド長）からの指示をお待ちください。`;
            break;
    }

    // tmuxウィンドウが準備できるまで待つ
    await ctx.delay(500);

    // Claude Code を初期プロンプト付きで起動（tmux send-keys経由）
    // --add-dir: .maid-agent/core と .maid-agent/roles/{agentId} のCLAUDE.mdを読み込み
    // CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1: 追加ディレクトリのCLAUDE.mdも読み込む
    // --model: settings.yaml で設定されたLLMモデル（未設定時は省略）
    const model = getModelForAgent(ctx.settings, agentId, role);
    const modelFlag = model ? ` --model ${model}` : '';

    // 環境変数とコマンドを構築（psmux/tmuxで構文が異なる）
    // エスケープは buildClaudeCommand 内でシェル種別に応じて適用
    const command = buildClaudeCommand(ctx, agentId, modelFlag, instruction);
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
        ctx.tmuxManager = ctx.multiplexerFactory.create(sessionName, workspacePath);
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

    // AGENTS_MAP から統合されたエージェント情報を取得
    let resumedCount = 0;
    const resumedNames: string[] = [];

    for (const windowName of windows) {
        // 既に登録済みならスキップ
        if (ctx.agents.has(windowName)) {
            continue;
        }

        // AGENTS_MAP に存在するエージェントのみ復帰
        if (isValidAgentId(windowName)) {
            const agentConfig = AGENTS_MAP[windowName];
            // エージェントを登録（Claudeコマンドは送信しない）
            ctx.createAgent(agentConfig.name, windowName, agentConfig.role, agentConfig.emoji);
            // statusをidleに設定（既に稼働中の想定）
            const agent = ctx.agents.get(windowName);
            if (agent) {
                agent.status = 'idle';
            }
            resumedCount++;
            resumedNames.push(`${agentConfig.emoji} ${agentConfig.name}`);
            ctx.log(`[復帰] ${agentConfig.name}（${windowName}）を復帰しました`);
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

    // Claude Code を権限スキップモードで起動（役割情報付き）
    const model = getModelForAgent(ctx.settings, agentId, agent.role);
    const modelFlag = model ? ` --model ${model}` : '';

    // V2: 環境変数でCLAUDE.md読み込みを有効化、roles/${agentId}を追加（psmux/tmuxで構文が異なる）
    const command = buildClaudeCommand(ctx, agentId, modelFlag);
    ctx.sendToAgent(agentId, command);
}

export async function startClaudeOnAllAgents(ctx: AgentContext): Promise<void> {
    let count = 0;
    for (const [id, agent] of ctx.agents) {
        const model = getModelForAgent(ctx.settings, id, agent.role);
        const modelFlag = model ? ` --model ${model}` : '';

        // V2: 環境変数でCLAUDE.md読み込みを有効化、roles/${id}を追加（psmux/tmuxで構文が異なる）
        const command = buildClaudeCommand(ctx, id, modelFlag);
        ctx.sendToAgent(id, command);
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

    // セッション数の警告チェック
    await ctx.checkSessionCountWarning();

    return true;
}

/**
 * マルチプレクサが利用可能かチェックし、なければインストールを提案
 * psmux モードの場合は psmux をチェック、tmux モードの場合は tmux/WSL をチェック
 */
export async function ensureTmuxAvailable(ctx: AgentContext): Promise<boolean> {
    // マルチプレクサタイプを取得（設定 > ファクトリ > auto の優先順）
    let multiplexerType = ctx.settings?.multiplexer?.type;
    if (!multiplexerType || multiplexerType === 'auto') {
        // 設定がない場合は、ファクトリの実際のタイプを使用
        multiplexerType = ctx.multiplexerFactory?.getType() || 'auto';
    }

    // psmux モードの場合は WSL チェック不要
    if (multiplexerType === 'psmux') {
        // psmux の存在チェック（tmuxManager が psmux インスタンスであれば OK）
        if (ctx.tmuxManager) {
            return true;
        }
        // psmux が利用できない場合のエラー
        vscode.window.showErrorMessage(
            'psmux が利用できません。Init Global で psmux のセットアップを行ってください。'
        );
        return false;
    }

    // tmux モード: Windows環境ではまずWSLをチェック
    if (ENV.isWindowsNative()) {
        if (!await ctx.ensureWslAvailable()) {
            return false;
        }
    }

    if (isTmuxAvailable()) {
        return true;
    }

    const envInfo = ENV.isWindowsNative()
        ? 'Windows環境でWSL経由でtmuxを使用します。'
        : `現在の環境: ${ENV.platform}`;

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

    const { count, sessions } = ctx.multiplexerFactory.countMaidAgentSessions();

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
                    const runtimeMode = getSavedRuntimeMode();
                    const muxCmd = ENV.getMultiplexerCommand(runtimeMode);
                    for (const item of selected) {
                        try {
                            execSync(`${muxCmd} kill-session -t ${item.sessionName}`, { stdio: 'pipe' });
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
                const runtimeMode = getSavedRuntimeMode();
                const muxCmd = ENV.getMultiplexerCommand(runtimeMode);
                sessions.forEach(sessionName => {
                    try {
                        execSync(`${muxCmd} kill-session -t ${sessionName}`, { stdio: 'pipe' });
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
