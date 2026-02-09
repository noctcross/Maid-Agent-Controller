import * as path from 'path';

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
