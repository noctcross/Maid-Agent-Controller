/**
 * セットアップUI共通モジュール
 * - Phase 2: 入力一括取得
 * - Phase 4: 結果表示
 * - 事前確認（QuickPick）
 * - 進捗表示（withProgress）
 */
import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { SetupContext, GlobalRequirements, UnifiedUserInput, SetupItem, SetupResult } from '../types';
import { CURRENT_ENV } from '../utils/environment';

// =============================================================================
// 型定義（既存）
// =============================================================================

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

// =============================================================================
// Phase 2: ユーザー入力一括取得
// =============================================================================

/**
 * セットアップ項目情報
 */
interface SetupItemInfo {
    id: SetupItem;
    label: string;
    description: string;
    skipWarning: string;
    picked: boolean;
}

/**
 * Phase 2: ユーザー入力を一括取得
 * 確認ダイアログ → カスタマイズ（任意）→ パスワード入力（必要な場合）
 */
export async function collectUnifiedInput(
    ctx: SetupContext,
    requirements: GlobalRequirements
): Promise<UnifiedUserInput> {
    // 1. 再起動が必要な場合は別フロー
    if (requirements.needsReboot) {
        return await handleRebootRequired(ctx, requirements);
    }

    // 2. 実行内容の確認
    const items = buildSetupItemList(requirements);
    const selection = await showSetupConfirmation(ctx, items);

    if (selection === 'cancel') {
        return { approved: false, skippedItems: [] };
    }

    // 3. カスタマイズの場合
    const skippedItems: SetupItem[] = [];
    if (selection === 'customize') {
        const customResult = await showCustomizeDialog(ctx, items);
        if (!customResult.approved) {
            return { approved: false, skippedItems: [] };
        }
        skippedItems.push(...customResult.skippedItems);
    }

    // 4. パスワード入力（必要な場合のみ）
    let password: string | undefined;
    if (needsPasswordInput(requirements, skippedItems)) {
        password = await promptPasswordOnce(ctx);
        if (password === undefined) {
            return { approved: false, skippedItems: [] };
        }
    }

    return { approved: true, password, skippedItems };
}

/**
 * 再起動が必要な場合の処理
 */
async function handleRebootRequired(
    ctx: SetupContext,
    requirements: GlobalRequirements
): Promise<UnifiedUserInput> {
    const message = requirements.needsWslInstall
        ? 'WSL2のインストールが必要です。インストール後、PCの再起動が必要です。'
        : 'Ubuntuのインストールが必要です。インストール後、PCの再起動が必要です。';

    const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'インストールする',
        'キャンセル'
    );

    if (choice !== 'インストールする') {
        return { approved: false, skippedItems: [] };
    }

    return { approved: true, skippedItems: [] };
}

/**
 * セットアップ項目のリストを構築
 */
function buildSetupItemList(requirements: GlobalRequirements): SetupItemInfo[] {
    const items: SetupItemInfo[] = [];

    // Windows: パスワードレスsudo
    if (requirements.isWindows && requirements.needsPasswordlessSudo) {
        items.push({
            id: 'passwordlessSudo',
            label: 'パスワードレスsudo設定',
            description: '一度だけパスワードを入力すると、以降は自動で実行されます',
            skipWarning: '毎回パスワード入力が必要になります',
            picked: true
        });
    }

    // pm2インストール
    if (requirements.needsPm2Install) {
        items.push({
            id: 'pm2Install',
            label: 'pm2 インストール',
            description: 'MCPサーバー管理に必要なプロセスマネージャー',
            skipWarning: 'MCPサーバーが起動できません。手動でインストールしてください: npm install -g pm2',
            picked: true
        });
    }

    // pm2 startup
    if (requirements.needsPm2Startup) {
        items.push({
            id: 'pm2Startup',
            label: 'pm2 自動起動設定',
            description: 'システム起動時にMCPサーバーを自動起動',
            skipWarning: 'システム起動時に手動でサーバーを起動してください: pm2 start ~/.maid-agent/maid-agent-messenger/ecosystem.config.cjs',
            picked: true
        });
    }

    return items;
}

/**
 * 確認ダイアログを表示
 * @returns 'all' | 'customize' | 'cancel'
 */
async function showSetupConfirmation(
    ctx: SetupContext,
    items: SetupItemInfo[]
): Promise<'all' | 'customize' | 'cancel'> {
    if (items.length === 0) {
        // 何もセットアップが必要ない場合は自動で承認
        return 'all';
    }

    const itemList = items.map(item => `  ✓ ${item.label}`).join('\n');
    const message = `以下の設定を行います：\n\n${itemList}`;

    const choice = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'すべて実行',
        'カスタマイズ',
        'キャンセル'
    );

    if (choice === 'すべて実行') {
        return 'all';
    } else if (choice === 'カスタマイズ') {
        return 'customize';
    }
    return 'cancel';
}

/**
 * カスタマイズダイアログを表示（QuickPick multiselect）
 */
async function showCustomizeDialog(
    ctx: SetupContext,
    items: SetupItemInfo[]
): Promise<{ approved: boolean; skippedItems: SetupItem[] }> {
    const quickPickItems: vscode.QuickPickItem[] = items.map(item => ({
        label: item.label,
        description: item.description,
        detail: `スキップ時: ${item.skipWarning}`,
        picked: item.picked
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        canPickMany: true,
        placeHolder: '実行する項目を選択してください（選択されていない項目はスキップされます）',
        title: 'グローバル設定のカスタマイズ'
    });

    if (selected === undefined) {
        return { approved: false, skippedItems: [] };
    }

    // 選択されなかった項目をスキップリストに追加
    const selectedLabels = new Set(selected.map(s => s.label));
    const skippedItems: SetupItem[] = items
        .filter(item => !selectedLabels.has(item.label))
        .map(item => item.id);

    return { approved: true, skippedItems };
}

/**
 * パスワード入力が必要かどうか判定
 */
function needsPasswordInput(
    requirements: GlobalRequirements,
    skippedItems: SetupItem[]
): boolean {
    // パスワードレスsudoが既に設定されている場合は不要
    if (!requirements.needsSudoPassword) {
        return false;
    }

    // 以下のいずれかが必要で、スキップされていない場合はパスワードが必要
    const needsPassword =
        (requirements.needsPasswordlessSudo && !skippedItems.includes('passwordlessSudo')) ||
        (requirements.needsPm2Install && !skippedItems.includes('pm2Install')) ||
        (requirements.needsPm2Startup && !skippedItems.includes('pm2Startup'));

    return needsPassword;
}

/**
 * パスワードを1回だけ入力（検証付き、最大3回リトライ）
 */
async function promptPasswordOnce(ctx: SetupContext): Promise<string | undefined> {
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = attempt > 1
            ? `パスワードが正しくありません（${attempt}/${MAX_ATTEMPTS}回目）`
            : CURRENT_ENV === 'windows-native'
                ? 'WSL (Ubuntu) のパスワードを入力してください'
                : 'sudoパスワードを入力してください';

        const password = await vscode.window.showInputBox({
            prompt,
            password: true,
            ignoreFocusOut: true,
            placeHolder: CURRENT_ENV === 'windows-native'
                ? 'Ubuntu 初回起動時に設定したパスワード'
                : undefined
        });

        if (password === undefined) {
            return undefined; // キャンセル
        }

        // パスワード検証
        if (await validatePassword(ctx, password)) {
            return password;
        }
    }

    // 3回失敗
    vscode.window.showErrorMessage(
        'パスワードの認証に失敗しました。\n' +
        '以下のコマンドを手動で実行してください:\n' +
        'sudo npm install -g pm2'
    );
    return undefined;
}

/**
 * パスワードを検証（実際にsudo実行で確認）
 */
async function validatePassword(ctx: SetupContext, password: string): Promise<boolean> {
    try {
        if (CURRENT_ENV === 'windows-native') {
            execSync(
                `wsl bash -c "sudo -S -v"`,
                { encoding: 'utf-8', timeout: 10000, input: password + '\n', stdio: 'pipe' }
            );
        } else {
            execSync(
                `sudo -S -v`,
                { encoding: 'utf-8', timeout: 10000, input: password + '\n', stdio: 'pipe' }
            );
        }
        return true;
    } catch {
        return false;
    }
}

// =============================================================================
// Phase 4: 結果表示
// =============================================================================

/**
 * Phase 4: セットアップ結果を表示
 */
export function showGlobalSetupResult(
    ctx: SetupContext,
    result: SetupResult,
    skippedItems: SetupItem[]
): void {
    if (result.success) {
        let message = '✅ グローバル設定が完了しました';

        // カスタマイズ時のアナウンス
        const announcements = generateSkipAnnouncements(skippedItems);
        if (announcements.length > 0) {
            // 長いメッセージはモーダルで表示
            vscode.window.showWarningMessage(
                message + '\n\n⚠️ 注意事項:\n' + announcements.join('\n'),
                { modal: true },
                'OK'
            );
        } else {
            vscode.window.showInformationMessage(message);
        }
    } else {
        const completedInfo = result.completedSteps.length > 0
            ? `\n\n完了したステップ: ${result.completedSteps.join(', ')}`
            : '';

        vscode.window.showErrorMessage(
            `設定に失敗しました: ${result.error}${completedInfo}`
        );
    }
}

/**
 * スキップ時のアナウンスメッセージを生成
 */
function generateSkipAnnouncements(skippedItems: SetupItem[]): string[] {
    const announcements: string[] = [];

    if (skippedItems.includes('passwordlessSudo')) {
        announcements.push('• パスワードレスsudo: 毎回パスワード入力が必要になります');
    }
    if (skippedItems.includes('pm2Install')) {
        announcements.push('• pm2未インストール: MCPサーバーが起動できません。手動でインストールしてください: npm install -g pm2');
    }
    if (skippedItems.includes('pm2Startup')) {
        announcements.push('• 自動起動未設定: システム起動時に手動でサーバーを起動してください:\n  pm2 start ~/.maid-agent/maid-agent-messenger/ecosystem.config.cjs');
    }

    return announcements;
}

// =============================================================================
// 既存機能（互換性維持）
// =============================================================================

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
 * 結果画面を表示（既存、互換性維持）
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
