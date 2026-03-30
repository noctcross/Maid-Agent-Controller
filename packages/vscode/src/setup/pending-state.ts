/**
 * VS Code 再起動跨ぎの pending state 管理
 *
 * Reload Window / VS Code再起動後にセットアップを継続するための
 * 状態保存・復元・クリアを担当。
 */
import * as vscode from 'vscode';
import { RuntimeMode } from '../types';

// =============================================================================
// 型定義
// =============================================================================

export interface ExecutionStep {
    id: string;
    progressMessage: string;
    critical: boolean;  // trueなら失敗時に中断
    requiresReboot?: boolean;  // trueなら実行後にPC再起動が必要
    requiresReload?: boolean;  // trueなら実行後にVSCode Reload Windowが必要
    requiresManualStep?: boolean;  // trueなら実行後にユーザーの手動操作が必要
    execute: (ctx: import('../types').SetupContext, password?: string) => Promise<void>;
}

export interface StepResult {
    stepId: string;
    success: boolean;
    error?: string;
}

/**
 * 保留中のセットアップ状態（Reload Window後の継続用）
 */
export interface PendingSetupState {
    runtimeMode: RuntimeMode;
    completedSteps: string[];
    skipItems: string[];
    timestamp: number;
}

const PENDING_SETUP_KEY = 'maidAgent.pendingGlobalSetup';

// =============================================================================
// 状態管理関数
// =============================================================================

/**
 * 保留中のセットアップ状態を保存
 */
export function savePendingSetupState(
    context: vscode.ExtensionContext,
    state: PendingSetupState
): void {
    context.globalState.update(PENDING_SETUP_KEY, state);
}

/**
 * 保留中のセットアップ状態を取得
 */
export function getPendingSetupState(
    context: vscode.ExtensionContext
): PendingSetupState | undefined {
    return context.globalState.get<PendingSetupState>(PENDING_SETUP_KEY);
}

/**
 * 保留中のセットアップ状態をクリア
 */
export function clearPendingSetupState(
    context: vscode.ExtensionContext
): void {
    context.globalState.update(PENDING_SETUP_KEY, undefined);
}
