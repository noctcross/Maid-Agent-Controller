/**
 * ローカルデプロイスクリプト（テンプレート）
 *
 * ビルド後に PM2 プロセスを安全に再起動するスクリプトです。
 * sync-to-global.js から自動的に呼び出されます。
 *
 * 使用方法:
 *   cp scripts/deploy-local.example.js scripts/deploy-local.js
 *
 * 注意:
 *   - deploy-local.js は .gitignore 対象です（環境依存のため）
 *   - pm2 delete → pm2 start の順序で重複プロセスを防止します
 */

import { execSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// グローバルインストール先
const globalDir = resolve(
  process.env.HOME || process.env.USERPROFILE || "",
  ".maid-agent",
  "maid-agent-messenger"
);

console.log("[deploy] PM2プロセスを再起動します...");
try {
  // 既存プロセスを確実に停止してから再起動（重複防止）
  execSync("pm2 delete maid-agent-messenger 2>/dev/null || true", {
    stdio: "inherit",
    cwd: globalDir,
  });
  execSync("pm2 start ecosystem.config.cjs", {
    stdio: "inherit",
    cwd: globalDir,
  });
  execSync("pm2 save", {
    stdio: "inherit",
  });
  console.log("[deploy] PM2再起動完了");
} catch (e) {
  console.error(`[deploy] PM2再起動失敗: ${e.message}`);
}
