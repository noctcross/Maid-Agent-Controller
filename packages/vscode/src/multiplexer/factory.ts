import { execSync } from 'child_process';
import { ITerminalMultiplexer, IMultiplexerFactory, MultiplexerType, MultiplexerConfig } from './interfaces';
import { TmuxAdapter } from './tmux-adapter';
import { PsmuxAdapter } from './psmux-adapter';
import { ENV } from '../utils/environment';
import { TMUX_SESSION_PREFIX } from '../constants';
import { getSavedRuntimeMode } from '../setup/global-init';

/**
 * マルチプレクサファクトリー
 * 環境に応じて適切なマルチプレクサアダプターを生成
 */
export class MultiplexerFactory implements IMultiplexerFactory {
    private config: MultiplexerConfig;

    /**
     * @param config マルチプレクサ設定（省略時は自動検出）
     */
    constructor(config?: MultiplexerConfig) {
        this.config = config ?? this.detectConfig();
    }

    /**
     * 環境から設定を自動検出
     */
    private detectConfig(): MultiplexerConfig {
        // 環境変数で明示的に指定されている場合
        const envMultiplexer = process.env['MAID_MULTIPLEXER'];
        if (envMultiplexer === 'psmux') {
            const useTmuxAlias = process.env['MAID_PSMUX_ALIAS'] === 'true';
            return { type: 'psmux', useTmuxAlias };
        }
        if (envMultiplexer === 'tmux') {
            return { type: 'tmux' };
        }

        // Windows環境: 保存されたランタイムモードに基づいて判定
        if (ENV.isWindowsNative()) {
            const runtimeMode = getSavedRuntimeMode();
            if (runtimeMode === 'windows-native') {
                // Psmuxモード: psmuxが利用可能なら使用
                if (this.isPsmuxAvailable()) {
                    return { type: 'psmux' };
                }
            }
            // WSLモードまたはpsmuxが利用できない場合はtmux（WSL経由）
            return { type: 'tmux' };
        }

        // Mac/Linux: tmux
        return { type: 'tmux' };
    }

    /**
     * psmux が利用可能かチェック
     */
    private isPsmuxAvailable(): boolean {
        try {
            execSync('psmux -V', {
                encoding: 'utf-8',
                stdio: 'pipe',
                shell: 'powershell.exe'
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * マルチプレクサインスタンスを生成
     */
    create(sessionName: string, workingDirectory: string): ITerminalMultiplexer {
        if (this.config.type === 'psmux') {
            return new PsmuxAdapter(sessionName, workingDirectory, this.config.useTmuxAlias);
        }

        // tmux の場合
        const isWindowsHost = ENV.isWindowsNative();
        return new TmuxAdapter(sessionName, workingDirectory, isWindowsHost);
    }

    /**
     * maid-agentセッションの数を取得
     */
    countMaidAgentSessions(): { count: number; sessions: string[] } {
        try {
            const command = this.buildListSessionsCommand();
            const options = this.getListSessionsExecOptions();

            const result = execSync(command, {
                encoding: 'utf-8',
                stdio: 'pipe',
                ...options
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
            // サーバーが起動していない場合など
            return { count: 0, sessions: [] };
        }
    }

    /**
     * セッション一覧取得コマンドを構築
     */
    private buildListSessionsCommand(): string {
        if (this.config.type === 'psmux') {
            const cmd = this.config.useTmuxAlias ? 'tmux' : 'psmux';
            return `${cmd} list-sessions -F "#{session_name}"`;
        }

        // tmux の場合
        if (ENV.isWindowsNative()) {
            return 'wsl tmux list-sessions -F "#{session_name}"';
        }
        return 'tmux list-sessions -F "#{session_name}"';
    }

    /**
     * セッション一覧取得の実行オプション
     */
    private getListSessionsExecOptions(): Record<string, unknown> {
        if (this.config.type === 'psmux') {
            return { shell: 'powershell.exe' };
        }
        return {};
    }

    /**
     * マルチプレクサの種類を取得
     */
    getType(): MultiplexerType {
        return this.config.type;
    }

    /**
     * 現在の設定を取得
     */
    getConfig(): MultiplexerConfig {
        return { ...this.config };
    }
}
