#!/usr/bin/env node
/**
 * ビルド後処理: 最新の vsix ファイルを maidagent-latest.vsix としてコピー
 *
 * Usage: node scripts/copy-latest-vsix.js
 *
 * 動作:
 * 1. カレントディレクトリから multi-agent-controller-*.vsix を検索
 * 2. 最新（バージョン番号が最大）のファイルを特定
 * 3. tools/test-environment/build/maidagent-latest.vsix にコピー
 */

const fs = require('fs');
const path = require('path');

const SOURCE_PATTERN = /^multi-agent-controller-(\d+\.\d+\.\d+)\.vsix$/;
const DEST_DIR = path.join(__dirname, '..', '..', 'tools', 'test-environment', 'build');
const DEST_FILE = 'maidagent-latest.vsix';

function main() {
    const cwd = path.join(__dirname, '..');

    // vsix ファイルを検索
    const files = fs.readdirSync(cwd)
        .filter(f => SOURCE_PATTERN.test(f))
        .map(f => {
            const match = f.match(SOURCE_PATTERN);
            return {
                filename: f,
                version: match[1],
                versionParts: match[1].split('.').map(Number)
            };
        })
        .sort((a, b) => {
            // バージョン番号で降順ソート
            for (let i = 0; i < 3; i++) {
                if (a.versionParts[i] !== b.versionParts[i]) {
                    return b.versionParts[i] - a.versionParts[i];
                }
            }
            return 0;
        });

    if (files.length === 0) {
        console.error('Error: No vsix files found matching pattern: multi-agent-controller-*.vsix');
        process.exit(1);
    }

    const latest = files[0];
    const srcPath = path.join(cwd, latest.filename);
    const destPath = path.join(DEST_DIR, DEST_FILE);

    // 出力先ディレクトリの確認・作成
    if (!fs.existsSync(DEST_DIR)) {
        fs.mkdirSync(DEST_DIR, { recursive: true });
        console.log(`Created directory: ${DEST_DIR}`);
    }

    // コピー実行
    fs.copyFileSync(srcPath, destPath);

    console.log(`Copied: ${latest.filename} -> ${path.relative(cwd, destPath)}`);
    console.log(`Version: ${latest.version}`);
}

main();
