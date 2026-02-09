/**
 * PM2 設定ファイル
 *
 * maid-agent-messenger（エージェント間メッセージングサーバー）を常時稼働させる
 *
 * PM2設定値は mcp-server.yaml の pm2 セクションから読み込み。
 * 設定ファイルが見つからない場合はデフォルト値を使用。
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

const fs = require("fs");
const path = require("path");

// デフォルト値（mcp-server.yaml が見つからない場合に使用）
const PM2_DEFAULTS = {
  max_memory_restart: "500M",
  instances: 1,
  autorestart: true,
  watch: false,
};

/**
 * mcp-server.yaml から PM2 設定を読み込む
 */
function loadPm2Config() {
  // yaml パッケージを動的に読み込み（インストールされていない環境への対応）
  let yaml;
  try {
    yaml = require("yaml");
  } catch {
    console.warn("[ecosystem.config] yaml package not found, using defaults");
    return null;
  }

  const configPaths = [];

  // プロジェクトパスが環境変数で指定されている場合
  if (process.env.MAID_PROJECT_PATH) {
    configPaths.push(
      path.join(process.env.MAID_PROJECT_PATH, ".maid-agent", "system", "config", "mcp-server.yaml")
    );
  }

  // グローバル設定パス
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  configPaths.push(
    path.join(homeDir, ".maid-agent", "system", "config", "mcp-server.yaml")
  );

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf8");
        const config = yaml.parse(content);
        if (config && config.pm2) {
          return config.pm2;
        }
      }
    } catch (e) {
      console.warn(`[ecosystem.config] Failed to load config from ${configPath}: ${e.message}`);
    }
  }

  return null;
}

const pm2Config = loadPm2Config();

module.exports = {
  apps: [
    {
      name: "maid-agent-messenger",
      script: "dist/central-server.js",
      cwd: __dirname,
      instances: pm2Config?.instances ?? PM2_DEFAULTS.instances,
      autorestart: pm2Config?.autorestart ?? PM2_DEFAULTS.autorestart,
      watch: pm2Config?.watch ?? PM2_DEFAULTS.watch,
      max_memory_restart: pm2Config?.max_memory_restart || PM2_DEFAULTS.max_memory_restart,
      env: {
        NODE_ENV: "production",
        // 設定ファイルのパス: 環境変数を削除し、config-loader.ts のデフォルト動作に任せる
        // デフォルト: ~/.maid-agent/system/config/mcp-server.yaml
      },
      // ログ設定
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      merge_logs: true,
      // 起動時のディレイ（他のサービスの起動を待つ）
      wait_ready: true,
      listen_timeout: 10000,
      // プロセス停止の猶予時間
      kill_timeout: 5000,
    },
  ],
};
