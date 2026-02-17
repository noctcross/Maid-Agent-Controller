/**
 * セットアップUI共通モジュール
 * - 事前確認（QuickPick）
 * - 進捗表示（withProgress）
 * - 結果表示（showInformationMessage）
 */
import * as vscode from 'vscode';

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
