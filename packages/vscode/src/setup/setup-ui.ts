/**
 * セットアップUI共通モジュール
 * - 事前確認（QuickPick）
 * - 進捗表示（withProgress）
 * - 結果表示（showInformationMessage）
 * - ランタイムモード選択（Windows環境）
 */
import * as vscode from 'vscode';
import { RuntimeMode } from '../types';

export interface SetupRequirement {
    id: string;
    label: string;
    description: string;
    required: boolean;
    needsPassword: boolean;
    checked: boolean;
}

export interface SetupStep {
    id: string;
    label: string;
    progressMessage: string;
    estimatedSeconds: number;
}

export interface ConfirmationResult {
    confirmed: boolean;
    selectedIds: string[];
}

export interface SetupResult {
    success: boolean;
    completedSteps: string[];
    failedStep?: string;
    error?: string;
}

/**
 * 事前確認画面を表示（QuickPick）
 */
export async function showInitConfirmation(
    requirements: SetupRequirement[],
    title: string
): Promise<ConfirmationResult | undefined> {
    const items: vscode.QuickPickItem[] = requirements.map(req => ({
        label: req.required ? `$(check) ${req.label}` : req.label,
        description: req.needsPassword ? '🔐 パスワード必要' : '',
        detail: req.description,
        picked: req.checked
    }));

    const result = await vscode.window.showQuickPick(items, {
        title,
        placeHolder: '実行する項目を選択してください',
        canPickMany: true,
        ignoreFocusOut: true
    });

    if (!result) return undefined;

    return {
        confirmed: true,
        selectedIds: result.map(item => {
            const req = requirements.find(r =>
                item.label.includes(r.label) || item.label === `$(check) ${r.label}`
            );
            return req?.id ?? '';
        }).filter(id => id !== '')
    };
}

/**
 * 進捗表示付きで実行
 */
export async function executeWithProgress<T>(
    title: string,
    steps: SetupStep[],
    executor: (step: SetupStep, report: (msg: string) => void) => Promise<void>
): Promise<SetupResult> {
    const completedSteps: string[] = [];

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false
        }, async (progress) => {
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const increment = 100 / steps.length;

                progress.report({
                    message: `ステップ ${i + 1}/${steps.length}: ${step.progressMessage}`,
                    increment
                });

                await executor(step, (msg) => {
                    progress.report({ message: msg });
                });

                completedSteps.push(step.id);
            }
        });

        return { success: true, completedSteps };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            completedSteps,
            failedStep: steps[completedSteps.length]?.id,
            error: message
        };
    }
}

/**
 * 結果画面を表示
 */
export async function showSetupResult(result: SetupResult, nextSteps?: string[]): Promise<void> {
    if (result.success) {
        const message = nextSteps
            ? `✅ セットアップ完了\n\n💡 次のステップ:\n${nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
            : '✅ セットアップ完了';

        await vscode.window.showInformationMessage(message, { modal: false });
    } else {
        const completed = result.completedSteps.length > 0
            ? `\n\n完了したステップ: ${result.completedSteps.join(', ')}`
            : '';

        await vscode.window.showErrorMessage(
            `❌ セットアップ失敗: ${result.error}${completed}`,
            { modal: false }
        );
    }
}

// =============================================================================
// グローバル設定用の追加UI関数
// =============================================================================

import { GlobalRequirements } from './requirements-analyzer';

/**
 * グローバル設定用のユーザー入力
 */
export interface GlobalUserInput {
    approved: boolean;
    password?: string;
    skipItems: string[];  // スキップする項目のID
}

/**
 * グローバル設定確認用の項目
 */
export interface GlobalConfirmItem {
    id: string;
    label: string;
    description: string;
    required: boolean;
    needsPassword: boolean;
    defaultSelected: boolean;
}

/**
 * スキップ時のアナウンスメッセージ定義
 */
const SKIP_ANNOUNCEMENTS: Record<string, { message: string; severity: 'low' | 'medium' | 'high' }> = {
    passwordlessSudo: {
        message: 'sudoパスワードを毎回入力する必要があります',
        severity: 'low',
    },
    jqInstall: {
        message: 'maidctlの一部機能（JSON出力）が利用できません',
        severity: 'medium',
    },
    yqInstall: {
        message: 'maidctlの一部機能（YAML処理）が利用できません',
        severity: 'medium',
    },
    pm2Startup: {
        message: '⚠️ PC起動時にMCPサーバーの手動起動が必要です\n   コマンド: pm2 start maid-agent-messenger',
        severity: 'high',
    },
    pathSetup: {
        message: '⚠️ maidctlを使用するにはPATH設定が必要です\n   追加: export PATH="$HOME/.maid-agent/bin:$PATH"',
        severity: 'high',
    },
};

/**
 * 事前調査結果から確認項目を生成
 */
export function buildGlobalConfirmItems(requirements: GlobalRequirements): GlobalConfirmItem[] {
    const items: GlobalConfirmItem[] = [];

    // パスワードレスsudo（推奨）
    if (requirements.needs.passwordlessSudo) {
        items.push({
            id: 'passwordlessSudo',
            label: 'パスワードレスsudo設定（推奨）',
            description: 'sudo実行時にパスワード入力を省略',
            required: false,
            needsPassword: true,
            defaultSelected: true,
        });
    }

    // jqインストール
    if (requirements.needs.jqInstall) {
        items.push({
            id: 'jqInstall',
            label: 'jq インストール',
            description: 'JSONパーサー（maidctlで使用）',
            required: false,
            needsPassword: true,
            defaultSelected: true,
        });
    }

    // yqインストール
    if (requirements.needs.yqInstall) {
        items.push({
            id: 'yqInstall',
            label: 'yq インストール',
            description: 'YAMLパーサー（maidctlで使用）',
            required: false,
            needsPassword: true,
            defaultSelected: true,
        });
    }

    // pm2インストール（必須）
    if (requirements.needs.pm2Install) {
        items.push({
            id: 'pm2Install',
            label: 'pm2 インストール（必須）',
            description: 'MCPサーバープロセスマネージャー',
            required: true,
            needsPassword: true,
            defaultSelected: true,
        });
    }

    // pm2 startup
    if (requirements.needs.pm2Startup) {
        items.push({
            id: 'pm2Startup',
            label: 'pm2 自動起動設定',
            description: 'PC起動時にMCPサーバーを自動起動',
            required: false,
            needsPassword: true,
            defaultSelected: true,
        });
    }

    // PATH設定
    if (requirements.needs.pathSetup) {
        items.push({
            id: 'pathSetup',
            label: 'PATH設定',
            description: 'maidctlコマンドを使用可能にする',
            required: false,
            needsPassword: false,
            defaultSelected: true,
        });
    }

    return items;
}

/**
 * グローバル設定の確認画面を表示
 * @returns ユーザー入力またはundefined（キャンセル）
 */
export async function showGlobalConfirmation(
    requirements: GlobalRequirements
): Promise<GlobalUserInput | undefined> {
    const items = buildGlobalConfirmItems(requirements);

    if (items.length === 0) {
        // 何も必要ない場合はそのまま承認
        return {
            approved: true,
            skipItems: [],
        };
    }

    // QuickPickアイテムを構築
    const quickPickItems: vscode.QuickPickItem[] = items.map(item => ({
        label: item.required ? `$(check) ${item.label}` : item.label,
        description: item.needsPassword ? '🔐' : '',
        detail: item.description,
        picked: item.defaultSelected,
    }));

    // QuickPick表示
    const selected = await vscode.window.showQuickPick(quickPickItems, {
        title: '🔧 グローバル設定',
        placeHolder: '実行する項目を選択してください（必須項目は解除できません）',
        canPickMany: true,
        ignoreFocusOut: true,
    });

    if (!selected) {
        return undefined; // キャンセル
    }

    // 選択されたIDを抽出
    const selectedIds = selected.map(sel => {
        const item = items.find(i =>
            sel.label.includes(i.label) || sel.label === `$(check) ${i.label}`
        );
        return item?.id ?? '';
    }).filter(id => id !== '');

    // 必須項目が選択されているか確認
    const requiredItems = items.filter(i => i.required);
    const missingRequired = requiredItems.filter(i => !selectedIds.includes(i.id));

    if (missingRequired.length > 0) {
        vscode.window.showWarningMessage(
            `必須項目「${missingRequired.map(i => i.label).join('、')}」は解除できません`,
            { modal: false }
        );
        return undefined;
    }

    // スキップ項目を計算
    const skipItems = items
        .filter(item => !selectedIds.includes(item.id))
        .map(item => item.id);

    // パスワード入力が必要か判定
    const needsPassword = selectedIds.some(id => {
        const item = items.find(i => i.id === id);
        return item?.needsPassword;
    });

    let password: string | undefined;
    if (needsPassword && requirements.needsSudoPassword) {
        password = await promptGlobalPassword();
        if (password === undefined) {
            return undefined; // キャンセル
        }
    }

    return {
        approved: true,
        password,
        skipItems,
    };
}

/**
 * グローバル設定用のパスワード入力
 */
async function promptGlobalPassword(
    attempt: number = 1,
    maxAttempts: number = 3
): Promise<string | undefined> {
    const message = attempt > 1
        ? `セットアップのためsudoパスワードを入力してください（${attempt}/${maxAttempts}回目）`
        : 'セットアップのためsudoパスワードを入力してください';

    return await vscode.window.showInputBox({
        prompt: message,
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'パスワードを入力',
    });
}

/**
 * スキップ項目のアナウンスを生成
 */
export function buildSkipAnnouncements(skipItems: string[]): string[] {
    return skipItems
        .filter(id => SKIP_ANNOUNCEMENTS[id])
        .sort((a, b) => {
            const severityOrder = { high: 0, medium: 1, low: 2 };
            return severityOrder[SKIP_ANNOUNCEMENTS[a].severity] -
                   severityOrder[SKIP_ANNOUNCEMENTS[b].severity];
        })
        .map(id => SKIP_ANNOUNCEMENTS[id].message);
}

/**
 * グローバル設定の最終結果を表示
 */
export async function showGlobalSetupResult(
    successCount: number,
    totalCount: number,
    skipItems: string[],
    errors: string[]
): Promise<void> {
    const hasFailure = errors.length > 0;
    const hasSkip = skipItems.length > 0;

    let icon: string;
    let message: string;

    if (!hasFailure && !hasSkip) {
        icon = '✅';
        message = 'グローバル設定が完了しました！';
    } else if (!hasFailure && hasSkip) {
        icon = '⚠️';
        message = 'グローバル設定が完了しました（一部スキップ）';
    } else {
        icon = '❌';
        message = 'グローバル設定で問題が発生しました';
    }

    // スキップアナウンス
    const announcements = buildSkipAnnouncements(skipItems);

    // 詳細メッセージ
    const details: string[] = [];
    details.push(`${successCount}/${totalCount} ステップ完了`);

    if (announcements.length > 0) {
        details.push('');
        details.push('【スキップ項目の影響】');
        details.push(...announcements);
    }

    if (errors.length > 0) {
        details.push('');
        details.push('【エラー】');
        details.push(...errors);
    }

    const detailText = details.join('\n');

    if (hasFailure) {
        const choice = await vscode.window.showErrorMessage(
            `${icon} ${message}`,
            { modal: false },
            '詳細を確認'
        );
        if (choice === '詳細を確認') {
            vscode.window.showInformationMessage(detailText, { modal: true });
        }
    } else if (hasSkip) {
        await vscode.window.showWarningMessage(
            `${icon} ${message}\n\n${detailText}`,
            { modal: false }
        );
    } else {
        await vscode.window.showInformationMessage(
            `${icon} ${message}`,
            { modal: false }
        );
    }
}

// =============================================================================
// ランタイムモード選択UI
// =============================================================================

/**
 * ランタイムモード選択結果
 */
export interface RuntimeModeSelection {
    mode: RuntimeMode;
    cancelled: boolean;
}

/**
 * ランタイムモード選択ダイアログを表示（Windows環境のみ）
 * @returns 選択されたモード、またはキャンセル時はundefined
 */
export async function showRuntimeModeSelection(): Promise<RuntimeModeSelection | undefined> {
    const items: vscode.QuickPickItem[] = [
        {
            label: '$(terminal) WSLで使用する',
            description: '推奨',
            detail: 'WSL2 + tmux で複数エージェントを管理します。安定性重視。',
            picked: true,
        },
        {
            label: '$(window) Windowsで使用する',
            description: '実験的',
            detail: 'psmux でWindows上で直接実行します。WSL不要ですが、psmuxのインストールが必要です。',
        },
        {
            label: '$(combine) 両方で使用する',
            description: 'WSL + Windows',
            detail: 'WSLとWindows両方の環境をセットアップします。状況に応じて切り替えて使用できます。',
        },
    ];

    const selected = await vscode.window.showQuickPick(items, {
        title: '🔧 使用する環境を選択',
        placeHolder: 'エージェントをどの環境で実行しますか？',
        ignoreFocusOut: true,
    });

    if (!selected) {
        return undefined;
    }

    // 選択結果をRuntimeModeに変換
    let mode: RuntimeMode;
    if (selected.label.includes('両方')) {
        mode = 'both';
    } else if (selected.label.includes('WSL')) {
        mode = 'wsl';
    } else {
        mode = 'windows-native';
    }

    return {
        mode,
        cancelled: false,
    };
}
