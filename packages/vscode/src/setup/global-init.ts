/**
 * グローバル設定モジュール（4フェーズ構造）
 *
 * フェーズ0: モード選択（Windows環境のみ）
 * フェーズ1: 事前調査（自動）
 * フェーズ2: 入力一括取得（ユーザー操作1回）
 * フェーズ3: 自動実行（進捗表示のみ）
 * フェーズ4: 結果表示
 *
 * 分割構成:
 * - global-config.ts: 設定YAML読み書き、環境状態管理
 * - global-deploy.ts: テンプレートコピー、maidctlデプロイ、インストール関数
 * - global-steps.ts: buildExecutionSteps() + ステップ定義
 * - pending-state.ts: VS Code再起動跨ぎのpending state管理
 * - global-init.ts: 4フェーズ制御フロー（本ファイル）
 */
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { SetupContext, RuntimeMode } from '../types';
import { ENV } from '../utils/environment';
import {
    analyzeRequirements,
    isAllConfigured,
    countRequiredSteps,
    checkWslOperational,
} from './requirements-analyzer';
import {
    showGlobalConfirmation,
    showGlobalSetupResult,
    showRuntimeModeSelection,
} from './setup-ui';
import {
    saveRuntimeMode,
    getSavedRuntimeMode,
} from './global-config';
import { setEnvironmentStatus } from '../utils/environment-status';
import { StepResult, PendingSetupState, savePendingSetupState, getPendingSetupState, clearPendingSetupState } from './pending-state';
import { buildExecutionSteps } from './global-steps';

// Re-export for backward compatibility
export { getSavedRuntimeMode, saveRuntimeMode } from './global-config';
export type { GlobalConfig } from './global-config';
export { getEnvironmentStatus, setEnvironmentStatus, getReadyEnvironments, isEnvironmentReady } from '../utils/environment-status';
export type { EnvironmentType, EnvironmentStatus } from '../utils/environment-status';
export { savePendingSetupState, getPendingSetupState, clearPendingSetupState } from './pending-state';
export type { ExecutionStep, StepResult, PendingSetupState } from './pending-state';

// =============================================================================
// メイン関数（4フェーズ構造）
// =============================================================================

/**
 * グローバル設定を実行（5フェーズ構造）
 */
export async function initializeGlobalSettingsNew(ctx: SetupContext): Promise<boolean> {
    ctx.log('[Global] === グローバル設定開始（新フロー） ===');

    // ========================================
    // フェーズ0: モード選択（Windows環境のみ）
    // ========================================
    let runtimeMode: RuntimeMode = 'wsl';

    if (ENV.isWindowsNative()) {
        // 既存の設定を確認
        const savedMode = getSavedRuntimeMode();
        if (savedMode) {
            ctx.log(`[Global] 保存済みランタイムモード: ${savedMode}`);
            // 既存設定がある場合は確認ダイアログ
            const modeDisplayName = savedMode === 'wsl' ? 'WSL' : savedMode === 'both' ? 'WSL + Windows' : 'Windows直接実行';
            const changeMode = await vscode.window.showQuickPick(
                ['現在の設定を使用', 'モードを変更'],
                {
                    title: `現在のモード: ${modeDisplayName}`,
                    placeHolder: '実行モードを変更しますか？',
                }
            );

            if (changeMode === undefined) {
                ctx.log('[Global] ユーザーがキャンセル');
                return false;
            }

            if (changeMode === '現在の設定を使用') {
                runtimeMode = savedMode;
            } else {
                // モード選択ダイアログを表示
                const selection = await showRuntimeModeSelection();
                if (!selection) {
                    ctx.log('[Global] ユーザーがキャンセル');
                    return false;
                }
                runtimeMode = selection.mode;
                saveRuntimeMode(runtimeMode, ctx);
            }
        } else {
            // 初回: モード選択ダイアログを表示
            const selection = await showRuntimeModeSelection();
            if (!selection) {
                ctx.log('[Global] ユーザーがキャンセル');
                return false;
            }
            runtimeMode = selection.mode;
            saveRuntimeMode(runtimeMode, ctx);
        }

        ctx.log(`[Global] 選択されたランタイムモード: ${runtimeMode}`);
    }

    // 'both' モードの場合、まずWSLセットアップを実行し、その後psmuxセットアップを実行
    const isBothMode = runtimeMode === 'both';
    const primaryMode: RuntimeMode = isBothMode ? 'wsl' : runtimeMode;

    if (isBothMode) {
        ctx.log('[Global] 両方モード: まずWSLセットアップを実行します');
    }

    // ========================================
    // フェーズ1: 事前調査
    // ========================================
    const requirements = await analyzeRequirements(ctx, primaryMode);

    // すべて設定済みの場合はスキップ
    if (isAllConfigured(requirements)) {
        ctx.log('[Global] すべて設定済み - スキップ');
        // 環境ステータスを ready に設定（早期リターンでも設定が必要）
        if (primaryMode === 'wsl') {
            setEnvironmentStatus('wsl', 'ready', ctx);
        } else if (primaryMode === 'windows-native') {
            setEnvironmentStatus('windows', 'ready', ctx);
        }
        vscode.window.showInformationMessage('✅ グローバル設定は既に完了しています');
        return true;
    }

    const requiredCount = countRequiredSteps(requirements);
    ctx.log(`[Global] 必要な設定: ${requiredCount}項目`);

    // ========================================
    // WSL動作チェック（WSLモードでWSL/Ubuntuインストール済みの場合）
    // ========================================
    if (primaryMode !== 'windows-native' &&
        !requirements.needs.wslInstall &&
        !requirements.needs.ubuntuInstall) {
        // WSL/Ubuntuはインストール済みだが、初期設定が完了していない可能性がある
        if (!checkWslOperational()) {
            ctx.log('[Global] WSLが動作不可 - Ubuntu初期設定が必要');
            const choice = await vscode.window.showWarningMessage(
                '📋 WSL/Ubuntuはインストール済みですが、初期設定が完了していません。\n\n' +
                '以下の手順で初期設定を完了してください：\n' +
                '1. Ubuntuを起動\n' +
                '2. ユーザー名とパスワードを設定\n' +
                '3. 設定完了後、再度「Init Global」を実行\n\n' +
                '※ このパスワードはWSL内でのsudo操作に使用します',
                { modal: true },
                'Ubuntuを開く',
                '後で手動で行う'
            );
            if (choice === 'Ubuntuを開く') {
                try {
                    execSync('start ubuntu', { stdio: 'ignore' });
                    ctx.log('[Global] Ubuntuを起動しました');
                } catch (error) {
                    ctx.log(`[Global] Ubuntu起動失敗: ${error}`);
                    vscode.window.showErrorMessage('Ubuntuの起動に失敗しました。スタートメニューから手動で起動してください。');
                }
            }
            return false;
        }
        ctx.log('[Global] WSL動作確認OK');
    }

    // ========================================
    // フェーズ2: 入力一括取得
    // ========================================
    const userInput = await showGlobalConfirmation(requirements);

    if (!userInput || !userInput.approved) {
        ctx.log('[Global] ユーザーがキャンセル');
        return false;
    }

    ctx.log(`[Global] スキップ項目: ${userInput.skipItems.join(', ') || 'なし'}`);

    // ========================================
    // フェーズ3: 自動実行
    // ========================================
    const steps = buildExecutionSteps(requirements, userInput.skipItems);
    const results: StepResult[] = [];
    let needsReboot = false;
    let needsReload = false;
    let needsManualStep = false;
    let manualStepId: string | undefined;  // どのステップが手動操作を要求したか
    const completedSteps: string[] = [];

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '🔄 グローバル設定中...',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];

            progress.report({
                message: `ステップ ${i + 1}/${steps.length}: ${step.progressMessage}`,
                increment: i === 0 ? 0 : (100 / steps.length)
            });

            try {
                await step.execute(ctx, userInput.password);
                results.push({ stepId: step.id, success: true });
                completedSteps.push(step.id);
                ctx.log(`[Global] ステップ完了: ${step.id}`);

                // PC再起動が必要なステップが成功した場合、以降のステップは実行しない
                if (step.requiresReboot) {
                    needsReboot = true;
                    ctx.log('[Global] PC再起動が必要なため、残りのステップは再起動後に実行');
                    break;
                }

                // VS Code Reload が必要なステップが成功した場合
                if (step.requiresReload) {
                    needsReload = true;
                    ctx.log('[Global] Reload Window が必要なため、残りのステップはリロード後に実行');
                    break;
                }

                // 手動操作が必要なステップが成功した場合、以降のステップは実行しない
                if (step.requiresManualStep) {
                    needsManualStep = true;
                    manualStepId = step.id;
                    ctx.log(`[Global] 手動操作が必要なため（${step.id}）、残りのステップは手動操作完了後に実行`);
                    break;
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push({ stepId: step.id, success: false, error: errorMsg });
                ctx.log(`[Global] ステップ失敗: ${step.id} - ${errorMsg}`);

                // 重大エラーの場合は中断
                if (step.critical) {
                    ctx.log('[Global] 重大エラーのため中断');
                    break;
                }
            }
        }
    });

    // 再起動が必要な場合は特別なメッセージを表示
    if (needsReboot) {
        const choice = await vscode.window.showWarningMessage(
            '🔄 WSLのインストールが完了しました。\n\n' +
            'PCを再起動してください。\n' +
            '再起動後、再度「Init Global」を実行して残りのセットアップを完了してください。',
            { modal: true },
            'PCを再起動する',
            '後で手動で行う'
        );

        if (choice === 'PCを再起動する') {
            const confirmRestart = await vscode.window.showWarningMessage(
                '本当にPCを再起動しますか?\n作業中のファイルを保存してください。',
                '再起動',
                'キャンセル'
            );
            if (confirmRestart === '再起動') {
                execSync('shutdown /r /t 30 /c "WSLインストール完了のため再起動します"');
                vscode.window.showInformationMessage('30秒後にPCが再起動します。');
            }
        }

        return true; // 一部完了として成功を返す
    }

    // VS Code 再起動が必要な場合（Reload Window では環境変数が更新されない）
    if (needsReload && ctx.context) {
        // 状態を保存（再起動後に継続用）
        const pendingState: PendingSetupState = {
            runtimeMode,
            completedSteps,
            skipItems: userInput.skipItems,
            timestamp: Date.now(),
        };
        savePendingSetupState(ctx.context, pendingState);
        ctx.log('[Global] 保留状態を保存しました');

        const choice = await vscode.window.showWarningMessage(
            '🔄 Node.js のインストールが完了しました。\n\n' +
            '**重要**: PATH を反映するため VS Code を**完全に終了して再起動**してください。\n' +
            '（Reload Window では環境変数が更新されません）\n\n' +
            '再起動後、自動的に残りのセットアップが継続されます。',
            { modal: true },
            'VS Code を終了',
            '後で手動で再起動'
        );

        if (choice === 'VS Code を終了') {
            // VS Code を完全に終了
            await vscode.commands.executeCommand('workbench.action.quit');
        } else {
            vscode.window.showInformationMessage(
                'VS Code を完全に終了して再起動後、Init Global が自動継続されます。'
            );
        }

        return true; // 一部完了として成功を返す
    }

    // 手動操作が必要な場合は案内を表示
    if (needsManualStep) {
        if (manualStepId === 'ubuntuInstall') {
            // Ubuntu初期設定の案内
            const choice = await vscode.window.showWarningMessage(
                '📋 Ubuntuのインストールが完了しました。\n\n' +
                '以下の手順で初期設定を完了してください：\n' +
                '1. Ubuntuを起動\n' +
                '2. ユーザー名とパスワードを設定\n' +
                '3. 設定完了後、再度「Init Global」を実行\n\n' +
                '※ このパスワードはWSL内でのsudo操作に使用します',
                { modal: true },
                'Ubuntuを開く',
                '後で手動で行う'
            );

            if (choice === 'Ubuntuを開く') {
                try {
                    execSync('start ubuntu', { stdio: 'ignore' });
                    ctx.log('[Global] Ubuntuを起動しました');
                } catch (error) {
                    ctx.log(`[Global] Ubuntu起動失敗: ${error}`);
                    vscode.window.showErrorMessage('Ubuntuの起動に失敗しました。スタートメニューから手動で起動してください。');
                }
            }
        } else if (manualStepId === 'nodeInstall') {
            // Node.jsインストール後の案内
            await vscode.window.showWarningMessage(
                '📋 Node.jsのインストールが完了しました。\n\n' +
                'PATHを反映するため、以下の手順を実行してください：\n' +
                '1. VS Codeを再起動（または新しいターミナルを開く）\n' +
                '2. 再度「Init Global」を実行\n\n' +
                '※ Node.jsはpm2実行に必要です',
                { modal: true },
                'OK'
            );
        } else {
            // その他の手動操作ステップ（汎用）
            await vscode.window.showWarningMessage(
                `📋 ${manualStepId} が完了しました。\n\n` +
                '手動での追加設定が必要です。\n' +
                '設定完了後、再度「Init Global」を実行してください。',
                { modal: true },
                'OK'
            );
        }

        return true; // 一部完了として成功を返す
    }

    // ========================================
    // フェーズ4: 結果表示
    // ========================================
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    const errors = results.filter(r => !r.success).map(r => `${r.stepId}: ${r.error}`);

    await showGlobalSetupResult(
        successCount,
        totalCount,
        userInput.skipItems,
        errors
    );

    const hasFailure = errors.length > 0;
    const hasCriticalFailure = results.some(r => !r.success && steps.find(s => s.id === r.stepId)?.critical);

    ctx.log(`[Global] === グローバル設定完了: ${successCount}/${totalCount} 成功 ===`);

    // セットアップ完了した環境のステータスを更新
    if (!hasCriticalFailure) {
        if (primaryMode === 'wsl' || primaryMode === 'both') {
            setEnvironmentStatus('wsl', 'ready', ctx);
        }
        if (primaryMode === 'windows-native') {
            setEnvironmentStatus('windows', 'ready', ctx);
        }
    }

    // ========================================
    // 両方モード: psmuxセットアップも実行
    // ========================================
    if (isBothMode && !hasCriticalFailure) {
        ctx.log('[Global] 両方モード: 続いてWindows環境（psmux）のセットアップを実行します');

        const continueWithPsmux = await vscode.window.showInformationMessage(
            '✅ WSL環境のセットアップが完了しました。\n続いてWindows環境（psmux）のセットアップを行いますか？',
            { modal: true },
            'セットアップする',
            'スキップ'
        );

        if (continueWithPsmux === 'セットアップする') {
            // psmuxモードで再度実行
            const psmuxRequirements = await analyzeRequirements(ctx, 'windows-native');

            if (!isAllConfigured(psmuxRequirements)) {
                const psmuxInput = await showGlobalConfirmation(psmuxRequirements);

                if (psmuxInput && psmuxInput.approved) {
                    const psmuxSteps = buildExecutionSteps(psmuxRequirements, psmuxInput.skipItems);

                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: '🔄 Windows環境セットアップ中...',
                        cancellable: false
                    }, async (progress) => {
                        for (let i = 0; i < psmuxSteps.length; i++) {
                            const step = psmuxSteps[i];
                            progress.report({
                                message: `ステップ ${i + 1}/${psmuxSteps.length}: ${step.progressMessage}`,
                                increment: i === 0 ? 0 : (100 / psmuxSteps.length)
                            });

                            try {
                                await step.execute(ctx, psmuxInput.password);
                                ctx.log(`[Global] psmuxステップ完了: ${step.id}`);
                            } catch (error) {
                                const errorMsg = error instanceof Error ? error.message : String(error);
                                ctx.log(`[Global] psmuxステップ失敗: ${step.id} - ${errorMsg}`);
                            }
                        }
                    });

                    // Windows 環境のステータスを更新
                    setEnvironmentStatus('windows', 'ready', ctx);
                    vscode.window.showInformationMessage('✅ 両方の環境のセットアップが完了しました！');
                }
            } else if (isAllConfigured(psmuxRequirements)) {
                setEnvironmentStatus('windows', 'ready', ctx);
                vscode.window.showInformationMessage('✅ Windows環境は既にセットアップ済みです');
            }
        } else {
            ctx.log('[Global] 両方モード: psmuxセットアップをスキップ');
        }
    }

    return !hasCriticalFailure;
}

/**
 * 保留中のセットアップを継続（Reload Window後に呼び出される）
 */
export async function continueGlobalSetup(ctx: SetupContext): Promise<boolean> {
    if (!ctx.context) {
        ctx.log('[Global] ExtensionContext がないため継続できません');
        return false;
    }

    const pendingState = getPendingSetupState(ctx.context);
    if (!pendingState) {
        ctx.log('[Global] 保留中のセットアップ状態がありません');
        return false;
    }

    // 古い状態（30分以上前）は無視
    const MAX_AGE = 30 * 60 * 1000; // 30分
    if (Date.now() - pendingState.timestamp > MAX_AGE) {
        ctx.log('[Global] 保留状態が古いため無視します');
        clearPendingSetupState(ctx.context);
        return false;
    }

    ctx.log(`[Global] === セットアップを継続 (モード: ${pendingState.runtimeMode}) ===`);
    ctx.log(`[Global] 完了済みステップ: ${pendingState.completedSteps.join(', ')}`);

    // リロード前に確認済みなので、自動的に継続（通知のみ表示）
    vscode.window.showInformationMessage('🔄 Init Global の続きを自動実行します...');

    // 現在の要件を再分析
    const requirements = await analyzeRequirements(ctx, pendingState.runtimeMode);

    // すべて設定済みの場合
    if (isAllConfigured(requirements)) {
        ctx.log('[Global] すべて設定済み');
        // 環境ステータスを ready に設定
        if (pendingState.runtimeMode === 'wsl' || pendingState.runtimeMode === 'both') {
            setEnvironmentStatus('wsl', 'ready', ctx);
        }
        if (pendingState.runtimeMode === 'windows-native' || pendingState.runtimeMode === 'both') {
            setEnvironmentStatus('windows', 'ready', ctx);
        }
        clearPendingSetupState(ctx.context);
        vscode.window.showInformationMessage('✅ グローバル設定は既に完了しています');
        return true;
    }

    // 残りのステップを構築（完了済みステップをスキップリストに追加）
    const allSkipItems = [...new Set([...pendingState.skipItems, ...pendingState.completedSteps])];
    const steps = buildExecutionSteps(requirements, allSkipItems);

    if (steps.length === 0) {
        ctx.log('[Global] 実行するステップがありません');
        // 環境ステータスを ready に設定
        if (pendingState.runtimeMode === 'wsl' || pendingState.runtimeMode === 'both') {
            setEnvironmentStatus('wsl', 'ready', ctx);
        }
        if (pendingState.runtimeMode === 'windows-native' || pendingState.runtimeMode === 'both') {
            setEnvironmentStatus('windows', 'ready', ctx);
        }
        clearPendingSetupState(ctx.context);
        vscode.window.showInformationMessage('✅ グローバル設定は既に完了しています');
        return true;
    }

    ctx.log(`[Global] 残りステップ: ${steps.map(s => s.id).join(', ')}`);

    // 残りのステップを実行
    const results: StepResult[] = [];
    const completedSteps = [...pendingState.completedSteps];
    let needsReboot = false;
    let needsReload = false;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '🔄 グローバル設定継続中...',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];

            progress.report({
                message: `ステップ ${i + 1}/${steps.length}: ${step.progressMessage}`,
                increment: i === 0 ? 0 : (100 / steps.length)
            });

            try {
                await step.execute(ctx, undefined); // パスワードは再度要求しない
                results.push({ stepId: step.id, success: true });
                completedSteps.push(step.id);
                ctx.log(`[Global] ステップ完了: ${step.id}`);

                if (step.requiresReboot) {
                    needsReboot = true;
                    break;
                }

                if (step.requiresReload) {
                    needsReload = true;
                    break;
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                results.push({ stepId: step.id, success: false, error: errorMsg });
                ctx.log(`[Global] ステップ失敗: ${step.id} - ${errorMsg}`);

                if (step.critical) {
                    break;
                }
            }
        }
    });

    // 再度 Reload が必要な場合
    if (needsReload) {
        const pendingStateNew: PendingSetupState = {
            runtimeMode: pendingState.runtimeMode,
            completedSteps,
            skipItems: pendingState.skipItems,
            timestamp: Date.now(),
        };
        savePendingSetupState(ctx.context, pendingStateNew);
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
        return true;
    }

    // 完了
    clearPendingSetupState(ctx.context);

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    const errors = results.filter(r => !r.success).map(r => `${r.stepId}: ${r.error}`);

    await showGlobalSetupResult(
        successCount + pendingState.completedSteps.length,
        totalCount + pendingState.completedSteps.length,
        pendingState.skipItems,
        errors
    );

    ctx.log(`[Global] === セットアップ継続完了: ${successCount}/${totalCount} 成功 ===`);

    // 環境ステータスを ready に設定
    if (errors.length === 0) {
        if (pendingState.runtimeMode === 'wsl' || pendingState.runtimeMode === 'both') {
            setEnvironmentStatus('wsl', 'ready', ctx);
        }
        if (pendingState.runtimeMode === 'windows-native' || pendingState.runtimeMode === 'both') {
            setEnvironmentStatus('windows', 'ready', ctx);
        }
    }

    return errors.length === 0;
}
