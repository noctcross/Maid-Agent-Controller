/**
 * グローバルテンプレートコピー・maidctlデプロイ・インストール関数
 *
 * ファイルシステム操作を伴うセットアップステップの実行関数群。
 * テンプレートコピー、設定ファイル移行、maidctlデプロイ、
 * Git/Claude Codeのインストールを担当。
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { SetupContext, RuntimeMode } from '../types';
import { ENV } from '../utils/environment';
import { ENV as ENV_CTX } from '../utils/environment-context';
import { getGlobalMaidAgentPath, getWslMaidAgentPath } from '../utils/helpers';
import { getGlobalConfigPath } from './global-config';

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * RuntimeMode に応じたデプロイ先パスの一覧を返す
 *
 * Windows環境ではモードに応じて WSL パス / Windows パスを切り替え、
 * Mac/Linux では configPath をそのまま返す。
 */
function resolveDeployPaths(runtimeMode: RuntimeMode, configPath: string): string[] {
    if (!ENV.isWindowsNative()) {
        return [configPath];
    }
    const paths: string[] = [];
    if (runtimeMode === 'wsl' || runtimeMode === 'both') {
        paths.push(getWslMaidAgentPath());
    }
    if (runtimeMode === 'windows-native' || runtimeMode === 'both') {
        paths.push(getGlobalMaidAgentPath());
    }
    return paths;
}

// =============================================================================
// 設定ファイル移行
// =============================================================================

/**
 * 設定ファイルの移行
 * mcp-server.yaml → maid-agent-messenger.yaml
 */
export function migrateConfigFile(globalPath: string, ctx: SetupContext): void {
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

// =============================================================================
// テンプレートコピー
// =============================================================================

/**
 * グローバルテンプレートをコピー
 * @param ctx SetupContext
 * @param runtimeMode ランタイムモード（Windows環境でのコピー先決定に使用）
 */
export async function copyGlobalTemplates(ctx: SetupContext, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    // 設定用パス（常にWindows側 or ローカル）
    const configPath = getGlobalMaidAgentPath();

    // 実行用パス（モードに応じて決定）
    const executionPaths = resolveDeployPaths(runtimeMode, configPath);

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
    if (ENV.isWindowsNative() && runtimeMode !== 'windows-native') {
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

// =============================================================================
// maidctlデプロイ
// =============================================================================

/**
 * maidctlをグローバルbinにデプロイ
 * @param ctx SetupContext
 * @param runtimeMode ランタイムモード（デプロイ先決定に使用）
 */
export async function deployMaidctl(ctx: SetupContext, runtimeMode: RuntimeMode = 'wsl'): Promise<void> {
    const maidctlSrc = path.join(ctx.extensionPath, 'global-templates', 'bin', 'maidctl');

    if (!fs.existsSync(maidctlSrc)) {
        ctx.log('[Global] maidctlソースが見つかりません');
        return;
    }

    // デプロイ先パスを決定
    const basePaths = resolveDeployPaths(runtimeMode, getGlobalMaidAgentPath());
    const deployPaths = basePaths.map(p => path.join(p, 'bin'));

    // Windows用 .cmd ラッパーのソースパス
    const maidctlCmdSrc = path.join(ctx.extensionPath, 'global-templates', 'bin', 'maidctl.cmd');

    for (const binPath of deployPaths) {
        if (!fs.existsSync(binPath)) {
            fs.mkdirSync(binPath, { recursive: true });
        }

        const maidctlDest = path.join(binPath, 'maidctl');
        fs.copyFileSync(maidctlSrc, maidctlDest);
        // 実行権限を付与
        fs.chmodSync(maidctlDest, 0o755);
        ctx.log(`[Global] maidctlデプロイ完了: ${binPath}`);

        // Windows環境: .cmd ラッパーもコピー（PowerShell/cmd.exeから実行可能にする）
        if (ENV.isWindowsNative() && fs.existsSync(maidctlCmdSrc)) {
            const maidctlCmdDest = path.join(binPath, 'maidctl.cmd');
            fs.copyFileSync(maidctlCmdSrc, maidctlCmdDest);
            ctx.log(`[Global] maidctl.cmdデプロイ完了: ${binPath}`);
        }
    }
}

// =============================================================================
// インストール関数
// =============================================================================

/**
 * Git for Windows をインストール（winget経由）
 */
export async function installGitForWindows(ctx: SetupContext): Promise<void> {
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
export async function installClaudeCodeWindows(ctx: SetupContext): Promise<void> {
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
export async function installClaudeCodeUnix(ctx: SetupContext): Promise<void> {
    ctx.log('[Global] Claude Code をインストール中（Unix/WSL）...');

    try {
        ENV_CTX.commandExecutor.execInLoginShell(
            'curl -fsSL https://claude.ai/install.sh | bash',
            { timeout: 300000 },
        );
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
