import * as vscode from 'vscode';
import { MultiAgentController } from './controller';
import { AgentPanelProvider } from './ui/agent-panel-provider';
import { ENV } from './utils/environment';
import { getGlobalMaidAgentPath, getSessionNameFromPath, formatError } from './utils/helpers';
import { getSavedRuntimeMode, getPendingSetupState, clearPendingSetupState, continueGlobalSetup } from './setup/global-init';
import { MultiplexerFactory } from './multiplexer';

// =============================================================================
// 定数
// =============================================================================

/** VSCode初期化完了待機時間: 自動復帰用（ms） */
const AUTO_RESUME_DELAY_MS = 2000;

/** VSCode初期化完了待機時間: Init Global継続用（自動復帰より後に実行） */
const INIT_GLOBAL_CONTINUE_DELAY_MS = 3000;

// =============================================================================
// 拡張機能のエントリーポイント
// =============================================================================

let controller: MultiAgentController;

export function activate(context: vscode.ExtensionContext) {
    controller = new MultiAgentController();
    controller.setContext(context);

    // 保存済みランタイムモードを ENV に設定（内部状態の初期化）
    const savedRuntimeMode = getSavedRuntimeMode();
    if (savedRuntimeMode) {
        ENV.setRuntimeMode(savedRuntimeMode);
    }

    // エージェントパネル（サイドバー）を登録
    const agentPanelProvider = new AgentPanelProvider(context.extensionUri);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    agentPanelProvider.setWorkspaceRoot(workspaceRoot);
    controller.setAgentPanelProvider(agentPanelProvider);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            AgentPanelProvider.viewType,
            agentPanelProvider
        )
    );


    // コントローラパネルの永続化（VSCode再起動時に復元）
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('maidAgentController', {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
                // パネルのオプションを再設定
                panel.webview.options = { enableScripts: true };
                controller.restoreControllerPanel(panel);
            }
        })
    );

    // ダッシュボードパネルの永続化（VSCode再起動時に復元）
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('maidAgentDashboard', {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
                // パネルのオプションを再設定
                panel.webview.options = { enableScripts: true };
                controller.restoreDashboardPanel(panel);
            }
        })
    );

    // ターミナル切り替え時にパネルを更新
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTerminal((terminal) => {
            controller.setCurrentAgentFromTerminal(terminal);
        })
    );

    // ターミナル終了時にエージェントを削除
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((terminal) => {
            controller.handleTerminalClosed(terminal);
        })
    );

    const commands = [
        vscode.commands.registerCommand('multiAgent.initialize', async () => {
            try {
                await controller.initializeWorkspace();
            } catch (error) {
                vscode.window.showErrorMessage(`初期化に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] initializeWorkspace:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.initializeGlobal', async () => {
            try {
                const success = await controller.initializeGlobalSettings();
                if (success) {
                    const globalPath = getGlobalMaidAgentPath();
                    vscode.window.showInformationMessage(`🌐 グローバル設定を初期化しました: ${globalPath}`);
                    const uri = vscode.Uri.file(globalPath);
                    vscode.commands.executeCommand('revealFileInOS', uri);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`グローバル初期化に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] initializeGlobalSettings:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.resumeSessions', async () => {
            try {
                await controller.resumeSessions();
            } catch (error) {
                vscode.window.showErrorMessage(`セッション復帰に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] resumeSessions:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.callAgent', async () => {
            try {
                const items: vscode.QuickPickItem[] = [
                    { label: '$(person) 執事を呼ぶ', description: '執事 (butler) を起動', detail: '🎩' },
                    { label: '$(organization) メイド長を呼ぶ', description: 'メイド長 (chief) を起動', detail: '👑' },
                    { label: '$(organization) 執事とメイド長を呼ぶ', description: '執事とメイド長を同時に起動', detail: '🎩👑' },
                    { label: '$(list-selection) メイドを選んで呼ぶ', description: 'メイドを選択して起動', detail: '🎀' },
                ];

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'どのエージェントを呼びますか？',
                    title: 'Call Agent - エージェントを呼ぶ',
                });

                if (!selected) return;

                switch (selected.detail) {
                    case '🎩':
                        await controller.startButler();
                        break;
                    case '👑':
                        await controller.startChiefMaid();
                        break;
                    case '🎩👑':
                        await controller.startButler();
                        await controller.startChiefMaid();
                        break;
                    case '🎀':
                        await controller.startSelectedMaids();
                        break;
                }
            } catch (error) {
                vscode.window.showErrorMessage(`エージェント呼び出しに失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] callAgent:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.startAll', async () => {
            try {
                await controller.startAllAgents();
            } catch (error) {
                vscode.window.showErrorMessage(`全エージェント起動に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] startAllAgents:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.sendToButler', async () => {
            try {
                await controller.promptAndSendToButler();
            } catch (error) {
                vscode.window.showErrorMessage(`執事への送信に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] promptAndSendToButler:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.sendToMaid', async () => {
            try {
                await controller.promptAndSendToMaid();
            } catch (error) {
                vscode.window.showErrorMessage(`メイドへの送信に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] promptAndSendToMaid:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.startClaude', async () => {
            try {
                await controller.startClaudeOnAllAgents();
            } catch (error) {
                vscode.window.showErrorMessage(`Claude起動に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] startClaudeOnAllAgents:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.showController', () => {
            controller.showController();
        }),
        vscode.commands.registerCommand('multiAgent.showDashboard', () => {
            controller.showDashboard();
        }),
        vscode.commands.registerCommand('multiAgent.openDashboardInBrowser', () => {
            controller.openDashboardInBrowser();
        }),
        vscode.commands.registerCommand('multiAgent.watchFiles', async () => {
            try {
                await controller.startWatchingFiles();
            } catch (error) {
                vscode.window.showErrorMessage(`ファイル監視の開始に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] startWatchingFiles:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.stopWatchFiles', () => {
            controller.stopWatchingFiles();
        }),
        vscode.commands.registerCommand('multiAgent.openTmuxViewer', () => {
            controller.openTmuxViewer();
        }),
        vscode.commands.registerCommand('multiAgent.killAll', () => {
            controller.killAll();
        }),
        vscode.commands.registerCommand('multiAgent.killPick', async () => {
            try {
                await controller.killPick();
            } catch (error) {
                vscode.window.showErrorMessage(`エージェント終了に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] killPick:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.restartPick', async () => {
            try {
                await controller.restartPick();
            } catch (error) {
                vscode.window.showErrorMessage(`エージェント再起動に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] restartPick:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.processNotifications', async () => {
            try {
                await controller.manualProcessNotifications();
            } catch (error) {
                vscode.window.showErrorMessage(`通知処理に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] manualProcessNotifications:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.showStatus', () => {
            controller.showDebugStatus();
        }),
        vscode.commands.registerCommand('multiAgent.promoteRuleToGlobal', async () => {
            try {
                await controller.promoteRuleToGlobal();
            } catch (error) {
                vscode.window.showErrorMessage(`ルール昇格に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] promoteRuleToGlobal:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.cleanup', async () => {
            try {
                await controller.showCleanup();
            } catch (error) {
                vscode.window.showErrorMessage(`クリーンアップに失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] cleanup:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.setRuntimeMode', async () => {
            try {
                await controller.setRuntimeMode();
            } catch (error) {
                vscode.window.showErrorMessage(`ランタイムモード変更に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] setRuntimeMode:', error);
            }
        }),
        vscode.commands.registerCommand('multiAgent.switchMultiplexer', async () => {
            try {
                await controller.switchMultiplexer();
            } catch (error) {
                vscode.window.showErrorMessage(`マルチプレクサ切替に失敗しました: ${formatError(error)}`);
                console.error('[Maid Agent] switchMultiplexer:', error);
            }
        }),
    ];

    context.subscriptions.push(...commands);

    // ダッシュボードボタン（タスク一覧）
    const dashboardStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    dashboardStatusBarItem.text = '📋 Dashboard';
    dashboardStatusBarItem.command = 'multiAgent.showDashboard';
    dashboardStatusBarItem.tooltip = 'クリックでタスク一覧を表示';
    dashboardStatusBarItem.show();
    context.subscriptions.push(dashboardStatusBarItem);

    // Controller ボタン（コントローラー）
    const controllerStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    controllerStatusBarItem.text = '🎩 Controller';
    controllerStatusBarItem.command = 'multiAgent.showController';
    controllerStatusBarItem.tooltip = 'クリックでコントローラーを表示';
    controllerStatusBarItem.show();
    context.subscriptions.push(controllerStatusBarItem);

    // コントローラーにステータスバーを設定（通知用）
    controller.setStatusBarItem(controllerStatusBarItem);

    // IDE起動時の自動復帰機能
    const autoResumeEnabled = vscode.workspace.getConfiguration('maidAgent').get<boolean>('autoResumeOnStartup', true);
    if (autoResumeEnabled) {
        // 少し遅延させてから自動復帰を試行（VSCodeの初期化完了を待つ）
        setTimeout(async () => {
            try {
                // 既存のTmuxセッションがあるかチェック
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const workspacePath = workspaceFolder.uri.fsPath;
                    const sessionName = getSessionNameFromPath(workspacePath);

                    // セッションが存在するかチェック（multiplexer層経由）
                    let sessionExists = false;
                    try {
                        const factory = new MultiplexerFactory();
                        const adapter = factory.create(sessionName, workspacePath);
                        sessionExists = adapter.sessionExists();
                    } catch {
                        sessionExists = false;
                    }

                    if (sessionExists) {
                        // 自動復帰を実行
                        await controller.resumeSessions();
                    }
                }
            } catch (error) {
                // 自動復帰に失敗しても致命的ではないのでログのみ
                console.error('[Maid Agent] 自動復帰に失敗:', error);
            }
        }, AUTO_RESUME_DELAY_MS);
    }

    // Init Global 継続チェック（VS Code 再起動後の自動継続）
    const pendingSetup = getPendingSetupState(context);
    console.log('[Maid Agent] 起動時の保留状態:', pendingSetup ? JSON.stringify(pendingSetup) : 'なし');

    if (pendingSetup) {
        // 少し遅延させて VS Code の初期化完了を待つ
        setTimeout(async () => {
            console.log('[Maid Agent] Init Global 継続処理を開始...');
            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const globalPath = getGlobalMaidAgentPath();
                const outputChannel = controller.getOutputChannel();
                outputChannel.show(); // デバッグ用に表示
                const ctx = {
                    context,
                    workspaceRoot,
                    maidAgentPath: workspaceRoot ? `${workspaceRoot}/.maid-agent` : '',
                    globalMaidAgentPath: globalPath,
                    extensionPath: context.extensionPath,
                    outputChannel,
                    log: (message: string) => {
                        console.log(message);
                        outputChannel.appendLine(message);
                    },
                };
                await continueGlobalSetup(ctx);
            } catch (error) {
                console.error('[Maid Agent] Init Global 継続に失敗:', error);
                clearPendingSetupState(context);
            }
        }, INIT_GLOBAL_CONTINUE_DELAY_MS);
    }
}

export function deactivate() {
    controller?.dispose();
}
