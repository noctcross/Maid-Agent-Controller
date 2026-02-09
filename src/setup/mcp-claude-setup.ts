import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SetupContext } from '../types';
import { CURRENT_ENV, windowsToWslPath } from '../utils/environment';
import { DASHBOARD_SERVER_URL } from '../constants';

/**
 * .mcp.json を生成
 * maid-agent-messenger サーバーの設定を追加
 */
export async function generateMcpJson(ctx: SetupContext): Promise<void> {
    if (!ctx.workspaceRoot) return;

    const mcpJsonPath = path.join(ctx.workspaceRoot, '.mcp.json');
    const serverName = 'maid-agent-messenger';

    // 注: ヘッダーに ${CLAUDE_PROJECT_DIR} を使用するため、
    // パス変換はClaude Code側で自動的に行われる。
    // ただし、既存ファイルチェック等で ctx.workspaceRoot は引き続き使用。

    const maidAgentServerConfig = {
        type: "http",
        url: `${DASHBOARD_SERVER_URL}/mcp`,
        headers: {
            "X-Maid-Project-Path": "${CLAUDE_PROJECT_DIR}"
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

            // 既に maid-agent-messenger が存在する場合
            if (existingConfig.mcpServers[serverName]) {
                const existingHeaders = (existingConfig.mcpServers[serverName] as Record<string, unknown>)?.headers as Record<string, string> | undefined;
                const currentPath = existingHeaders?.["X-Maid-Project-Path"];

                // ${CLAUDE_PROJECT_DIR} を使用していない場合は更新を提案
                if (currentPath && !currentPath.includes("${CLAUDE_PROJECT_DIR}")) {
                    const choice = await vscode.window.showInformationMessage(
                        `.mcp.json の X-Maid-Project-Path を動的パス(\${CLAUDE_PROJECT_DIR})に更新しますか？`,
                        '更新する',
                        'スキップ'
                    );

                    if (choice === '更新する') {
                        existingHeaders!["X-Maid-Project-Path"] = "${CLAUDE_PROJECT_DIR}";
                        fs.writeFileSync(mcpJsonPath, JSON.stringify(existingConfig, null, 2));
                        ctx.log('[MCP] X-Maid-Project-Path を ${CLAUDE_PROJECT_DIR} に更新しました');
                    }
                    return;
                }

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

/**
 * .mcp.json のパスが現在のワークスペースと一致するか検証し、
 * ハードコードパスから ${CLAUDE_PROJECT_DIR} への移行を提案する。
 * パス不一致の場合は更新も提案する。
 */
export async function checkAndUpdateMcpJsonPath(ctx: SetupContext): Promise<void> {
    if (!ctx.workspaceRoot) return;

    const mcpJsonPath = path.join(ctx.workspaceRoot, '.mcp.json');
    if (!fs.existsSync(mcpJsonPath)) return;

    try {
        const content = fs.readFileSync(mcpJsonPath, 'utf-8');
        const config = JSON.parse(content) as {
            mcpServers?: Record<string, { headers?: Record<string, string> }>;
        };

        const serverConfig = config.mcpServers?.['maid-agent-messenger'];
        if (!serverConfig?.headers) return;

        const currentPath = serverConfig.headers['X-Maid-Project-Path'];
        if (!currentPath) return;

        // 既に ${CLAUDE_PROJECT_DIR} を使用していれば何もしない
        if (currentPath.includes('${CLAUDE_PROJECT_DIR}')) return;

        // パスが一致する場合は ${CLAUDE_PROJECT_DIR} への移行を提案
        const expectedPath = CURRENT_ENV === 'windows-native'
            ? windowsToWslPath(ctx.workspaceRoot)
            : ctx.workspaceRoot;

        if (currentPath === expectedPath) {
            // パスは現在のワークスペースと一致するが、動的パスへの移行を提案
            const choice = await vscode.window.showInformationMessage(
                `.mcp.json の X-Maid-Project-Path を動的パス(\${CLAUDE_PROJECT_DIR})に更新しますか？\n現在のハードコードパスでも動作しますが、動的パスへの移行を推奨します。`,
                '${CLAUDE_PROJECT_DIR} に更新',
                'スキップ'
            );

            if (choice === '${CLAUDE_PROJECT_DIR} に更新') {
                serverConfig.headers['X-Maid-Project-Path'] = '${CLAUDE_PROJECT_DIR}';
                fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2));
                ctx.log('[MCP] ${CLAUDE_PROJECT_DIR} に更新しました');
            }
            return;
        }

        // パス不一致: 更新を提案
        const choice = await vscode.window.showWarningMessage(
            `.mcp.json のプロジェクトパスが古い可能性があります。` +
            `\n現在: ${currentPath}\n期待: ${expectedPath}`,
            '${CLAUDE_PROJECT_DIR} に更新',
            '現在のパスに更新',
            'スキップ'
        );

        if (choice === '${CLAUDE_PROJECT_DIR} に更新') {
            serverConfig.headers['X-Maid-Project-Path'] = '${CLAUDE_PROJECT_DIR}';
            fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2));
            ctx.log('[MCP] ${CLAUDE_PROJECT_DIR} に更新しました');
        } else if (choice === '現在のパスに更新') {
            serverConfig.headers['X-Maid-Project-Path'] = expectedPath;
            fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2));
            ctx.log(`[MCP] パスを ${expectedPath} に更新しました`);
        }
    } catch (error) {
        ctx.log(`[MCP] .mcp.json の検証に失敗: ${error}`);
    }
}
