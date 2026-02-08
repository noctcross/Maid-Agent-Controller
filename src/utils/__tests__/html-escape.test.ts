import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../html-escape';

describe('escapeHtml', () => {
    it('<script> タグをエスケープすること', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('全ての特殊文字（& < > " \'）をエスケープすること', () => {
        expect(escapeHtml('a&b"c\'d')).toBe("a&amp;b&quot;c&#039;d");
    });

    it('通常のテキストはそのまま返すこと', () => {
        expect(escapeHtml('normal text')).toBe('normal text');
    });

    it('空文字列を正しく処理すること', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('複数の特殊文字が混在するケースを処理すること', () => {
        expect(escapeHtml('<div class="test">&</div>')).toBe(
            '&lt;div class=&quot;test&quot;&gt;&amp;&lt;/div&gt;'
        );
    });
});
