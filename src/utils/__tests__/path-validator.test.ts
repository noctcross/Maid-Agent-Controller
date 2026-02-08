import { describe, it, expect } from 'vitest';
import { isPathWithinRoot } from '../path-validator';

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
});
