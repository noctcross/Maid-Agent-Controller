/**
 * PM2 設定ファイル
 *
 * 中央MCPサーバーを常時稼働させる
 *
 * 使用方法:
 *   初回セットアップ:
 *     cd .maid-agent/mcp-server
 *     npm install -g pm2
 *     pm2 start ecosystem.config.cjs
 *     pm2 save
 *     pm2 startup  # OS起動時の自動起動設定
 *
 *   運用コマンド:
 *     pm2 status                    # ステータス確認
 *     pm2 logs maid-mcp-server     # ログ確認
 *     pm2 restart maid-mcp-server  # 再起動
 *     pm2 stop maid-mcp-server     # 停止
 */

module.exports = {
  apps: [
    {
      name: "maid-mcp-server",
      script: "dist/central-server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        // 設定ファイルのパス（プロジェクトルートからの相対パス）
        MAID_MCP_CONFIG: "../config/mcp-server.yaml",
      },
      // ログ設定
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      merge_logs: true,
      // 起動時のディレイ（他のサービスの起動を待つ）
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
