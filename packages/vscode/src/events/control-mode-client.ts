/**
 * tmux control mode 常駐クライアント
 *
 * `tmux -C attach-session` を1本だけ常駐させ、ウィンドウ変更通知
 * （%session-window-changed 等）をイベント駆動で受信する。
 * 従来の500msポーリング（1回ごとに cmd/wsl/conhost プロセスを生成）を置き換え、
 * Windows側のプロセス生成をゼロにする（カーネルメモリリーク増幅の抑止）。
 *
 * 注意: このモジュールは vscode API に依存しない（単体テスト可能に保つ）。
 */

import { spawn, ChildProcess } from 'child_process';

/** 再接続バックオフの基準値（ms）。失敗回数に応じて指数的に伸びる */
export const CONTROL_MODE_RETRY_BASE_MS = 1000;

/** 再接続バックオフの上限（ms） */
export const CONTROL_MODE_RETRY_MAX_MS = 30000;

/** 連続失敗の上限。超えたら onFatal を呼び、呼び出し側はポーリングへフォールバック */
export const CONTROL_MODE_MAX_RETRIES = 5;

/** dispose 後、プロセスの exit を待つ猶予（ms）。超過したら SIGKILL で強制終了 */
export const CONTROL_MODE_FORCE_KILL_GRACE_MS = 3000;

/**
 * control mode 出力のパース結果
 */
export type ControlModeEvent =
    | { type: 'command-output'; text: string }
    | { type: 'error-output'; text: string }
    | { type: 'window-changed' }
    | { type: 'exit' };

/** 現在ウィンドウの再照会をトリガーする通知（先頭一致） */
const WINDOW_CHANGE_NOTIFICATIONS = [
    '%session-window-changed',
    '%window-renamed',
    '%session-changed',
    '%unlinked-window-renamed',
];

/**
 * control mode の行単位パーサ
 *
 * - `%begin ... %end`（または `%error`）ブロック: コマンド応答
 * - `%session-window-changed` 等: ウィンドウ変更通知
 * - `%exit`: サーバ切断
 */
export class ControlModeParser {
    private inBlock = false;
    private blockLines: string[] = [];

    feed(line: string): ControlModeEvent | null {
        if (this.inBlock) {
            if (line.startsWith('%end ') || line === '%end') {
                const text = this.blockLines.join('\n');
                this.reset();
                return { type: 'command-output', text };
            }
            if (line.startsWith('%error ') || line === '%error') {
                const text = this.blockLines.join('\n');
                this.reset();
                return { type: 'error-output', text };
            }
            this.blockLines.push(line);
            return null;
        }

        if (line.startsWith('%begin ') || line === '%begin') {
            this.inBlock = true;
            this.blockLines = [];
            return null;
        }
        if (line.startsWith('%exit') ) {
            return { type: 'exit' };
        }
        if (WINDOW_CHANGE_NOTIFICATIONS.some(prefix => line.startsWith(prefix))) {
            return { type: 'window-changed' };
        }
        return null;
    }

    private reset(): void {
        this.inBlock = false;
        this.blockLines = [];
    }
}

/**
 * ControlModeClient のオプション
 */
export interface ControlModeClientOptions {
    /** spawn するコマンド（例: Windows ホストなら 'wsl'、それ以外は 'tmux'） */
    command: string;
    /** spawn 引数（例: ['tmux', '-C', 'attach-session', '-t', SESSION]） */
    args: string[];
    /** 監視対象セッション名 */
    sessionName: string;
    /** 現在ウィンドウ名の受信コールバック */
    onWindowName: (name: string) => void;
    /** 連続失敗上限到達時のコールバック（ポーリングへのフォールバック等） */
    onFatal?: () => void;
    /** ログ出力（省略可） */
    onLog?: (msg: string) => void;
}

/**
 * tmux control mode 常駐クライアント
 *
 * 使い方:
 *   const client = new ControlModeClient({...});
 *   client.start();
 *   ...
 *   client.dispose();
 */
export class ControlModeClient {
    private readonly options: ControlModeClientOptions;
    private proc: ChildProcess | undefined;
    private parser = new ControlModeParser();
    private lineBuffer = '';
    private disposed = false;
    private consecutiveFailures = 0;
    private retryTimer: NodeJS.Timeout | undefined;

    constructor(options: ControlModeClientOptions) {
        this.options = options;
    }

    start(): void {
        if (this.disposed || this.proc) return;
        this.spawnProcess();
    }

    dispose(): void {
        this.disposed = true;
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = undefined;
        }
        this.killProcess();
    }

    private spawnProcess(): void {
        this.parser = new ControlModeParser();
        this.lineBuffer = '';

        const proc = spawn(this.options.command, this.options.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.proc = proc;

        proc.stdout?.on('data', (chunk: Buffer | string) => this.handleData(chunk));

        // exit と error の二重発火を防ぎつつ、error 単独（spawn 失敗等で exit が来ない）でも
        // 再接続・フォールバック経路に乗せる
        let downHandled = false;
        const onDown = (): void => {
            if (downHandled) return;
            downHandled = true;
            this.handleExit();
        };
        proc.on('error', (err: Error) => {
            this.log(`control mode spawn error: ${err.message}`);
            onDown();
        });
        proc.on('exit', onDown);

        // 初期状態の取得（接続直後の現在ウィンドウ名）
        this.queryCurrentWindow();
    }

    private killProcess(): void {
        if (!this.proc) return;
        const proc = this.proc;
        this.proc = undefined;

        try {
            proc.kill();
        } catch (err) {
            this.log(`control mode kill failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        // 猶予時間内に exit しない場合は強制終了（wsl.exe 残留＝宙ぶらりんプロセスの防止）
        const forceKillTimer = setTimeout(() => {
            try {
                proc.kill('SIGKILL');
                this.log('control mode: プロセスが終了しないため強制終了しました');
            } catch (err) {
                this.log(`control mode force kill failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }, CONTROL_MODE_FORCE_KILL_GRACE_MS);
        // exit したらエスカレーション不要
        proc.once('exit', () => clearTimeout(forceKillTimer));
        // タイマーがプロセス終了を妨げないようにする（テスト環境では unref が無い場合がある）
        forceKillTimer.unref?.();
    }

    /**
     * 現在のアクティブウィンドウ名を同一接続の stdin 経由で照会する
     * （新規プロセスは生成されない）
     */
    private queryCurrentWindow(): void {
        const cmd = `display-message -t ${this.options.sessionName} -p "#{window_name}"\n`;
        try {
            this.proc?.stdin?.write(cmd);
        } catch (err) {
            this.log(`control mode stdin write failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private handleData(chunk: Buffer | string): void {
        this.lineBuffer += chunk.toString();
        let newlineIndex = this.lineBuffer.indexOf('\n');
        while (newlineIndex >= 0) {
            const line = this.lineBuffer.slice(0, newlineIndex).replace(/\r$/, '');
            this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
            this.handleLine(line);
            newlineIndex = this.lineBuffer.indexOf('\n');
        }
    }

    private handleLine(line: string): void {
        const event = this.parser.feed(line);
        if (!event) return;

        switch (event.type) {
            case 'window-changed':
                this.queryCurrentWindow();
                break;
            case 'command-output': {
                const name = event.text.trim();
                if (name.length > 0) {
                    this.consecutiveFailures = 0;
                    this.options.onWindowName(name);
                }
                break;
            }
            case 'error-output':
                this.log(`control mode command error: ${event.text}`);
                break;
            case 'exit':
                // この後プロセスの exit イベントで再接続処理される
                break;
        }
    }

    private handleExit(): void {
        this.proc = undefined;
        if (this.disposed) return;

        this.consecutiveFailures++;
        if (this.consecutiveFailures >= CONTROL_MODE_MAX_RETRIES) {
            this.log(`control mode: 連続${this.consecutiveFailures}回失敗。フォールバックします`);
            this.options.onFatal?.();
            return;
        }

        const delay = Math.min(
            CONTROL_MODE_RETRY_BASE_MS * 2 ** (this.consecutiveFailures - 1),
            CONTROL_MODE_RETRY_MAX_MS
        );
        this.log(`control mode: 切断検出。${delay}ms 後に再接続します（${this.consecutiveFailures}回目）`);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (!this.disposed) {
                this.spawnProcess();
            }
        }, delay);
    }

    private log(msg: string): void {
        this.options.onLog?.(`[control-mode] ${msg}`);
    }
}
