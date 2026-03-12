import { execSync, exec } from 'child_process';
import { CURRENT_ENV, windowsToWslPath } from '../utils/environment';
import { TMUX_SESSION_PREFIX } from '../constants';

// =============================================================================
// Tmux マネージャー
// =============================================================================

export class TmuxManager {
    private sessionName: string;
    private workingDirectory: string;      // 元のパス（Windows or WSL）
    private wslWorkingDirectory: string;   // WSL用パス
    private isWindowsNative: boolean;

    constructor(sessionName: string, workingDirectory: string) {
        this.sessionName = sessionName;
        this.workingDirectory = workingDirectory;
        this.isWindowsNative = CURRENT_ENV === 'windows-native';

        // Windows環境の場合はパスをWSL形式に変換
        this.wslWorkingDirectory = this.isWindowsNative
            ? windowsToWslPath(workingDirectory)
            : workingDirectory;
    }

    /**
     * tmuxコマンドを構築
     */
    private buildCommand(args: string): string {
        if (this.isWindowsNative) {
            // Windows環境: wsl経由でtmuxを実行
            return `wsl tmux ${args}`;
        }
        return `tmux ${args}`;
    }

    /**
     * tmuxコマンドを実行
     */
    private exec(args: string): string {
        try {
            const command = this.buildCommand(args);
            // Windows環境ではcwdを指定しない（WSL内のパスとして渡す）
            const options: any = { encoding: 'utf-8' };
            if (!this.isWindowsNative) {
                options.cwd = this.workingDirectory;
            }
            return execSync(command, options).trim();
        } catch (error: any) {
            // tmuxコマンドが失敗した場合（セッションが存在しない等）
            throw new Error(`tmux command failed: ${error.message}`);
        }
    }

    /**
     * tmuxコマンドを非同期で実行（結果を待たない）
     */
    private execAsync(args: string): void {
        const command = this.buildCommand(args);
        const options: any = {};
        if (!this.isWindowsNative) {
            options.cwd = this.workingDirectory;
        }
        exec(command, options);
    }

    /**
     * WSL用の作業ディレクトリを取得
     */
    getWslWorkingDirectory(): string {
        return this.wslWorkingDirectory;
    }

    /**
     * Windows環境かどうか
     */
    isWindows(): boolean {
        return this.isWindowsNative;
    }

    /**
     * セッションが存在するかチェック
     */
    sessionExists(): boolean {
        try {
            this.exec(`has-session -t ${this.sessionName}`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * セッションを作成（存在しない場合）
     */
    createSession(): void {
        if (!this.sessionExists()) {
            this.exec(`new-session -d -s ${this.sessionName} -c "${this.wslWorkingDirectory}"`);
            // copy-mode-timeout を設定（スクロール中の通知配信改善）
            // セッション固有の設定なので .tmux.conf を変更しない
            try {
                this.exec(`set-option -t ${this.sessionName} -g copy-mode-timeout 5`);
            } catch {
                // tmux 3.2 未満では copy-mode-timeout がサポートされていない
            }
        }
    }

    /**
     * セッションを終了
     */
    killSession(): void {
        if (this.sessionExists()) {
            try {
                this.exec(`kill-session -t ${this.sessionName}`);
            } catch {
                // セッションが既に終了している場合は無視
            }
        }
    }

    /**
     * maid-agentセッションの数を取得（静的メソッド）
     */
    static countMaidAgentSessions(): { count: number; sessions: string[] } {
        try {
            const command = CURRENT_ENV === 'windows-native'
                ? 'wsl tmux list-sessions -F "#{session_name}"'
                : 'tmux list-sessions -F "#{session_name}"';

            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: 'pipe'
            }).trim();

            if (!result) {
                return { count: 0, sessions: [] };
            }

            const allSessions = result.split('\n');
            const maidSessions = allSessions.filter(name => name.startsWith(TMUX_SESSION_PREFIX));

            return {
                count: maidSessions.length,
                sessions: maidSessions
            };
        } catch {
            // tmuxサーバーが起動していない場合など
            return { count: 0, sessions: [] };
        }
    }

    /**
     * 新しいウィンドウを作成
     */
    createWindow(windowName: string): void {
        this.exec(`new-window -t ${this.sessionName} -n ${windowName} -c "${this.wslWorkingDirectory}"`);
    }

    /**
     * ウィンドウが存在するかチェック
     */
    windowExists(windowName: string): boolean {
        try {
            const windows = this.exec(`list-windows -t ${this.sessionName} -F "#{window_name}"`);
            return windows.split('\n').includes(windowName);
        } catch {
            return false;
        }
    }

    /**
     * ウィンドウを終了
     */
    killWindow(windowName: string): void {
        if (this.windowExists(windowName)) {
            try {
                this.exec(`kill-window -t ${this.sessionName}:${windowName}`);
            } catch {
                // ウィンドウが既に終了している場合は無視
            }
        }
    }

    /**
     * 指定ウィンドウにキー入力を送信
     */
    sendKeys(windowName: string, keys: string, pressEnter: boolean = true): void {
        // 改行を空白に置換（シェルコマンドとして実行する際に改行があると分断される）
        const noNewlines = keys.replace(/\r?\n/g, ' ');
        // シングルクォートをエスケープ
        const escapedKeys = noNewlines.replace(/'/g, "'\\''");
        const enterSuffix = pressEnter ? ' Enter' : '';
        this.exec(`send-keys -t ${this.sessionName}:${windowName} '${escapedKeys}'${enterSuffix}`);
    }

    /**
     * copy mode（スクロールモード）を解除
     * ユーザーがマウススクロールした場合、copy modeに入っている可能性がある
     */
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

    /**
     * 指定ウィンドウの出力をキャプチャ
     */
    capturePane(windowName: string, lines: number = 100): string {
        try {
            return this.exec(`capture-pane -t ${this.sessionName}:${windowName} -p -S -${lines}`);
        } catch {
            return '';
        }
    }

    /**
     * 指定ウィンドウに切り替え
     */
    selectWindow(windowName: string): void {
        this.exec(`select-window -t ${this.sessionName}:${windowName}`);
    }

    /**
     * セッション内の全ウィンドウ名を取得
     */
    listWindows(): string[] {
        try {
            const result = this.exec(`list-windows -t ${this.sessionName} -F "#{window_name}"`);
            return result.split('\n').filter(name => name.length > 0);
        } catch {
            return [];
        }
    }

    /**
     * セッション名を取得
     */
    getSessionName(): string {
        return this.sessionName;
    }
}
