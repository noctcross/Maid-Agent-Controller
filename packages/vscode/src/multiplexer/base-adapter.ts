import { execSync, exec } from 'child_process';
import { ITerminalMultiplexer, MultiplexerType } from './interfaces';

/**
 * マルチプレクサの共通実装
 * tmux/psmux 共通のコマンド構造を活用した抽象基底クラス
 */
export abstract class AbstractMultiplexerAdapter implements ITerminalMultiplexer {
    protected sessionName: string;
    protected workingDirectory: string;

    constructor(sessionName: string, workingDirectory: string) {
        this.sessionName = sessionName;
        this.workingDirectory = workingDirectory;
    }

    /**
     * マルチプレクサの種類を取得
     */
    abstract getMultiplexerType(): MultiplexerType;

    /**
     * コマンドプレフィックスを取得（tmux or psmux or wsl tmux）
     */
    protected abstract getCommandPrefix(): string;

    /**
     * 作業ディレクトリをコマンド用に変換
     */
    protected abstract getCommandWorkingDirectory(): string;

    /**
     * コマンド実行オプションを取得
     */
    protected abstract getExecOptions(): Record<string, unknown>;

    /**
     * コマンドを構築
     */
    protected buildCommand(args: string): string {
        return `${this.getCommandPrefix()} ${args}`;
    }

    /**
     * コマンドを同期実行
     */
    protected exec(args: string): string {
        const command = this.buildCommand(args);
        try {
            return execSync(command, {
                encoding: 'utf-8',
                ...this.getExecOptions(),
            }).trim();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${this.getMultiplexerType()} command failed: ${message}`);
        }
    }

    /**
     * コマンドを非同期で実行（結果を待たない）
     */
    protected execAsync(args: string): void {
        const command = this.buildCommand(args);
        exec(command, this.getExecOptions());
    }

    // ========== セッション管理 ==========

    sessionExists(): boolean {
        try {
            this.exec(`has-session -t ${this.sessionName}`);
            return true;
        } catch {
            return false;
        }
    }

    createSession(): void {
        if (!this.sessionExists()) {
            const dir = this.getCommandWorkingDirectory();
            this.exec(`new-session -d -s ${this.sessionName} -c "${dir}"`);
            // copy-mode-timeout を設定（スクロール中の通知配信改善）
            this.setCopyModeTimeout();
        }
    }

    /**
     * copy-mode-timeout を設定（サブクラスでオーバーライド可能）
     */
    protected setCopyModeTimeout(): void {
        try {
            this.exec(`set-option -t ${this.sessionName} -g copy-mode-timeout 5`);
        } catch {
            // tmux 3.2 未満では copy-mode-timeout がサポートされていない
        }
    }

    killSession(): void {
        if (this.sessionExists()) {
            try {
                this.exec(`kill-session -t ${this.sessionName}`);
            } catch {
                // セッションが既に終了している場合は無視
            }
        }
    }

    getSessionName(): string {
        return this.sessionName;
    }

    // ========== ウィンドウ管理 ==========

    windowExists(windowName: string): boolean {
        try {
            const windows = this.exec(`list-windows -t ${this.sessionName} -F "#{window_name}"`);
            return windows.split('\n').includes(windowName);
        } catch {
            return false;
        }
    }

    createWindow(windowName: string): void {
        const dir = this.getCommandWorkingDirectory();
        this.exec(`new-window -t ${this.sessionName} -n ${windowName} -c "${dir}"`);
    }

    killWindow(windowName: string): void {
        if (this.windowExists(windowName)) {
            try {
                this.exec(`kill-window -t ${this.sessionName}:${windowName}`);
            } catch {
                // ウィンドウが既に終了している場合は無視
            }
        }
    }

    listWindows(): string[] {
        try {
            const result = this.exec(`list-windows -t ${this.sessionName} -F "#{window_name}"`);
            return result.split('\n').filter(name => name.length > 0);
        } catch {
            return [];
        }
    }

    selectWindow(windowName: string): void {
        this.exec(`select-window -t ${this.sessionName}:${windowName}`);
    }

    // ========== キー送信 ==========

    sendKeys(windowName: string, keys: string, pressEnter: boolean = true): void {
        // 改行を空白に置換（シェルコマンドとして実行する際に改行があると分断される）
        const noNewlines = keys.replace(/\r?\n/g, ' ');
        // シングルクォートをエスケープ
        const escapedKeys = noNewlines.replace(/'/g, "'\\''");
        const enterSuffix = pressEnter ? ' Enter' : '';
        this.exec(`send-keys -t ${this.sessionName}:${windowName} '${escapedKeys}'${enterSuffix}`);
    }

    cancelCopyMode(windowName: string): void {
        try {
            // -X cancel でcopy modeをキャンセル
            this.exec(`send-keys -t ${this.sessionName}:${windowName} -X cancel`);
        } catch {
            // copy modeでない場合はエラーになるが無視
        }
        try {
            // 念のためEscapeも送信
            this.exec(`send-keys -t ${this.sessionName}:${windowName} Escape`);
        } catch {
            // 無視
        }
    }

    // ========== その他 ==========

    capturePane(windowName: string, lines: number = 100): string {
        try {
            return this.exec(`capture-pane -t ${this.sessionName}:${windowName} -p -S -${lines}`);
        } catch {
            return '';
        }
    }

    getWorkingDirectory(): string {
        return this.workingDirectory;
    }
}
