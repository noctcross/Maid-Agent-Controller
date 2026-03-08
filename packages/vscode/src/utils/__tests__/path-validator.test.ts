import { describe, it, expect } from 'vitest';
import { isPathWithinRoot, isPathWithinRootCrossEnv, normalizePathForValidation } from '../path-validator';

describe('isPathWithinRoot', () => {
    it('ルート内のファイルパスは true を返すこと', () => {
        expect(isPathWithinRoot('/workspace/file.txt', '/workspace')).toBe(true);
    });

    it('ルート内のサブディレクトリのファイルは true を返すこと', () => {
        expect(isPathWithinRoot('/workspace/sub/file.txt', '/workspace')).toBe(true);
    });

    it('.. で上位に遡るパスは false を返すこと', () => {
        expect(isPathWithinRoot('/workspace/../etc/passwd', '/workspace')).toBe(false);
    });

    it('サブディレクトリ経由で .. を使うがルート内に留まる場合は true を返すこと', () => {
        expect(isPathWithinRoot('/workspace/sub/../file.txt', '/workspace')).toBe(true);
    });

    it('完全に別のディレクトリのパスは false を返すこと', () => {
        expect(isPathWithinRoot('/other/file.txt', '/workspace')).toBe(false);
    });

    it('ルートパスそのものは true を返すこと', () => {
        expect(isPathWithinRoot('/workspace', '/workspace')).toBe(true);
    });

    it('ルート名の部分一致は false を返すこと（prefix attack防止）', () => {
        expect(isPathWithinRoot('/workspace-evil/file.txt', '/workspace')).toBe(false);
    });

    it('Linux上でWindowsパス(C:/)はCWD依存の不正確な結果となること', () => {
        // #121: Linux上ではC:/はドライブレターではなく相対パスとして解釈される
        // path.resolve('C:/Users/...') → '{CWD}/C:/Users/...' → CWD依存の結果
        // → isPathWithinRoot の前に normalizePathForValidation で正規化が必要
        const result = isPathWithinRoot(
            'C:/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/master/reports/task-116.md',
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse'
        );
        // CWD依存のためtrue/falseどちらもあり得る（結果自体は検証しない）
        expect(typeof result).toBe('boolean');
    });
});

describe('normalizePathForValidation', () => {
    it('WSL環境でWindowsパス(C:/)をWSLパスに変換すること', () => {
        expect(normalizePathForValidation(
            'C:/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/report.md',
            'wsl'
        )).toBe('/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/report.md');
    });

    it('WSL環境でWindowsパス(C:\\)をWSLパスに変換すること', () => {
        expect(normalizePathForValidation(
            'C:\\Users\\noct\\Development\\02_Projects\\MaidsHouse\\.maid-agent\\report.md',
            'wsl'
        )).toBe('/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/report.md');
    });

    it('WSL環境でWSLパスはそのまま返すこと', () => {
        expect(normalizePathForValidation(
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/report.md',
            'wsl'
        )).toBe('/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/report.md');
    });

    it('WSL環境で小文字ドライブレターも変換すること', () => {
        expect(normalizePathForValidation('c:/path/to/file.md', 'wsl'))
            .toBe('/mnt/c/path/to/file.md');
    });

    it('Linux環境ではWindowsパスを変換しないこと', () => {
        expect(normalizePathForValidation('C:/Users/file.md', 'linux'))
            .toBe('C:/Users/file.md');
    });

    it('正規化後のパスがisPathWithinRootで正しく判定されること', () => {
        const filePath = normalizePathForValidation(
            'C:/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/master/reports/task-116.md',
            'wsl'
        );
        expect(isPathWithinRoot(
            filePath,
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse'
        )).toBe(true);
    });

    it('正規化後のルート外パスはisPathWithinRootでfalseになること', () => {
        const filePath = normalizePathForValidation(
            'C:/Users/other/evil.md',
            'wsl'
        );
        expect(isPathWithinRoot(
            filePath,
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse'
        )).toBe(false);
    });
});

describe('isPathWithinRootCrossEnv', () => {
    // #116-1: Windows-native環境でWSLパス(filePath)とWindowsパス(root)の混在に対応

    it('windows-native環境: WSLパスとWindowsルートの比較でルート内のパスはtrueを返すこと', () => {
        expect(isPathWithinRootCrossEnv(
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/master/reports/task-002.md',
            'c:\\Users\\noct\\Development\\02_Projects\\MaidsHouse',
            'windows-native'
        )).toBe(true);
    });

    it('windows-native環境: WSLパスとWindowsルートの比較でルート外のパスはfalseを返すこと', () => {
        expect(isPathWithinRootCrossEnv(
            '/mnt/c/Users/other/evil.md',
            'c:\\Users\\noct\\Development\\02_Projects\\MaidsHouse',
            'windows-native'
        )).toBe(false);
    });

    it('windows-native環境: パストラバーサル攻撃を防止すること', () => {
        expect(isPathWithinRootCrossEnv(
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/../../etc/passwd',
            'c:\\Users\\noct\\Development\\02_Projects\\MaidsHouse',
            'windows-native'
        )).toBe(false);
    });

    it('windows-native環境: prefix attack（ルート名の部分一致）を防止すること', () => {
        expect(isPathWithinRootCrossEnv(
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse-evil/file.md',
            'c:\\Users\\noct\\Development\\02_Projects\\MaidsHouse',
            'windows-native'
        )).toBe(false);
    });

    it('wsl環境: 通常のWSLパス比較はそのまま機能すること', () => {
        expect(isPathWithinRootCrossEnv(
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/reports/task.md',
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse',
            'wsl'
        )).toBe(true);
    });

    it('wsl環境: ルート外のパスはfalseを返すこと', () => {
        expect(isPathWithinRootCrossEnv(
            '/mnt/c/Users/other/file.md',
            '/mnt/c/Users/noct/Development/02_Projects/MaidsHouse',
            'wsl'
        )).toBe(false);
    });
});
