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
 * 事前確認画面を表示
 * QuickPick で選択肢を表示し、ユーザーの選択を返す
 */
export async function showInitConfirmation(
    requirements: SetupRequirement[],
    isReinit: boolean
): Promise<ConfirmationResult | undefined> {
    const items = requirements.map(req => ({
        label: req.required ? `$(check) ${req.label}` : req.label,
        description: req.description + (req.needsPassword ? ' 🔐' : ''),
        picked: req.checked,
        alwaysShow: true,
        requirement: req
    }));

    const title = isReinit
        ? '🎩 Maid Agent グローバル設定（再初期化）'
        : '🎩 Maid Agent グローバル設定';

    const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Enterで開始、Escでキャンセル',
        title,
        ignoreFocusOut: true
    });

    if (!selected) {
        return undefined; // キャンセル
    }

    // 必須項目が選択されているか確認
    const missingRequired = requirements
        .filter(req => req.required)
        .filter(req => !selected.some(s => s.requirement.id === req.id));

    if (missingRequired.length > 0) {
        const missing = missingRequired.map(r => r.label).join(', ');
        vscode.window.showWarningMessage(`必須項目が選択されていません: ${missing}`);
        return undefined;
    }

    return {
        confirmed: true,
        selectedIds: selected.map(s => s.requirement.id)
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
            const totalSteps = steps.length;
            let currentStep = 0;

            for (const step of steps) {
                currentStep++;
                const percentage = Math.round((currentStep / totalSteps) * 100);
                progress.report({
                    message: `(${currentStep}/${totalSteps}) ${step.progressMessage}`,
                    increment: percentage / totalSteps
                });

                await executor(step, (msg) => {
                    progress.report({ message: msg });
                });

                completedSteps.push(step.id);
            }
        });

        return {
            success: true,
            completedSteps
        };
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
export async function showSetupResult(result: SetupResult): Promise<void> {
    if (result.success) {
        const message = `✅ セットアップが完了しました（${result.completedSteps.length}ステップ）`;
        const action = await vscode.window.showInformationMessage(
            message,
            '次のステップを見る'
        );

        if (action === '次のステップを見る') {
            vscode.window.showInformationMessage(
                '💡 次のステップ:\n' +
                '1. 新しいターミナルを開いてください\n' +
                '2. maidctl --help でコマンドを確認できます\n' +
                '3. プロジェクトで「Maid Agent: Init」を実行してください',
                { modal: true }
            );
        }
    } else {
        const failedStepMsg = result.failedStep ? ` (${result.failedStep})` : '';
        const errorMsg = result.error ? `\n\nエラー: ${result.error}` : '';
        vscode.window.showErrorMessage(
            `❌ セットアップに失敗しました${failedStepMsg}${errorMsg}`
        );
    }
}
