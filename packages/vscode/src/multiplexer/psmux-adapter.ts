import { AbstractMultiplexerAdapter } from './base-adapter';
import { MultiplexerType } from './interfaces';

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

    /**
     * copy-mode-timeout を設定
     * psmux での対応状況に応じてオーバーライド
     */
    protected override setCopyModeTimeout(): void {
        try {
            // psmux が copy-mode-timeout をサポートしているか確認
            this.exec(`set-option -t ${this.sessionName} -g copy-mode-timeout 5`);
        } catch {
            // サポートされていない場合は無視
        }
    }

    // ========== PsmuxAdapter 固有のメソッド ==========

    /**
     * tmux エイリアスを使用しているかどうか
     */
    isUsingTmuxAlias(): boolean {
        return this.useTmuxAlias;
    }
}
