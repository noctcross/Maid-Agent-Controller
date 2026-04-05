import { AbstractMultiplexerAdapter } from './base-adapter';
import { MultiplexerType } from './interfaces';
import { escapeForDoubleQuote } from '../utils/shell-escape';

/**
 * psmux 用アダプター（Windows ネイティブ環境）
 *
 * psmux は tmux と同じコマンド体系を採用しているため、
 * コマンド文字列自体は同一。違いは実行方法（PowerShell）とパス形式のみ。
 */
export class PsmuxAdapter extends AbstractMultiplexerAdapter {
    private useTmuxAlias: boolean;

    /**
     * @param sessionName セッション名
     * @param workingDirectory 作業ディレクトリ（Windows パス）
     * @param useTmuxAlias psmux の tmux エイリアスを使用するか（既存スクリプト互換用）
     */
    constructor(sessionName: string, workingDirectory: string, useTmuxAlias: boolean = false) {
        super(sessionName, workingDirectory);
        this.useTmuxAlias = useTmuxAlias;
    }

    getMultiplexerType(): MultiplexerType {
        return 'psmux';
    }

    protected getCommandPrefix(): string {
        // psmux は tmux エイリアスを提供可能
        return this.useTmuxAlias ? 'tmux' : 'psmux';
    }

    protected getCommandWorkingDirectory(): string {
        // Windows パスをそのまま使用
        return this.workingDirectory;
    }

    protected getExecOptions(): Record<string, unknown> {
        return {
            cwd: this.workingDirectory,
            shell: 'powershell.exe',  // PowerShell で実行
        };
    }

    // ========== ステータスバー書式（psmux用シンプル版） ==========

    /**
     * psmux用ステータスバー1行目
     * psmuxでは #[list], #[range], #{T:...} の一部が未実装のため、
     * #{W:...} ループと #{?...} 条件分岐で自前構成
     */
    protected override getStatusFormatLine1(): string {
        return '#{W:#{?#{==:#{window_index},#{active_window_index}},#[fg=white bg=blue bold] #{window_index}:#{=8:window_name} #[default], #{window_index}:#{=8:window_name} }}';
    }

    /**
     * psmux用ステータスバー2行目
     * psmuxでは #[align=...] が未実装のため、左寄せのみで構成
     */
    protected override getStatusFormatLine2(): string {
        return '[#{session_name}] #{pane_current_path} | %Y-%m-%d %H:%M';
    }

    // ========== PsmuxAdapter 固有のメソッド ==========

    /**
     * tmux エイリアスを使用しているかどうか
     */
    isUsingTmuxAlias(): boolean {
        return this.useTmuxAlias;
    }

    /**
     * psmux用のcreateWindow - PowerShellで開く
     * デフォルトのcmd.exeではClaude CodeのPATHが通っていないため
     */
    override createWindow(windowName: string): void {
        const dir = this.getCommandWorkingDirectory();
        const escapedDir = escapeForDoubleQuote(dir, 'powershell');
        // PowerShellを指定してウィンドウを作成
        this.exec(`new-window -t ${this.sessionName} -n ${windowName} -c "${escapedDir}" powershell.exe`);
        // ウィンドウ名の自動更新を無効化（claudeプロセス名で上書きされるのを防ぐ）
        try {
            this.exec(`set-window-option -t ${this.sessionName}:${windowName} automatic-rename off`);
        } catch {
            // オプションがサポートされていない場合は無視
        }
        // rename-window で manual_rename フラグを設定し、プロセス名による上書きを防止
        try {
            this.exec(`rename-window -t ${this.sessionName}:${windowName} ${windowName}`);
        } catch {
            // rename-window 失敗時は無視（ウィンドウ名は new-window の -n で設定済み）
        }
    }

    /**
     * psmux用のsendKeys（PowerShellからPowerShellウィンドウへ送信）
     * base-adapterはbash向けエスケープを使うため、psmux用にオーバーライド
     * PowerShell起動遅延に対応するリトライ機構付き（P-1対応）
     */
    override sendKeys(windowName: string, keys: string, pressEnter: boolean = true): void {
        // 改行を空白に置換
        const noNewlines = keys.replace(/\r?\n/g, ' ');
        // PowerShellでpsmux send-keysを実行する際、ダブルクォートを使用
        // $, `, " をPowerShell向けにエスケープ
        const escapedKeys = escapeForDoubleQuote(noNewlines, 'powershell');
        const enterSuffix = pressEnter ? ' Enter' : '';
        const command = `send-keys -t ${this.sessionName}:${windowName} "${escapedKeys}"${enterSuffix}`;

        // PowerShell起動遅延でウィンドウが準備できていない場合のリトライ
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 500;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                this.exec(command);
                return;
            } catch (error) {
                if (attempt === MAX_RETRIES) {
                    throw error;
                }
                // PowerShellウィンドウの準備待ち
                const { execSync } = require('child_process');
                execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${RETRY_DELAY_MS}"`, {
                    windowsHide: true,
                });
            }
        }
    }
}
