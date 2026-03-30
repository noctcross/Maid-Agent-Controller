/**
 * 実行ステップの構築
 *
 * セットアップの実行ステップ（ExecutionStep[]）を
 * GlobalRequirements に基づいて動的に構築する。
 */
import { GlobalRequirements } from './requirements-analyzer';
import { ExecutionStep } from './pending-state';
import { installWsl, installUbuntu } from './wsl-setup';
import { getStrategy, isPsmuxStrategy, isUnixStrategy } from './strategies';
import { copyGlobalTemplates, deployMaidctl, installGitForWindows, installClaudeCodeWindows, installClaudeCodeUnix } from './global-deploy';

// =============================================================================
// 実行ステップの定義
// =============================================================================

/**
 * 実行ステップを構築
 */
export function buildExecutionSteps(
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
