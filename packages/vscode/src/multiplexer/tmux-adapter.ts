import { AbstractMultiplexerAdapter } from './base-adapter';
import { MultiplexerType } from './interfaces';
import { windowsToWslPath } from '../utils/environment';
import type { ShellType } from '../utils/shell-escape';

/**
 * tmux 用アダプター（WSL/Linux/macOS環境）
 */
export class TmuxAdapter extends AbstractMultiplexerAdapter {
    private isWindowsHost: boolean;
    private wslWorkingDirectory: string;

    /**
     * @param sessionName セッション名
     * @param workingDirectory 作業ディレクトリ
     * @param isWindowsHost Windows ホストから WSL 経由で実行するか
     */
    constructor(sessionName: string, workingDirectory: string, isWindowsHost: boolean = false) {
        super(sessionName, workingDirectory);
        this.isWindowsHost = isWindowsHost;
        // Windows環境の場合はパスをWSL形式に変換
        this.wslWorkingDirectory = isWindowsHost
            ? windowsToWslPath(workingDirectory)
            : workingDirectory;
    }

    getMultiplexerType(): MultiplexerType {
        return 'tmux';
    }

    protected override getShellType(): ShellType {
        // Windows環境: cmd.exe経由で実行されるため cmd を返す
        return this.isWindowsHost ? 'cmd' : 'bash';
    }

    protected getCommandPrefix(): string {
        // Windows環境: wsl経由でtmuxを実行
        return this.isWindowsHost ? 'wsl tmux' : 'tmux';
    }

    protected getCommandWorkingDirectory(): string {
        return this.wslWorkingDirectory;
    }

    protected getExecOptions(): Record<string, unknown> {
        // Windows ホストの場合は cwd を指定しない（WSL内パスとして渡す）
        if (this.isWindowsHost) {
            return {};
        }
        return { cwd: this.workingDirectory };
    }

    // ========== TmuxAdapter 固有のメソッド ==========

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
        return this.isWindowsHost;
    }
}
