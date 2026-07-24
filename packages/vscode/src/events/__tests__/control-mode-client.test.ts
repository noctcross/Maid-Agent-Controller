import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// child_process をモック（spawn のみ使用）
vi.mock('child_process', () => ({
    spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import {
    ControlModeParser,
    ControlModeClient,
    CONTROL_MODE_RETRY_BASE_MS,
    CONTROL_MODE_MAX_RETRIES,
    CONTROL_MODE_FORCE_KILL_GRACE_MS,
    type ControlModeEvent,
} from '../control-mode-client';

/**
 * 疑似 tmux -C プロセス
 */
class FakeProcess extends EventEmitter {
    public stdout = new EventEmitter();
    public stderr = new EventEmitter();
    public stdin = { write: vi.fn() };
    public kill = vi.fn();
}

function createClient(overrides: Partial<ConstructorParameters<typeof ControlModeClient>[0]> = {}) {
    const onWindowName = vi.fn();
    const onFatal = vi.fn();
    const client = new ControlModeClient({
        command: 'wsl',
        args: ['tmux', '-C', 'attach-session', '-t', 'maid-session'],
        sessionName: 'maid-session',
        onWindowName,
        onFatal,
        ...overrides,
    });
    return { client, onWindowName, onFatal };
}

describe('ControlModeParser', () => {
    let parser: ControlModeParser;

    beforeEach(() => {
        parser = new ControlModeParser();
    });

    it('%begin/%end ブロックの内容を command-output として返すこと', () => {
        expect(parser.feed('%begin 1721793600 1 0')).toBeNull();
        expect(parser.feed('flora')).toBeNull();
        const event = parser.feed('%end 1721793600 1 0');
        expect(event).toEqual({ type: 'command-output', text: 'flora' });
    });

    it('複数行のブロック出力を改行結合で返すこと', () => {
        parser.feed('%begin 1 2 0');
        parser.feed('line1');
        parser.feed('line2');
        const event = parser.feed('%end 1 2 0');
        expect(event).toEqual({ type: 'command-output', text: 'line1\nline2' });
    });

    it('%error ブロックを error-output として返すこと', () => {
        parser.feed('%begin 1 3 0');
        parser.feed("can't find session");
        const event = parser.feed('%error 1 3 0');
        expect(event).toEqual({ type: 'error-output', text: "can't find session" });
    });

    it('%session-window-changed 通知を window-changed として返すこと', () => {
        const event = parser.feed('%session-window-changed $2 @15');
        expect(event).toEqual({ type: 'window-changed' });
    });

    it('%window-renamed 通知を window-changed として返すこと', () => {
        const event = parser.feed('%window-renamed @5 emma');
        expect(event).toEqual({ type: 'window-changed' });
    });

    it('%exit を exit として返すこと', () => {
        expect(parser.feed('%exit')).toEqual({ type: 'exit' });
        expect(parser.feed('%exit detached')).toEqual({ type: 'exit' });
    });

    it('ブロック外の非通知行は無視すること', () => {
        expect(parser.feed('random output')).toBeNull();
        expect(parser.feed('%unknown-notification foo')).toBeNull();
    });
});

describe('ControlModeClient', () => {
    let fakeProc: FakeProcess;
    const spawnMock = vi.mocked(spawn);

    beforeEach(() => {
        vi.useFakeTimers();
        fakeProc = new FakeProcess();
        spawnMock.mockReset();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnMock.mockImplementation(() => fakeProc as any);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('start() で指定コマンドを spawn すること', () => {
        const { client } = createClient();
        client.start();
        expect(spawnMock).toHaveBeenCalledWith(
            'wsl',
            ['tmux', '-C', 'attach-session', '-t', 'maid-session'],
            expect.anything()
        );
        client.dispose();
    });

    it('起動直後に現在ウィンドウ名の初期照会を stdin へ送ること', () => {
        const { client } = createClient();
        client.start();
        expect(fakeProc.stdin.write).toHaveBeenCalledTimes(1);
        const written = fakeProc.stdin.write.mock.calls[0][0] as string;
        expect(written).toContain('display-message');
        expect(written).toContain('maid-session');
        expect(written).toContain('#{window_name}');
        client.dispose();
    });

    it('ウィンドウ変更通知を受けたら再照会を stdin へ送ること', () => {
        const { client } = createClient();
        client.start();
        fakeProc.stdin.write.mockClear();
        fakeProc.stdout.emit('data', Buffer.from('%session-window-changed $2 @15\n'));
        expect(fakeProc.stdin.write).toHaveBeenCalledTimes(1);
        client.dispose();
    });

    it('ブロック応答からウィンドウ名を onWindowName へ通知すること', () => {
        const { client, onWindowName } = createClient();
        client.start();
        fakeProc.stdout.emit('data', Buffer.from('%begin 1 1 0\nemma\n%end 1 1 0\n'));
        expect(onWindowName).toHaveBeenCalledWith('emma');
        client.dispose();
    });

    it('分割されたチャンクでも行を正しく組み立てること', () => {
        const { client, onWindowName } = createClient();
        client.start();
        fakeProc.stdout.emit('data', Buffer.from('%begin 1 1 0\nso'));
        fakeProc.stdout.emit('data', Buffer.from('phia\n%end 1 1 0\n'));
        expect(onWindowName).toHaveBeenCalledWith('sophia');
        client.dispose();
    });

    it('dispose() 後、猶予時間内に exit しないプロセスは SIGKILL で強制終了すること', () => {
        const { client } = createClient();
        client.start();
        client.dispose();
        expect(fakeProc.kill).toHaveBeenCalledTimes(1);

        // exit イベントが来ないまま猶予時間が経過
        vi.advanceTimersByTime(CONTROL_MODE_FORCE_KILL_GRACE_MS);
        expect(fakeProc.kill).toHaveBeenCalledTimes(2);
        expect(fakeProc.kill).toHaveBeenLastCalledWith('SIGKILL');
    });

    it('dispose() 後、猶予時間内に exit すれば強制終了しないこと', () => {
        const { client } = createClient();
        client.start();
        client.dispose();
        expect(fakeProc.kill).toHaveBeenCalledTimes(1);

        fakeProc.emit('exit', 0);
        vi.advanceTimersByTime(CONTROL_MODE_FORCE_KILL_GRACE_MS * 2);
        expect(fakeProc.kill).toHaveBeenCalledTimes(1);
    });

    it('dispose() でプロセスを kill し再起動しないこと', () => {
        const { client } = createClient();
        client.start();
        client.dispose();
        expect(fakeProc.kill).toHaveBeenCalled();
        // dispose 後のプロセス終了では再spawnしない
        fakeProc.emit('exit', 0);
        vi.advanceTimersByTime(CONTROL_MODE_RETRY_BASE_MS * 10);
        expect(spawnMock).toHaveBeenCalledTimes(1);
    });

    it('error イベント単独（exit なし）でもバックオフ後に再接続すること', () => {
        const { client } = createClient();
        client.start();
        expect(spawnMock).toHaveBeenCalledTimes(1);

        const nextProc = new FakeProcess();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnMock.mockImplementation(() => nextProc as any);

        fakeProc.emit('error', new Error('spawn ENOENT'));
        vi.advanceTimersByTime(CONTROL_MODE_RETRY_BASE_MS);
        expect(spawnMock).toHaveBeenCalledTimes(2);
        client.dispose();
    });

    it('error と exit が両方発火しても再接続は1回だけであること', () => {
        const { client } = createClient();
        client.start();

        const nextProc = new FakeProcess();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnMock.mockImplementation(() => nextProc as any);

        fakeProc.emit('error', new Error('boom'));
        fakeProc.emit('exit', 1);
        vi.advanceTimersByTime(CONTROL_MODE_RETRY_BASE_MS * 4);
        expect(spawnMock).toHaveBeenCalledTimes(2);
        client.dispose();
    });

    it('プロセスが予期せず終了したらバックオフ後に再接続すること', () => {
        const { client } = createClient();
        client.start();
        expect(spawnMock).toHaveBeenCalledTimes(1);

        const nextProc = new FakeProcess();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnMock.mockImplementation(() => nextProc as any);

        fakeProc.emit('exit', 1);
        expect(spawnMock).toHaveBeenCalledTimes(1); // 即時再接続ではない
        vi.advanceTimersByTime(CONTROL_MODE_RETRY_BASE_MS);
        expect(spawnMock).toHaveBeenCalledTimes(2);
        client.dispose();
    });

    it('連続失敗が上限に達したら onFatal を呼び再接続を止めること', () => {
        const { client, onFatal } = createClient();
        client.start();

        for (let i = 0; i < CONTROL_MODE_MAX_RETRIES; i++) {
            const proc = new FakeProcess();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            spawnMock.mockImplementation(() => proc as any);
            // 直近のプロセスを終了させ、バックオフを全て消化
            const current = i === 0 ? fakeProc : spawnMock.mock.results[i]?.value;
            (current as FakeProcess).emit('exit', 1);
            vi.advanceTimersByTime(CONTROL_MODE_RETRY_BASE_MS * 2 ** (i + 1));
        }

        expect(onFatal).toHaveBeenCalledTimes(1);
        client.dispose();
    });

    it('ウィンドウ名の受信で失敗カウンタがリセットされること', () => {
        const { client, onFatal } = createClient();
        client.start();

        // 1回失敗 → 再接続
        const proc2 = new FakeProcess();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spawnMock.mockImplementation(() => proc2 as any);
        fakeProc.emit('exit', 1);
        vi.advanceTimersByTime(CONTROL_MODE_RETRY_BASE_MS * 2);

        // 成功応答でカウンタリセット
        proc2.stdout.emit('data', Buffer.from('%begin 1 1 0\nemma\n%end 1 1 0\n'));

        // 再び上限-1回失敗しても onFatal は呼ばれない（リセットされているため）
        let prev = proc2;
        for (let i = 0; i < CONTROL_MODE_MAX_RETRIES - 1; i++) {
            const proc = new FakeProcess();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            spawnMock.mockImplementation(() => proc as any);
            prev.emit('exit', 1);
            vi.advanceTimersByTime(CONTROL_MODE_RETRY_BASE_MS * 2 ** (i + 2));
            prev = proc;
        }
        expect(onFatal).not.toHaveBeenCalled();
        client.dispose();
    });
});
