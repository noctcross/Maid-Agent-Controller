/**
 * UIメッセージ定数
 */

export const SETUP_MESSAGES = {
    INIT_GLOBAL: {
        TITLE: '🎩 Maid Agent グローバル設定',
        DESCRIPTION: 'グローバル環境をセットアップします',
    },
    INIT_WORKSPACE: {
        TITLE: '🎩 Maid Agent ワークスペース設定',
        DESCRIPTION: 'プロジェクトにMaid Agentをセットアップします',
    },
    STEPS: {
        COPY_GLOBAL: { id: 'copy', label: 'グローバル設定をコピー', progressMessage: 'グローバル設定をコピー中...', estimatedSeconds: 5 },
        INSTALL_PM2: { id: 'pm2', label: 'pm2をインストール', progressMessage: 'pm2をインストール中...', estimatedSeconds: 30 },
        INSTALL_DEPS: { id: 'deps', label: '依存関係をインストール', progressMessage: '依存関係をインストール中...', estimatedSeconds: 60 },
        START_MCP: { id: 'mcp', label: 'MCPサーバーを起動', progressMessage: 'MCPサーバーを起動中...', estimatedSeconds: 10 },
        SETUP_STARTUP: { id: 'startup', label: '自動起動を設定', progressMessage: '自動起動を設定中...', estimatedSeconds: 5 },
    },
    ERRORS: {
        WSL_NOT_INSTALLED: 'WSL2がインストールされていません',
        UBUNTU_NOT_INSTALLED: 'Ubuntuがインストールされていません',
        PM2_INSTALL_FAILED: 'pm2のインストールに失敗しました',
    },
    SUCCESS: {
        INIT_GLOBAL_COMPLETE: '✅ グローバル設定が完了しました',
        INIT_WORKSPACE_COMPLETE: '✅ ワークスペース設定が完了しました',
    },
};
