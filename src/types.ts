import * as vscode from 'vscode';

// =============================================================================
// 型定義
// =============================================================================

/**
 * 実行環境の種類
 */
export type ExecutionEnvironment = 'wsl' | 'windows-native' | 'linux' | 'macos';

export interface Agent {
    name: string;
    id: string;
    terminal?: vscode.Terminal;  // VSCodeターミナル（tmuxビューア用、オプショナル）
    tmuxWindow: string;          // tmuxウィンドウ名
    role: 'butler' | 'chiefMaid' | 'maid';
    status: 'offline' | 'idle' | 'working' | 'done';
}

export interface MaidConfig {
    name: string;
    id: string;
    emoji: string;
}

/**
 * ルールモジュールのメタデータ
 */
export interface RuleModuleMeta {
    name: string;
    description: string;
    auto_select: boolean;
    target_roles: ('common' | 'butler' | 'chief' | 'maid')[];
    filePath: string;
}

/**
 * スキルのメタデータ
 */
export interface SkillMeta {
    name: string;
    description: string;
    auto_select: boolean;
    filePath: string;
}

/**
 * Setup系関数で使用する共通コンテキスト
 * MultiAgentControllerのインスタンスデータをスタンドアロン関数に渡すためのインターフェース
 */
export interface SetupContext {
    workspaceRoot: string;
    maidAgentPath: string;
    globalMaidAgentPath: string;
    extensionPath: string;
    outputChannel: vscode.OutputChannel;
    log: (message: string) => void;
}
