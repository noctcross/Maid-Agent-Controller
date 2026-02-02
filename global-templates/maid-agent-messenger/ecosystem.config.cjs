/**
 * PM2 設定ファイル
 *
 * maid-agent-messenger（エージェント間メッセージングサーバー）を常時稼働させる
 *
 * 使用方法:
 *   初回セットアップ:
 *     cd ~/.maid-agent/maid-agent-messenger
 *     npm install
 *     pm2 start ecosystem.config.cjs
 *     pm2 save
 *     pm2 startup  # OS起動時の自動起動設定
 *
 *   運用コマンド:
 *     pm2 status                        # ステータス確認
 *     pm2 logs maid-agent-messenger     # ログ確認
 *     pm2 restart maid-agent-messenger  # 再起動
 *     pm2 stop maid-agent-messenger     # 停止
 */

module.exports = {
  apps: [
    {
      name: "maid-agent-messenger",
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
