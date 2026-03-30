/**
 * グローバル設定モジュール（4フェーズ構造）
 *
 * フェーズ0: モード選択（Windows環境のみ）
 * フェーズ1: 事前調査（自動）
 * フェーズ2: 入力一括取得（ユーザー操作1回）
 * フェーズ3: 自動実行（進捗表示のみ）
 * フェーズ4: 結果表示
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as YAML from 'yaml';
import { SetupContext, RuntimeMode } from '../types';
import { CURRENT_ENV } from '../utils/environment';
import {
    analyzeRequirements,
    GlobalRequirements,
    isAllConfigured,
    countRequiredSteps,
    checkWslOperational,
} from './requirements-analyzer';
import {
    showGlobalConfirmation,
    showGlobalSetupResult,
    showRuntimeModeSelection,
    GlobalUserInput,
} from './setup-ui';
import { getGlobalMaidAgentPath, getExecutionMaidAgentPath, getWslMaidAgentPath } from '../utils/helpers';
import { installWsl, installUbuntu } from './wsl-setup';
import { getStrategy, isPsmuxStrategy, isUnixStrategy } from './strategies';

// =============================================================================
// 型定義
// =============================================================================

interface StepResult {
    stepId: string;
    success: boolean;
    error?: string;
}

/**
 * グローバル設定ファイルの構造
 */
interface GlobalConfig {
    server?: {
        port?: number;
        host?: string;
    };
    /** @deprecated Use environments instead */
    runtime?: {
        mode?: RuntimeMode;
    };
    /** 各環境のセットアップ状態 */
    environments?: {
        wsl?: { status: 'none' | 'target' | 'ready' };
        windows?: { status: 'none' | 'target' | 'ready' };
    };
    dashboard?: {
        editor?: string;
    };
    keepalive?: {
        http_keepalive_timeout?: number;
        http_headers_timeout?: number;
        ping_interval?: number;
    };
}

// =============================================================================
// 設定ファイルの読み書き
// =============================================================================

/**
 * グローバル設定ファイルのパスを取得
 */
function getGlobalConfigPath(): string {
    const globalPath = getGlobalMaidAgentPath();
    return path.join(globalPath, 'system', 'config', 'maid-agent-messenger.yaml');
}

/**
 * グローバル設定を読み込む
 */
function loadGlobalConfig(): GlobalConfig {
    const configPath = getGlobalConfigPath();
    console.log(`[Global] loadGlobalConfig: path=${configPath}`);
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            console.log(`[Global] loadGlobalConfig: content=${content}`);
            return YAML.parse(content) as GlobalConfig || {};
        } else {
            console.log(`[Global] loadGlobalConfig: file does not exist`);
        }
    } catch (error) {
        console.error('[Global] 設定ファイル読み込みエラー:', error);
    }
    return {};
}

/**
 * グローバル設定を保存
 */
function saveGlobalConfig(config: GlobalConfig): void {
    const configPath = getGlobalConfigPath();
    const configDir = path.dirname(configPath);

    console.log(`[Global] saveGlobalConfig: path=${configPath}`);
    console.log(`[Global] saveGlobalConfig: content=${JSON.stringify(config)}`);

    // ディレクトリがなければ作成
    if (!fs.existsSync(configDir)) {
        console.log(`[Global] Creating directory: ${configDir}`);
        fs.mkdirSync(configDir, { recursive: true });
    }

    const content = YAML.stringify(config);
    fs.writeFileSync(configPath, content, 'utf-8');
    console.log(`[Global] Config saved successfully`);
}

/**
 * ランタイムモードを設定ファイルに保存
 */
export function saveRuntimeMode(mode: RuntimeMode, ctx: SetupContext): void {
    const config = loadGlobalConfig();
    if (!config.runtime) {
        config.runtime = {};
    }
    config.runtime.mode = mode;
    saveGlobalConfig(config);
    ctx.log(`[Global] ランタイムモード保存: ${mode}`);
}

/**
 * 保存されているランタイムモードを取得
 * @deprecated Use getEnvironmentStatus instead
 */
export function getSavedRuntimeMode(): RuntimeMode | undefined {
    const config = loadGlobalConfig();
    return config.runtime?.mode;
}

// =============================================================================
// 環境状態管理（新方式）
// =============================================================================

export type EnvironmentType = 'wsl' | 'windows';
export type EnvironmentStatus = 'none' | 'target' | 'ready';

/**
 * 環境のセットアップ状態を取得
 */
export function getEnvironmentStatus(env: EnvironmentType): EnvironmentStatus {
    const configPath = getGlobalConfigPath();
    const config = loadGlobalConfig();

    console.log(`[Global] getEnvironmentStatus: env=${env}, configPath=${configPath}`);
    console.log(`[Global] config.environments=${JSON.stringify(config.environments)}`);
    console.log(`[Global] config.runtime=${JSON.stringify(config.runtime)}`);

    // 新方式の environments があればそれを使う
    if (config.environments?.[env]?.status) {
        console.log(`[Global] Using new environments style: ${config.environments[env]!.status}`);
        return config.environments[env]!.status;
    }

    // 旧方式 runtime.mode からマイグレーション
    if (config.runtime?.mode) {
        const mode = config.runtime.mode;
        let status: EnvironmentStatus;
        if (env === 'wsl') {
            status = (mode === 'wsl' || mode === 'both') ? 'ready' : 'none';
        } else {
            status = (mode === 'windows-native' || mode === 'both') ? 'ready' : 'none';
        }
        console.log(`[Global] Migrating from runtime.mode=${mode}: ${env}=${status}`);
        return status;
    }

    console.log(`[Global] No config found, returning 'none'`);
    return 'none';
}

/**
 * 環境のセットアップ状態を設定
 */
export function setEnvironmentStatus(
    env: EnvironmentType,
    status: EnvironmentStatus,
    ctx?: SetupContext
): void {
    const config = loadGlobalConfig();

    if (!config.environments) {
        config.environments = {};
    }
    if (!config.environments[env]) {
        config.environments[env] = { status: 'none' };
    }
    config.environments[env]!.status = status;

    saveGlobalConfig(config);
    ctx?.log(`[Global] 環境状態更新: ${env} = ${status}`);
}

/**
 * ready 状態の環境一覧を取得
 */
export function getReadyEnvironments(): EnvironmentType[] {
    const result: EnvironmentType[] = [];
    if (getEnvironmentStatus('wsl') === 'ready') result.push('wsl');
    if (getEnvironmentStatus('windows') === 'ready') result.push('windows');
    return result;
}

/**
 * 指定した環境が使用可能かチェック
 */
export function isEnvironmentReady(env: EnvironmentType): boolean {
    return getEnvironmentStatus(env) === 'ready';
}

interface ExecutionStep {
    id: string;
    progressMessage: string;
    critical: boolean;  // trueなら失敗時に中断
    requiresReboot?: boolean;  // trueなら実行後にPC再起動が必要
    requiresReload?: boolean;  // trueなら実行後にVSCode Reload Windowが必要
    requiresManualStep?: boolean;  // trueなら実行後にユーザーの手動操作が必要
    execute: (ctx: SetupContext, password?: string) => Promise<void>;
}

/**
 * 保留中のセットアップ状態（Reload Window後の継続用）
 */
interface PendingSetupState {
    runtimeMode: RuntimeMode;
    completedSteps: string[];
    skipItems: string[];
    timestamp: number;
}

const PENDING_SETUP_KEY = 'maidAgent.pendingGlobalSetup';

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

// =============================================================================
// 実行ステップの定義
// =============================================================================

/**
 * 実行ステップを構築
 */
function buildExecutionSteps(
    requirements: GlobalRequirements,
    skipItems: string[]
): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    const strategy = getStrategy(requirements.runtimeMode);
    const isPsmux = isPsmuxStrategy(strategy);
    const isUnix = isUnixStrategy(strategy);

    // WSL2インストール（必須・最優先・再起動必要）
    if (requirements.needs.wslInstall && !skipItems.includes('wslInstall')) {
        steps.push({
            id: 'wslInstall',
            progressMessage: 'WSL2 をインストール中...',
            critical: true,
            requiresReboot: true,
            execute: async (ctx) => {
                await installWsl(ctx);
            },
        });
    }

    // Ubuntuインストール（手動で初期設定が必要）
    if (requirements.needs.ubuntuInstall && !skipItems.includes('ubuntuInstall')) {
        steps.push({
            id: 'ubuntuInstall',
            progressMessage: 'Ubuntu をインストール中...',
            critical: true,
            requiresManualStep: true,
            execute: async (ctx) => {
                await installUbuntu(ctx);
            },
        });
    }

    // グローバルテンプレートのコピー（常に実行）
    // WSL/Ubuntuインストールが含まれる場合はスキップ（再起動後に実行）
    if (!requirements.needs.wslInstall && !requirements.needs.ubuntuInstall) {
        const templateRuntimeMode = requirements.runtimeMode;
        steps.push({
            id: 'copyGlobalTemplates',
            progressMessage: 'テンプレートをコピー中...',
            critical: true,
            execute: async (ctx) => {
                await copyGlobalTemplates(ctx, templateRuntimeMode);
            },
        });
    }

    // パスワードレスsudo設定（Unix専用）
    if (isUnix && requirements.needs.passwordlessSudo && !skipItems.includes('passwordlessSudo')) {
        steps.push({
            id: 'passwordlessSudo',
            progressMessage: 'パスワードレスsudoを設定中...',
            critical: false,
            execute: async (ctx, password) => {
                await strategy.setupPasswordlessSudo(ctx, password);
            },
        });
    }

    // jqインストール
    if (requirements.needs.jqInstall && !skipItems.includes('jqInstall')) {
        steps.push({
            id: 'jqInstall',
            progressMessage: isPsmux ? 'jq をwinget経由でインストール中...' : 'jq をインストール中...',
            critical: false,
            execute: async (ctx, password) => {
                await strategy.installJq(ctx, password);
            },
        });
    }

    // yqインストール
    if (requirements.needs.yqInstall && !skipItems.includes('yqInstall')) {
        steps.push({
            id: 'yqInstall',
            progressMessage: isPsmux ? 'yq をwinget経由でインストール中...' : 'yq をインストール中...',
            critical: false,
            execute: async (ctx, password) => {
                await strategy.installYq(ctx, password);
            },
        });
    }

    // psmuxインストール（Psmux専用）
    if (isPsmux && requirements.needs.psmuxInstall && !skipItems.includes('psmuxInstall')) {
        steps.push({
            id: 'psmuxInstall',
            progressMessage: 'psmux をwinget経由でインストール中...',
            critical: true,
            execute: async (ctx) => {
                await strategy.installPsmux(ctx);
            },
        });
    }

    // Node.jsインストール（Psmux専用）
    if (isPsmux && requirements.needs.nodeInstall && !skipItems.includes('nodeInstall')) {
        steps.push({
            id: 'nodeInstall',
            progressMessage: 'Node.js をwinget経由でインストール中...',
            critical: true,
            requiresReload: true,  // PATH反映のためReload Windowが必要
            execute: async (ctx) => {
                await strategy.installNodeJs(ctx);
            },
        });
    }

    // Git for Windowsインストール（Psmux専用・Claude Codeの前提条件）
    if (isPsmux && requirements.needs.gitInstall && !skipItems.includes('gitInstall')) {
        steps.push({
            id: 'gitInstall',
            progressMessage: 'Git for Windows をwinget経由でインストール中...',
            critical: true,
            requiresReload: true,  // PATH反映のためReload Windowが必要
            execute: async (ctx) => {
                await installGitForWindows(ctx);
            },
        });
    }

    // Claude Codeインストール
    if (requirements.needs.claudeCodeInstall && !skipItems.includes('claudeCodeInstall')) {
        steps.push({
            id: 'claudeCodeInstall',
            progressMessage: isPsmux ? 'Claude Code をインストール中...' : 'Claude Code をインストール中...',
            critical: true,
            execute: async (ctx) => {
                if (isPsmux) {
                    await installClaudeCodeWindows(ctx);
                } else {
                    await installClaudeCodeUnix(ctx);
                }
            },
        });
    }

    // pm2インストール
    if (requirements.needs.pm2Install && !skipItems.includes('pm2Install')) {
        steps.push({
            id: 'pm2Install',
            progressMessage: isPsmux ? 'pm2 をnpm経由でインストール中...' : 'pm2 をインストール中...',
            critical: true,
            execute: async (ctx, password) => {
                await strategy.installPm2(ctx, password);
            },
        });
    }

    // サーバーセットアップ（npm install, pm2 start）
    steps.push({
        id: 'messengerServerSetup',
        progressMessage: 'サーバーをセットアップ中...',
        critical: true,
        execute: async (ctx) => {
            await strategy.setupMessengerServer(ctx);
        },
    });

    // maidctlデプロイ
    const deployRuntimeMode = requirements.runtimeMode;
    steps.push({
        id: 'deployMaidctl',
        progressMessage: 'maidctl をデプロイ中...',
        critical: false,
        execute: async (ctx) => {
            await deployMaidctl(ctx, deployRuntimeMode);
        },
    });

    // PATH設定
    if (requirements.needs.pathSetup && !skipItems.includes('pathSetup')) {
        steps.push({
            id: 'pathSetup',
            progressMessage: isPsmux ? 'PATH をPowerShellプロファイルに設定中...' : 'PATH を設定中...',
            critical: false,
            execute: async (ctx) => {
                await strategy.setupPath(ctx);
            },
        });
    }

    return steps;
}

// =============================================================================
// 各ステップの実行関数
// =============================================================================

/**
 * 設定ファイルの移行
 * mcp-server.yaml → maid-agent-messenger.yaml
 */
function migrateConfigFile(globalPath: string, ctx: SetupContext): void {
    const configDir = path.join(globalPath, 'system', 'config');
    const oldPath = path.join(configDir, 'mcp-server.yaml');
    const newPath = path.join(configDir, 'maid-agent-messenger.yaml');

    // 旧ファイルが存在し、新ファイルが存在しない場合のみ移行
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        try {
            const oldContent = fs.readFileSync(oldPath, 'utf-8');

            // YAML をパース（簡易的にキー・値を抽出）
            const portMatch = oldContent.match(/^\s*port:\s*(\d+)/m);
            const httpKeepaliveMatch = oldContent.match(/^\s*http_keepalive_timeout:\s*(\d+)/m);
            const httpHeadersMatch = oldContent.match(/^\s*http_headers_timeout:\s*(\d+)/m);
            const pingIntervalMatch = oldContent.match(/^\s*ping_interval:\s*(\d+)/m);

            // 新しい形式で設定ファイルを生成
            const newContent = `# Maid Agent Messenger グローバル設定ファイル
# ~/.maid-agent/system/config/maid-agent-messenger.yaml
#
# mcp-server.yaml から自動移行されました

server:
  port: ${portMatch ? portMatch[1] : '3100'}
  host: 127.0.0.1

dashboard:
  # エディタのURIスキーム: vscode | windsurf | cursor
  editor: vscode

keepalive:
  # HTTP Keep-Alive タイムアウト（プロキシの60秒より長く設定）
  http_keepalive_timeout: ${httpKeepaliveMatch ? httpKeepaliveMatch[1] : '65000'}  # 65秒
  http_headers_timeout: ${httpHeadersMatch ? httpHeadersMatch[1] : '66000'}    # 66秒

  # サーバー→クライアント Ping間隔（ミリ秒）
  ping_interval: ${pingIntervalMatch ? pingIntervalMatch[1] : '30000'}  # 30秒間隔
`;

            // 新ファイルを作成
            fs.writeFileSync(newPath, newContent, 'utf-8');
            ctx.log(`[Migration] 設定ファイル移行: ${oldPath} → ${newPath}`);

            // 旧ファイルを .bak にリネーム
            const backupPath = oldPath + '.bak';
            fs.renameSync(oldPath, backupPath);
            ctx.log(`[Migration] 旧ファイルバックアップ: ${backupPath}`);
        } catch (error) {
            ctx.log(`[Migration] 設定ファイル移行失敗: ${error}`);
            // 移行失敗してもコピー処理は続行（新ファイルがテンプレートからコピーされる）
        }
    }
}

/**
 * グローバルテンプレートをコピー
 * @param ctx SetupContext
 * @param runtimeMode ランタイムモード（Windows環境でのコピー先決定に使用）
 */
async function copyGlobalTemplates(ctx: SetupContext, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    // 設定用パス（常にWindows側 or ローカル）
    const configPath = getGlobalMaidAgentPath();

    // 実行用パス（モードに応じて決定）
    const executionPaths: string[] = [];

    if (CURRENT_ENV === 'windows-native') {
        if (runtimeMode === 'wsl' || runtimeMode === 'both') {
            executionPaths.push(getWslMaidAgentPath());
        }
        if (runtimeMode === 'windows-native' || runtimeMode === 'both') {
            executionPaths.push(getGlobalMaidAgentPath()); // Windowsパス
        }
    } else {
        // Mac/Linux: 設定と実行は同じパス
        executionPaths.push(configPath);
    }

    // 設定用ディレクトリ作成（常に作成）
    const configDirs = [
        configPath,
        path.join(configPath, 'system', 'config'),
    ];

    for (const dir of configDirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            ctx.log(`[Global] 設定ディレクトリ作成: ${dir}`);
        }
    }

    // 設定ファイルの移行
    migrateConfigFile(configPath, ctx);

    // 実行用ディレクトリとファイルをコピー
    const templatesPath = path.join(ctx.extensionPath, 'global-templates');

    for (const execPath of executionPaths) {
        ctx.log(`[Global] テンプレートコピー先: ${execPath}`);

        // 実行用ディレクトリ作成
        const execDirs = [
            execPath,
            path.join(execPath, 'bin'),
            path.join(execPath, 'maid-agent-messenger'),
        ];

        for (const dir of execDirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                ctx.log(`[Global] 実行ディレクトリ作成: ${dir}`);
            }
        }

        // テンプレートをコピー（設定ファイルは保持）
        // maid-agent-messenger.yaml は runtime/environments 設定を含むため上書き禁止
        const preserveFiles = ['maid-agent-messenger.yaml'];
        if (fs.existsSync(templatesPath)) {
            copyDirRecursive(templatesPath, execPath, ctx, preserveFiles);
        }
    }

    // 設定ファイルのみ設定パスにコピー（実行パスと異なる場合）
    if (CURRENT_ENV === 'windows-native' && runtimeMode !== 'windows-native') {
        const systemConfigSrc = path.join(templatesPath, 'system', 'config');
        const systemConfigDest = path.join(configPath, 'system', 'config');
        const preserveFiles = ['maid-agent-messenger.yaml'];
        if (fs.existsSync(systemConfigSrc)) {
            copyDirRecursive(systemConfigSrc, systemConfigDest, ctx, preserveFiles);
        }
    }

    ctx.log('[Global] テンプレートコピー完了');
}

/**
 * ディレクトリを再帰的にコピー
 * @param preserveFiles 保持するファイル名のリスト（存在する場合は上書きしない）
 */
function copyDirRecursive(
    src: string,
    dest: string,
    ctx: SetupContext,
    preserveFiles: string[] = []
): void {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, ctx, preserveFiles);
        } else {
            // 保持対象ファイルかつ既に存在する場合はスキップ
            if (preserveFiles.includes(entry.name) && fs.existsSync(destPath)) {
                ctx.log(`[Global] 既存ファイルを保持: ${destPath}`);
                continue;
            }
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * maidctlをグローバルbinにデプロイ
 * @param ctx SetupContext
 * @param runtimeMode ランタイムモード（デプロイ先決定に使用）
 */
async function deployMaidctl(ctx: SetupContext, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    const maidctlSrc = path.join(ctx.extensionPath, 'global-templates', 'bin', 'maidctl');

    if (!fs.existsSync(maidctlSrc)) {
        ctx.log('[Global] maidctlソースが見つかりません');
        return;
    }

    // デプロイ先パスを決定
    const deployPaths: string[] = [];

    if (CURRENT_ENV === 'windows-native') {
        if (runtimeMode === 'wsl' || runtimeMode === 'both') {
            deployPaths.push(path.join(getWslMaidAgentPath(), 'bin'));
        }
        if (runtimeMode === 'windows-native' || runtimeMode === 'both') {
            deployPaths.push(path.join(getGlobalMaidAgentPath(), 'bin'));
        }
    } else {
        // Mac/Linux: ローカルパス
        deployPaths.push(path.join(getGlobalMaidAgentPath(), 'bin'));
    }

    for (const binPath of deployPaths) {
        if (!fs.existsSync(binPath)) {
            fs.mkdirSync(binPath, { recursive: true });
        }

        const maidctlDest = path.join(binPath, 'maidctl');
        fs.copyFileSync(maidctlSrc, maidctlDest);
        // 実行権限を付与
        fs.chmodSync(maidctlDest, 0o755);
        ctx.log(`[Global] maidctlデプロイ完了: ${binPath}`);
    }
}

/**
 * Git for Windows をインストール（winget経由）
 */
async function installGitForWindows(ctx: SetupContext): Promise<void> {
    ctx.log('[Global] Git for Windows をインストール中...');

    try {
        // winget で Git.Git をインストール
        execSync('winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements', {
            encoding: 'utf-8',
            timeout: 300000,  // 5分タイムアウト
            windowsHide: true,
        });
        ctx.log('[Global] Git for Windows インストール完了');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.log(`[Global] Git for Windows インストールエラー: ${errorMsg}`);

        // 手動インストールを案内
        const choice = await vscode.window.showWarningMessage(
            'Git for Windows の自動インストールに失敗しました。\n手動でインストールしますか？',
            'ダウンロードページを開く',
            'スキップ'
        );

        if (choice === 'ダウンロードページを開く') {
            vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/downloads/win'));
        }

        throw new Error('Git for Windows のインストールに失敗しました');
    }
}

/**
 * Claude Code をインストール（Windows - PowerShellスクリプト経由）
 */
async function installClaudeCodeWindows(ctx: SetupContext): Promise<void> {
    ctx.log('[Global] Claude Code をインストール中（Windows）...');

    try {
        // PowerShell でネイティブインストーラを実行
        execSync('powershell -Command "irm https://claude.ai/install.ps1 | iex"', {
            encoding: 'utf-8',
            timeout: 300000,  // 5分タイムアウト
            windowsHide: true,
        });
        ctx.log('[Global] Claude Code インストール完了（Windows）');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.log(`[Global] Claude Code インストールエラー: ${errorMsg}`);

        // 手動インストールを案内
        const choice = await vscode.window.showWarningMessage(
            'Claude Code の自動インストールに失敗しました。\n手動でインストールしますか？',
            'インストールコマンドをコピー',
            'スキップ'
        );

        if (choice === 'インストールコマンドをコピー') {
            await vscode.env.clipboard.writeText('irm https://claude.ai/install.ps1 | iex');
            vscode.window.showInformationMessage('PowerShell で実行するコマンドをクリップボードにコピーしました');
        }

        throw new Error('Claude Code のインストールに失敗しました');
    }
}

/**
 * Claude Code をインストール（WSL/Unix - curlスクリプト経由）
 */
async function installClaudeCodeUnix(ctx: SetupContext): Promise<void> {
    ctx.log('[Global] Claude Code をインストール中（Unix/WSL）...');

    try {
        if (CURRENT_ENV === 'windows-native') {
            // WSL経由でインストール
            execSync('wsl bash -lc "curl -fsSL https://claude.ai/install.sh | bash"', {
                encoding: 'utf-8',
                timeout: 300000,  // 5分タイムアウト
            });
        } else {
            // 直接インストール
            execSync('curl -fsSL https://claude.ai/install.sh | bash', {
                encoding: 'utf-8',
                timeout: 300000,
                shell: '/bin/bash',
            });
        }
        ctx.log('[Global] Claude Code インストール完了（Unix/WSL）');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.log(`[Global] Claude Code インストールエラー: ${errorMsg}`);

        // 手動インストールを案内
        const choice = await vscode.window.showWarningMessage(
            'Claude Code の自動インストールに失敗しました。\n手動でインストールしますか？',
            'インストールコマンドをコピー',
            'スキップ'
        );

        if (choice === 'インストールコマンドをコピー') {
            await vscode.env.clipboard.writeText('curl -fsSL https://claude.ai/install.sh | bash');
            vscode.window.showInformationMessage('ターミナルで実行するコマンドをクリップボードにコピーしました');
        }

        throw new Error('Claude Code のインストールに失敗しました');
    }
}

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

    if (CURRENT_ENV === 'windows-native') {
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
