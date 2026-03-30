import { execSync, exec } from 'child_process';
import { ITerminalMultiplexer, MultiplexerType } from './interfaces';
import { escapeForDoubleQuote, type ShellType } from '../utils/shell-escape';

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
     * シェル種別を取得（エスケープ処理で使用）
     */
    protected getShellType(): ShellType {
        return this.getMultiplexerType() === 'psmux' ? 'powershell' : 'bash';
    }

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
            // セッションが存在しない場合 has-session はエラーを返す（正常動作）
            return false;
        }
    }

    createSession(): void {
        if (!this.sessionExists()) {
            const dir = this.getCommandWorkingDirectory();
            const escapedDir = escapeForDoubleQuote(dir, this.getShellType());
            this.exec(`new-session -d -s ${this.sessionName} -c "${escapedDir}"`);
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
            // tmux 3.2 未満では copy-mode-timeout がサポートされていないため無視
        }
    }

    killSession(): void {
        if (this.sessionExists()) {
            try {
                this.exec(`kill-session -t ${this.sessionName}`);
            } catch {
                // sessionExists()とkill-sessionの間にセッションが終了する場合があるため無視
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
            // セッションが存在しない場合 list-windows はエラーを返す（正常動作）
            return false;
        }
    }

    createWindow(windowName: string): void {
        const dir = this.getCommandWorkingDirectory();
        const escapedDir = escapeForDoubleQuote(dir, this.getShellType());
        this.exec(`new-window -t ${this.sessionName} -n ${windowName} -c "${escapedDir}"`);
        // ウィンドウ名の自動更新を無効化（claudeプロセス名で上書きされるのを防ぐ）
        try {
            this.exec(`set-window-option -t ${this.sessionName}:${windowName} automatic-rename off`);
        } catch {
            // automatic-rename オプションがサポートされていない環境では無視
        }
    }

    killWindow(windowName: string): void {
        if (this.windowExists(windowName)) {
            try {
                this.exec(`kill-window -t ${this.sessionName}:${windowName}`);
            } catch {
                // windowExists()とkill-windowの間にウィンドウが終了する場合があるため無視
            }
        }
    }

    listWindows(): string[] {
        try {
            const result = this.exec(`list-windows -t ${this.sessionName} -F "#{window_name}"`);
            return result.split('\n').filter(name => name.length > 0);
        } catch {
            // セッションが存在しない場合 list-windows はエラーを返す（正常動作）
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
            // copy modeでない場合は -X cancel がエラーになるため無視
        }
        try {
            // 念のためEscapeも送信
            this.exec(`send-keys -t ${this.sessionName}:${windowName} Escape`);
        } catch {
            // Escape送信失敗はウィンドウ不在等の非致命的エラーのため無視
        }
    }

    // ========== その他 ==========

    capturePane(windowName: string, lines: number = 100): string {
        try {
            return this.exec(`capture-pane -t ${this.sessionName}:${windowName} -p -S -${lines}`);
        } catch {
            // ウィンドウ不在やキャプチャ不可能な状態では空文字を返す（正常動作）
            return '';
        }
    }

    getWorkingDirectory(): string {
        return this.workingDirectory;
    }
}
