import * as path from 'path';
import { windowsToWslPath } from './environment';

/**
 * パストラバーサル防止: resolvedPath が allowedRoot 内にあることを検証
 * @returns true: 安全, false: 範囲外
 */
export function isPathWithinRoot(filePath: string, allowedRoot: string): boolean {
    const resolved = path.resolve(filePath);
    const root = path.resolve(allowedRoot);
    return resolved.startsWith(root + path.sep) || resolved === root;
}

/**
 * 環境を考慮したパストラバーサル防止
 * Windows-native環境でMCPサーバーからWSLパスが渡され、workspaceRootがWindowsパスの場合、
 * rootをWSL形式に統一してから比較する。
 * 両パスが同じ形式になるため、path.resolveが同じ変換を適用し正しく比較できる。
 */
export function isPathWithinRootCrossEnv(filePath: string, allowedRoot: string, env: string): boolean {
    if (env === 'windows-native') {
        const normalizedRoot = windowsToWslPath(allowedRoot);
        return isPathWithinRoot(filePath, normalizedRoot);
    }
    return isPathWithinRoot(filePath, allowedRoot);
}

/**
 * isPathWithinRoot の前処理用: パスを指定環境のフォーマットに正規化
 * WSL環境では Windows パス (C:/..., C:\...) を WSL パス (/mnt/c/...) に変換
 * Linux上で path.resolve('C:/...') は C: をディレクトリ名として解釈するため、
 * isPathWithinRoot 呼び出し前にこの正規化が必要
 */
export function normalizePathForValidation(
    filePath: string,
    env: string
): string {
    if (env === 'wsl' && /^[A-Za-z]:[/\\]/i.test(filePath)) {
        const driveLetter = filePath[0].toLowerCase();
        const rest = filePath.slice(2).replace(/\\/g, '/');
        const trimmedRest = rest.startsWith('/') ? rest.slice(1) : rest;
        return `/mnt/${driveLetter}/${trimmedRest}`;
    }
    return filePath;
}
