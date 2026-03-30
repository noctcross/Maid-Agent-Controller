import { describe, it, expect } from 'vitest';
import {
    escapeForDoubleQuote,
    escapeForSingleQuote,
    escapeForSendKeys,
    quoteArg,
    assertNoShellMeta,
} from '../shell-escape';

describe('escapeForDoubleQuote', () => {
    describe('bash', () => {
        it('バックスラッシュを最初にエスケープすること', () => {
            expect(escapeForDoubleQuote('hello\\world', 'bash')).toBe('hello\\\\world');
        });

        it('ダブルクォートをエスケープすること', () => {
            expect(escapeForDoubleQuote('hello"world', 'bash')).toBe('hello\\"world');
        });

        it('$ をエスケープすること', () => {
            expect(escapeForDoubleQuote('$HOME', 'bash')).toBe('\\$HOME');
        });

        it('バッククォートをエスケープすること', () => {
            expect(escapeForDoubleQuote('`whoami`', 'bash')).toBe('\\`whoami\\`');
        });

        it('複合パターン: バックスラッシュ+ダブルクォートの攻撃シナリオ', () => {
            // H-1 の攻撃シナリオ: hello\"world → バックスラッシュが先にエスケープされる
            expect(escapeForDoubleQuote('hello\\"world', 'bash')).toBe('hello\\\\\\"world');
        });

        it('通常の文字列はそのまま返すこと', () => {
            expect(escapeForDoubleQuote('hello world', 'bash')).toBe('hello world');
        });

        it('全メタ文字を含む文字列を正しくエスケープすること', () => {
            const input = 'a\\b"c$d`e';
            const result = escapeForDoubleQuote(input, 'bash');
            expect(result).toBe('a\\\\b\\"c\\$d\\`e');
        });
    });

    describe('powershell', () => {
        it('バッククォートを最初にエスケープすること', () => {
            expect(escapeForDoubleQuote('hello`world', 'powershell')).toBe('hello``world');
        });

        it('ダブルクォートをエスケープすること', () => {
            expect(escapeForDoubleQuote('hello"world', 'powershell')).toBe('hello`"world');
        });

        it('$ をエスケープすること', () => {
            expect(escapeForDoubleQuote('$env:PATH', 'powershell')).toBe('`$env:PATH');
        });

        it('全メタ文字を含む文字列を正しくエスケープすること', () => {
            const input = 'a`b"c$d';
            const result = escapeForDoubleQuote(input, 'powershell');
            expect(result).toBe('a``b`"c`$d');
        });
    });

    describe('cmd', () => {
        it('ダブルクォートを二重化すること', () => {
            expect(escapeForDoubleQuote('hello"world', 'cmd')).toBe('hello""world');
        });

        it('$ やバッククォートはそのまま残すこと', () => {
            expect(escapeForDoubleQuote('$HOME`test', 'cmd')).toBe('$HOME`test');
        });
    });
});

describe('escapeForSingleQuote', () => {
    it('シングルクォートをエスケープすること', () => {
        expect(escapeForSingleQuote("it's")).toBe("it'\\''s");
    });

    it('シングルクォートがない場合はそのまま返すこと', () => {
        expect(escapeForSingleQuote('hello world')).toBe('hello world');
    });

    it('バックスラッシュや $ はそのまま残すこと', () => {
        expect(escapeForSingleQuote('$HOME\\path')).toBe('$HOME\\path');
    });

    it('複数のシングルクォートを正しくエスケープすること', () => {
        expect(escapeForSingleQuote("'a'b'")).toBe("'\\''a'\\''b'\\''");
    });
});

describe('escapeForSendKeys', () => {
    it('tmux の場合はシングルクォートで囲むこと', () => {
        const result = escapeForSendKeys('hello world', 'tmux');
        expect(result).toBe("'hello world'");
    });

    it('psmux の場合はダブルクォートで囲むこと', () => {
        const result = escapeForSendKeys('hello world', 'psmux');
        expect(result).toBe('"hello world"');
    });

    it('tmux でシングルクォートを含む場合にエスケープすること', () => {
        const result = escapeForSendKeys("it's a test", 'tmux');
        expect(result).toBe("'it'\\''s a test'");
    });

    it('psmux で $ を含む場合にエスケープすること', () => {
        const result = escapeForSendKeys('echo $HOME', 'psmux');
        expect(result).toBe('"echo `$HOME"');
    });

    it('改行を空白に置換すること', () => {
        const result = escapeForSendKeys('line1\nline2\r\nline3', 'tmux');
        expect(result).toBe("'line1 line2 line3'");
    });
});

describe('quoteArg', () => {
    it('bash の場合はシングルクォートで囲むこと', () => {
        expect(quoteArg('hello', 'bash')).toBe("'hello'");
    });

    it('powershell の場合はダブルクォートで囲むこと', () => {
        expect(quoteArg('hello', 'powershell')).toBe('"hello"');
    });

    it('cmd の場合はダブルクォートで囲むこと', () => {
        expect(quoteArg('hello', 'cmd')).toBe('"hello"');
    });

    it('bash でシングルクォートを含む場合にエスケープすること', () => {
        expect(quoteArg("it's", 'bash')).toBe("'it'\\''s'");
    });

    it('powershell で $ を含む場合にエスケープすること', () => {
        expect(quoteArg('$HOME', 'powershell')).toBe('"`$HOME"');
    });
});

describe('assertNoShellMeta', () => {
    it('安全な文字列は例外を投げないこと', () => {
        expect(() => assertNoShellMeta('hello world')).not.toThrow();
        expect(() => assertNoShellMeta('pm2 startup systemd -u user --hp /home/user')).not.toThrow();
    });

    it('セミコロンを含む場合に例外を投げること', () => {
        expect(() => assertNoShellMeta('cmd; rm -rf /')).toThrow('Shell meta characters detected');
    });

    it('パイプを含む場合に例外を投げること', () => {
        expect(() => assertNoShellMeta('cmd | cat')).toThrow('Shell meta characters detected');
    });

    it('$ を含む場合に例外を投げること', () => {
        expect(() => assertNoShellMeta('echo $HOME')).toThrow('Shell meta characters detected');
    });

    it('バッククォートを含む場合に例外を投げること', () => {
        expect(() => assertNoShellMeta('`whoami`')).toThrow('Shell meta characters detected');
    });

    it('改行を含む場合に例外を投げること', () => {
        expect(() => assertNoShellMeta('cmd\nrm -rf /')).toThrow('Shell meta characters detected');
    });

    it('コンテキスト付きのエラーメッセージを出力すること', () => {
        expect(() => assertNoShellMeta('cmd; bad', 'test context')).toThrow('(test context)');
    });

    it('エラーメッセージに値の先頭50文字を含めること', () => {
        const longValue = 'a'.repeat(100) + ';';
        expect(() => assertNoShellMeta(longValue)).toThrow('a'.repeat(50));
    });
});
