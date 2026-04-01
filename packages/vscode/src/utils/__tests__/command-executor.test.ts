import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WslCommandExecutor, NativeCommandExecutor, createCommandExecutor } from '../command-executor';

// execSync をモック
vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

// ENV をモック
vi.mock('../environment-context', () => ({
    ENV: {
        isWindowsNative: vi.fn(() => false),
    },
}));

import { execSync } from 'child_process';
import { ENV } from '../environment-context';

const mockExecSync = vi.mocked(execSync);
const mockIsWindowsNative = vi.mocked(ENV.isWindowsNative);

describe('WslCommandExecutor', () => {
    const executor = new WslCommandExecutor();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('execInLoginShell', () => {
        it('wsl bash -lc でコマンドを実行すること', () => {
            mockExecSync.mockReturnValue('output\n');
            const result = executor.execInLoginShell('echo hello');
            expect(mockExecSync).toHaveBeenCalledWith(
                'wsl bash -lc "echo hello"',
                expect.objectContaining({ encoding: 'utf-8' }),
            );
            expect(result).toBe('output');
        });

        it('特殊文字（$, ", \\, `）がエスケープされること', () => {
            mockExecSync.mockReturnValue('');
            executor.execInLoginShell('echo $HOME "test" `cmd` back\\slash');
            const call = mockExecSync.mock.calls[0][0] as string;
            expect(call).toContain('\\$HOME');
            expect(call).toContain('\\"test\\"');
            expect(call).toContain('\\`cmd\\`');
            expect(call).toContain('back\\\\slash');
        });

        it('追加オプションがマージされること', () => {
            mockExecSync.mockReturnValue('');
            executor.execInLoginShell('cmd', { timeout: 5000 });
            expect(mockExecSync).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
            );
        });
    });

    describe('commandExists', () => {
        it('コマンドが存在する場合 true を返すこと', () => {
            mockExecSync.mockReturnValue('/usr/bin/jq\n');
            expect(executor.commandExists('jq')).toBe(true);
        });

        it('コマンドが存在しない場合 false を返すこと', () => {
            mockExecSync.mockImplementation(() => { throw new Error('not found'); });
            expect(executor.commandExists('nonexistent')).toBe(false);
        });
    });

    describe('execWithSudoNoPassword', () => {
        it('sudo -n 付きでコマンドを実行すること', () => {
            mockExecSync.mockReturnValue('ok\n');
            const result = executor.execWithSudoNoPassword('apt update');
            const call = mockExecSync.mock.calls[0][0] as string;
            expect(call).toContain('sudo -n apt update');
            expect(result).toBe('ok');
        });
    });
});

describe('NativeCommandExecutor', () => {
    const executor = new NativeCommandExecutor();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('execInLoginShell', () => {
        it('ユーザーのシェルでコマンドを実行すること（bash）', () => {
            const originalShell = process.env.SHELL;
            process.env.SHELL = '/bin/bash';
            mockExecSync.mockReturnValue('output\n');

            const result = executor.execInLoginShell('echo hello');
            expect(mockExecSync).toHaveBeenCalledWith(
                '/bin/bash -lc "echo hello"',
                expect.objectContaining({ encoding: 'utf-8' }),
            );
            expect(result).toBe('output');

            process.env.SHELL = originalShell;
        });

        it('ユーザーのシェルでコマンドを実行すること（zsh）', () => {
            const originalShell = process.env.SHELL;
            process.env.SHELL = '/bin/zsh';
            mockExecSync.mockReturnValue('');

            executor.execInLoginShell('test');
            const call = mockExecSync.mock.calls[0][0] as string;
            expect(call).toMatch(/^\/bin\/zsh -lc "/);

            process.env.SHELL = originalShell;
        });

        it('未知のシェルの場合 bash にフォールバックすること', () => {
            const originalShell = process.env.SHELL;
            process.env.SHELL = '/bin/fish';
            mockExecSync.mockReturnValue('');

            executor.execInLoginShell('test');
            const call = mockExecSync.mock.calls[0][0] as string;
            expect(call).toMatch(/^bash -lc "/);

            process.env.SHELL = originalShell;
        });

        it('SHELL未設定の場合 bash にフォールバックすること', () => {
            const originalShell = process.env.SHELL;
            delete process.env.SHELL;
            mockExecSync.mockReturnValue('');

            executor.execInLoginShell('test');
            const call = mockExecSync.mock.calls[0][0] as string;
            expect(call).toMatch(/^bash -lc "/);

            process.env.SHELL = originalShell;
        });

        it('特殊文字がエスケープされること', () => {
            const originalShell = process.env.SHELL;
            process.env.SHELL = '/bin/bash';
            mockExecSync.mockReturnValue('');

            executor.execInLoginShell('echo $VAR "quoted" `backtick`');
            const call = mockExecSync.mock.calls[0][0] as string;
            expect(call).toContain('\\$VAR');
            expect(call).toContain('\\"quoted\\"');
            expect(call).toContain('\\`backtick\\`');

            process.env.SHELL = originalShell;
        });
    });

    describe('commandExists', () => {
        it('コマンドが存在する場合 true を返すこと', () => {
            mockExecSync.mockReturnValue('/usr/bin/node\n');
            expect(executor.commandExists('node')).toBe(true);
        });

        it('コマンドが存在しない場合 false を返すこと', () => {
            mockExecSync.mockImplementation(() => { throw new Error('not found'); });
            expect(executor.commandExists('nonexistent')).toBe(false);
        });
    });
});

describe('createCommandExecutor', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('Windows環境では WslCommandExecutor を返すこと', () => {
        mockIsWindowsNative.mockReturnValue(true);
        const executor = createCommandExecutor();
        expect(executor).toBeInstanceOf(WslCommandExecutor);
    });

    it('非Windows環境では NativeCommandExecutor を返すこと', () => {
        mockIsWindowsNative.mockReturnValue(false);
        const executor = createCommandExecutor();
        expect(executor).toBeInstanceOf(NativeCommandExecutor);
    });
});
