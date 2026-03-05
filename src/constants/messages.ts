/**
 * UIメッセージ定数
 */
import { SetupStep } from '../setup/setup-ui';

export const SETUP_MESSAGES = {
    INIT_GLOBAL: {
        TITLE: '🎩 Maid Agent グローバル設定',
        DESCRIPTION: 'グローバル環境をセットアップします',
    },
    INIT_WORKSPACE: {
        TITLE: '🎩 Maid Agent ワークスペース設定',
        DESCRIPTION: 'プロジェクトにMaid Agentをセットアップします',
    },
};

export const SETUP_STEPS: Record<string, SetupStep> = {
    COPY_GLOBAL: {
        id: 'copy',
        label: 'グローバル設定をコピー',
        progressMessage: 'グローバル設定をコピー中...',
        estimatedSeconds: 5
    },
    INSTALL_JQ: {
        id: 'jq',
        label: 'jqをインストール',
        progressMessage: 'jq (JSONパーサー) をインストール中...',
        estimatedSeconds: 30
    },
    INSTALL_PM2: {
        id: 'pm2',
        label: 'pm2をインストール',
        progressMessage: 'pm2をインストール中...',
        estimatedSeconds: 30
    },
    INSTALL_DEPS: {
        id: 'deps',
        label: '依存関係をインストール',
        progressMessage: '依存関係をインストール中...',
        estimatedSeconds: 60
    },
    START_MCP: {
        id: 'mcp',
        label: 'MCPサーバーを起動',
        progressMessage: 'MCPサーバーを起動中...',
        estimatedSeconds: 10
    },
    SETUP_STARTUP: {
        id: 'startup',
        label: '自動起動を設定',
        progressMessage: '自動起動を設定中...',
        estimatedSeconds: 5
    },
    DEPLOY_MAIDCTL: {
        id: 'maidctl',
        label: 'maidctl CLIを配置',
        progressMessage: 'maidctl CLIを配置中...',
        estimatedSeconds: 5
    },
    SETUP_PATH: {
        id: 'path',
        label: 'PATH設定',
        progressMessage: 'PATH設定中...',
        estimatedSeconds: 5
    },
};

export const ERROR_MESSAGES = {
    WSL_NOT_INSTALLED: 'WSL2がインストールされていません',
    UBUNTU_NOT_INSTALLED: 'Ubuntuがインストールされていません',
    PM2_INSTALL_FAILED: 'pm2のインストールに失敗しました',
    JQ_INSTALL_FAILED: 'jqのインストールに失敗しました',
};

export const SUCCESS_MESSAGES = {
    INIT_GLOBAL_COMPLETE: '✅ グローバル設定が完了しました',
    INIT_WORKSPACE_COMPLETE: '✅ ワークスペース設定が完了しました',
};

export const NEXT_STEPS = {
    INIT_GLOBAL: [
        '新しいターミナルを開いてください',
        'maidctl --help でコマンドを確認できます',
        'プロジェクトで「Maid Agent: Init」を実行してください'
    ],
    INIT_WORKSPACE: [
        '「Maid Agent: ダッシュボード」でチーム状況を確認',
        'maidctl team status でコマンドラインから確認'
    ]
};
