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

    // setCopyModeTimeout は base-adapter の実装をそのまま使用（冗長オーバーライド削除）

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
    }

    /**
     * psmux用のsendKeys（PowerShellからPowerShellウィンドウへ送信）
     * base-adapterはbash向けエスケープを使うため、psmux用にオーバーライド
     */
    override sendKeys(windowName: string, keys: string, pressEnter: boolean = true): void {
        // 改行を空白に置換
        const noNewlines = keys.replace(/\r?\n/g, ' ');
        // PowerShellでpsmux send-keysを実行する際、ダブルクォートを使用
        // $, `, " をPowerShell向けにエスケープ
        const escapedKeys = escapeForDoubleQuote(noNewlines, 'powershell');
        const enterSuffix = pressEnter ? ' Enter' : '';
        this.exec(`send-keys -t ${this.sessionName}:${windowName} "${escapedKeys}"${enterSuffix}`);
    }
}
