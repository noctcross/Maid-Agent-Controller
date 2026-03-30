/**
 * パッケージマネージャ自動判別・コマンド生成
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ENV } from './environment';

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

/**
 * パッケージマネージャごとのコマンド設定
 */
export const PM_CONFIG: Record<PackageManager, {
    install: string;
    globalInstall: (pkg: string) => string;
    displayName: string;
    binPath: string;
}> = {
    npm: {
        install: 'npm install',
        globalInstall: (pkg) => `npm install -g ${pkg}`,
        displayName: 'npm',
        binPath: '/usr/bin/npm'
    },
    pnpm: {
        install: 'pnpm install',
        globalInstall: (pkg) => `pnpm add -g ${pkg}`,
        displayName: 'pnpm',
        binPath: '/usr/bin/pnpm'
    },
    yarn: {
        install: 'yarn install',
        globalInstall: (pkg) => `yarn global add ${pkg}`,
        displayName: 'yarn',
        binPath: '/usr/bin/yarn'
    }
};

/**
 * ロックファイルからパッケージマネージャを検出
 */
const LOCKFILE_MAP: Record<string, PackageManager> = {
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'package-lock.json': 'npm'
};

/**
 * ロックファイルでパッケージマネージャを検出
 * @param dir 検索ディレクトリ
 * @returns 検出されたPM、未検出ならundefined
 */
function detectByLockFile(dir: string): PackageManager | undefined {
    for (const [filename, pm] of Object.entries(LOCKFILE_MAP)) {
        const lockPath = path.join(dir, filename);
        if (fs.existsSync(lockPath)) {
            return pm;
        }
    }
    return undefined;
}

/**
 * コマンドの存在を確認
 * ログインシェルで実行してnvm/nodenv/Homebrew等のPATH設定を読み込む
 */
function checkCommand(cmd: string): boolean {
    try {
        if (ENV.isWindowsNative()) {
            execSync(`wsl bash -lc "which ${cmd}"`, { stdio: 'pipe' });
        } else {
            // Mac/Linux: ユーザーシェルでログインシェルとして実行
            const userShell = process.env.SHELL || '/bin/bash';
            execSync(`${userShell} -lc "which ${cmd}"`, { stdio: 'pipe' });
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * コマンド存在確認でパッケージマネージャを検出（フォールバック）
 * 優先順位: pnpm > yarn > npm
 */
function detectByCommand(): PackageManager {
    if (checkCommand('pnpm')) return 'pnpm';
    if (checkCommand('yarn')) return 'yarn';
    return 'npm';
}

/**
 * パッケージマネージャを自動判別
 * @param dir 判定に使用するディレクトリ（ロックファイル検索用）
 * @returns 検出されたパッケージマネージャ
 */
export function detectPackageManager(dir: string): PackageManager {
    // 1. ロックファイルで判定（優先）
    const byLockFile = detectByLockFile(dir);
    if (byLockFile) {
        return byLockFile;
    }

    // 2. コマンド存在確認でフォールバック
    return detectByCommand();
}

/**
 * sudoers設定用のコンテンツを生成（全PM対応）
 * @param username WSLユーザー名
 * @returns sudoersファイルの内容
 */
export function generateSudoersContent(username: string): string {
    return `# Maid Agent - Passwordless sudo for pm2 operations
# Created by VSCode Maid Agent Extension
${username} ALL=(ALL) NOPASSWD: /usr/bin/npm install -g pm2
${username} ALL=(ALL) NOPASSWD: /usr/bin/pnpm add -g pm2
${username} ALL=(ALL) NOPASSWD: /usr/bin/yarn global add pm2
${username} ALL=(ALL) NOPASSWD: /usr/bin/env *
`;
}
