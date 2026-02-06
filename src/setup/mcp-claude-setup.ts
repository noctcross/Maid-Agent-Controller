import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SetupContext } from '../types';
import { CURRENT_ENV } from '../utils/environment';
import { windowsToWslPath } from '../utils/environment';

/**
 * .mcp.json を生成
 * maid-agent-messenger サーバーの設定を追加
 */
export async function generateMcpJson(ctx: SetupContext): Promise<void> {
    if (!ctx.workspaceRoot) return;

    const mcpJsonPath = path.join(ctx.workspaceRoot, '.mcp.json');
    const serverName = 'maid-agent-messenger';

    // プロジェクトパスを取得（Windows環境ではWSLパスに変換）
    const projectPath = CURRENT_ENV === 'windows-native'
        ? windowsToWslPath(ctx.workspaceRoot)
        : ctx.workspaceRoot;

    const maidAgentServerConfig = {
        type: "http",
        url: "http://localhost:3100/mcp",
        headers: {
            "X-Maid-Project-Path": projectPath
        }
    };

    // 既存ファイルがある場合
    if (fs.existsSync(mcpJsonPath)) {
        try {
            const existingContent = fs.readFileSync(mcpJsonPath, 'utf-8');
            const existingConfig = JSON.parse(existingContent) as {
                mcpServers?: Record<string, unknown>;
            };

            // mcpServers が存在しない場合は追加
            if (!existingConfig.mcpServers) {
                existingConfig.mcpServers = {};
            }

            // 既に maid-agent-messenger が存在する場合はスキップ
            if (existingConfig.mcpServers[serverName]) {
                ctx.log(`[MCP] ${serverName} は既に設定済みのためスキップ`);
                return;
            }

            // ユーザーに確認
            const choice = await vscode.window.showInformationMessage(
                `.mcp.json に ${serverName} を追加しますか？`,
                '追加する',
                'スキップ'
            );

            if (choice !== '追加する') {
                ctx.log('[MCP] ユーザーがキャンセルしました');
                return;
            }

            // 追記
            existingConfig.mcpServers[serverName] = maidAgentServerConfig;
            fs.writeFileSync(mcpJsonPath, JSON.stringify(existingConfig, null, 2));
            ctx.log(`[MCP] ${serverName} を .mcp.json に追加しました`);

        } catch (error) {
            // JSONパースエラーなど
            ctx.log(`[MCP] .mcp.json の読み込みに失敗: ${error}`);
            vscode.window.showWarningMessage(
                `.mcp.json の読み込みに失敗しました。手動で ${serverName} を追加してください。`
            );
        }
        return;
    }

    // 新規作成
    const mcpConfig = {
        mcpServers: {
            [serverName]: maidAgentServerConfig
        }
    };

    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
    ctx.log(`[MCP] .mcp.json を生成: ${mcpJsonPath}`);
}

/**
 * .claude/settings.json をプロジェクトに生成
 * SessionStart hook設定（コンパクション後のコンテキスト注入）
 */
export async function setupClaudeSettings(ctx: SetupContext): Promise<void> {
    if (!ctx.workspaceRoot) return;

    const claudeDir = path.join(ctx.workspaceRoot, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');

    // SessionStart hook 設定
    const hooksConfig = {
        hooks: {
            SessionStart: [
                {
                    matcher: "startup|compact|resume",
                    hooks: [
                        {
                            type: "command",
                            command: '"$CLAUDE_PROJECT_DIR"/.maid-agent/system/bin/session-start-hook.sh',
                            timeout: 10
                        }
                    ]
                }
            ]
        }
    };

    // .claude ディレクトリがなければ作成
    if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
        ctx.log('[Claude] .claude ディレクトリを作成');
    }

    // 既存ファイルがある場合
    if (fs.existsSync(settingsPath)) {
        try {
            const existingContent = fs.readFileSync(settingsPath, 'utf-8');
            const existingConfig = JSON.parse(existingContent) as {
                hooks?: { SessionStart?: unknown[] };
            };

            // 既に SessionStart hooks が存在する場合はスキップ
            if (existingConfig.hooks?.SessionStart) {
                ctx.log('[Claude] SessionStart hooks は既に設定済みのためスキップ');
                return;
            }

            // ユーザーに確認
            const choice = await vscode.window.showInformationMessage(
                '.claude/settings.json に SessionStart hooks を追加しますか？',
                '追加する',
                'スキップ'
            );

            if (choice !== '追加する') {
                ctx.log('[Claude] ユーザーがキャンセルしました');
                return;
            }

            // hooks を追加（既存設定を維持）
            existingConfig.hooks = {
                ...existingConfig.hooks,
                SessionStart: hooksConfig.hooks.SessionStart
            };
            fs.writeFileSync(settingsPath, JSON.stringify(existingConfig, null, 2));
            ctx.log('[Claude] SessionStart hooks を .claude/settings.json に追加しました');

        } catch (error) {
            ctx.log(`[Claude] .claude/settings.json の読み込みに失敗: ${error}`);
            vscode.window.showWarningMessage(
                '.claude/settings.json の読み込みに失敗しました。手動で hooks を追加してください。'
            );
        }
        return;
    }

    // 新規作成
    fs.writeFileSync(settingsPath, JSON.stringify(hooksConfig, null, 2));
    ctx.log(`[Claude] .claude/settings.json を生成: ${settingsPath}`);
}
