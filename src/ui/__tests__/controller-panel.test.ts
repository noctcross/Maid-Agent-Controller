import { describe, it, expect, vi, beforeEach } from 'vitest';

// vscode モックを定義
vi.mock('vscode', () => ({
    window: {
        createWebviewPanel: vi.fn(),
    },
    ViewColumn: { Active: 1 },
}));

import * as fs from 'fs';
import { NOTIFICATIONS_SUBDIR, INSTRUCTIONS_SUBDIR, CONFIG_SUBDIR } from '../../constants';
import { updateController } from '../controller-panel';

// fs.existsSync / readFileSync をスパイ
vi.mock('fs');

describe('updateController', () => {
    let capturedHtml: string;
    let mockCtx: any;

    beforeEach(() => {
        capturedHtml = '';
        vi.restoreAllMocks();

        mockCtx = {
            controllerPanel: {
                webview: {
                    set html(value: string) { capturedHtml = value; },
                    get html() { return capturedHtml; },
                },
            },
            agents: new Map(),
            maidAgentPath: '/test/project/.maid-agent',
            logs: [],
        };
    });

    describe('パス修正の検証', () => {
        it('history.log を system/data/notifications/ から読み取ること', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            updateController(mockCtx);

            // existsSync に渡されたパスを検証
            const calls = vi.mocked(fs.existsSync).mock.calls;
            const historyCall = calls.find(c =>
                (c[0] as string).includes('history.log')
            );
            expect(historyCall).toBeDefined();
            expect(historyCall![0]).toBe(
                `/test/project/.maid-agent/${NOTIFICATIONS_SUBDIR}/history.log`
            );
        });

        it('設定ファイルリンクが agents/instructions/ パスを使用すること', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            updateController(mockCtx);

            expect(capturedHtml).toContain(`openFile('${INSTRUCTIONS_SUBDIR}/butler.md')`);
            expect(capturedHtml).toContain(`openFile('${INSTRUCTIONS_SUBDIR}/chief.md')`);
            expect(capturedHtml).toContain(`openFile('${INSTRUCTIONS_SUBDIR}/maid.md')`);
            expect(capturedHtml).toContain(`openFile('${CONFIG_SUBDIR}/settings.yaml')`);
        });

        it('旧パス（instructions/, config/）を使用していないこと', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            updateController(mockCtx);

            // 旧パスが含まれていないことを確認
            expect(capturedHtml).not.toMatch(/openFile\('instructions\//);
            expect(capturedHtml).not.toMatch(/openFile\('config\//);
        });

        it('Queue ボタンが存在せず tasks.yaml リンクがあること', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            updateController(mockCtx);

            expect(capturedHtml).not.toContain("openFile('queue/");
            expect(capturedHtml).toContain("openFile('system/data/tasks.yaml')");
        });

        it('QUICK_REFERENCE.md リンクが存在すること', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            updateController(mockCtx);

            expect(capturedHtml).toContain('QUICK_REFERENCE.md');
        });
    });

    describe('会話ログの表示', () => {
        it('history.log が存在する場合、会話ログを表示すること', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(
                '[2026-02-07 12:00:00] alice → chief: タスク完了報告\n' +
                '[2026-02-07 12:01:00] chief → emma: 新タスク割り当て'
            );

            updateController(mockCtx);

            expect(capturedHtml).toContain('conv-sender');
            expect(capturedHtml).toContain('alice');
            expect(capturedHtml).toContain('chief');
        });

        it('history.log が存在しない場合、デフォルトメッセージを表示すること', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            updateController(mockCtx);

            expect(capturedHtml).toContain('会話ログはございません');
        });
    });

    describe('メイドタスク情報の表示', () => {
        it('メイドのYAMLファイルからタスク情報を読み取って表示すること', () => {
            const existsSync = vi.mocked(fs.existsSync);
            const readFileSync = vi.mocked(fs.readFileSync);

            // history.log は存在しない
            existsSync.mockImplementation(((p: fs.PathLike) => {
                const pathStr = p.toString();
                if (pathStr.includes('history.log')) return false;
                if (pathStr.includes('alice.yaml')) return true;
                return false;
            }) as typeof fs.existsSync);
            readFileSync.mockImplementation(((p: fs.PathOrFileDescriptor, _options?: unknown) => {
                const pathStr = p.toString();
                if (pathStr.includes('alice.yaml')) {
                    return 'task_id: "task-060-5"\ntitle: "テスト計画書作成"\nstatus: "working"';
                }
                return '';
            }) as typeof fs.readFileSync);

            // アリスをメイドとして登録
            mockCtx.agents.set('alice', {
                name: 'アリス', id: 'alice', role: 'maid', status: 'working', tmuxWindow: 'alice',
            });

            updateController(mockCtx);

            expect(capturedHtml).toContain('task-060-5');
        });
    });

    describe('自動更新', () => {
        it('setInterval による自動更新スクリプトが含まれること', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            updateController(mockCtx);

            expect(capturedHtml).toContain('setInterval');
            expect(capturedHtml).toContain('refresh()');
        });
    });
});
