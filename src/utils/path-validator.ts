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
