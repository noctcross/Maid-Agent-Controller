/**
 * ビルド成果物を global-templates/maid-agent-messenger/ に同期
 * postbuild で自動実行される
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.resolve(__dirname, '..');
const targetDir = path.resolve(__dirname, '../../../global-templates/maid-agent-messenger');

// コピーするファイル/フォルダ
const itemsToCopy = [
  'dist',
  'package.json',
  'package-lock.json',
  'ecosystem.config.cjs',
  '.gitignore'
];

/**
 * ディレクトリを再帰的にコピー
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * ディレクトリを再帰的に削除
 */
function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// メイン処理
console.log('📦 Syncing to global-templates/maid-agent-messenger/...');

for (const item of itemsToCopy) {
  const srcPath = path.join(sourceDir, item);
  const destPath = path.join(targetDir, item);

  if (!fs.existsSync(srcPath)) {
    console.log(`  ⏭ Skip: ${item} (not found)`);
    continue;
  }

  const stat = fs.statSync(srcPath);

  if (stat.isDirectory()) {
    // ディレクトリは削除してからコピー
    removeDir(destPath);
    copyDir(srcPath, destPath);
    console.log(`  ✓ Copied: ${item}/`);
  } else {
    // ファイルはそのままコピー
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ Copied: ${item}`);
  }
}

console.log('✅ Sync complete!');
