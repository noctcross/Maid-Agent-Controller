/**
 * CommandExecutor - 環境に応じたシェルコマンド実行の抽象化
 *
 * Windows環境ではWSL経由、それ以外ではネイティブ実行。
 * 散在する execSync + 環境分岐パターンを統一する。
 */
import { execSync, type ExecSyncOptions } from 'child_process';
import { ENV } from './environment-context';
import { escapeForDoubleQuote } from './shell-escape';

// =============================================================================
// Interface
// =============================================================================

export interface ICommandExecutor {
    /** ログインシェルでコマンド実行（stdout返却） */
    execInLoginShell(command: string, options?: ExecSyncOptions): string;

    /** コマンドの存在確認 */
    commandExists(command: string): boolean;

    /** sudo付き実行（パスワードなし） */
    execWithSudoNoPassword(command: string, options?: ExecSyncOptions): string;
}

// =============================================================================
// WSL Implementation（Windows環境用）
// =============================================================================

export class WslCommandExecutor implements ICommandExecutor {
    execInLoginShell(command: string, options?: ExecSyncOptions): string {
        const escaped = escapeForDoubleQuote(command, 'bash');
        return execSync(`wsl bash -lc "${escaped}"`, {
            encoding: 'utf-8',
            ...options,
        }).trim();
    }

    commandExists(command: string): boolean {
        try {
            this.execInLoginShell(`which ${command}`);
            return true;
        } catch {
            // コマンド未インストール
            return false;
        }
    }

    execWithSudoNoPassword(command: string, options?: ExecSyncOptions): string {
        return this.execInLoginShell(`sudo -n ${command}`, options);
    }
}

// =============================================================================
// Native Implementation（Mac/Linux/WSL環境用）
// =============================================================================

export class NativeCommandExecutor implements ICommandExecutor {
    private getLoginShell(): string {
        const userShell = process.env.SHELL || '';
        const supportedShells = ['/bin/bash', '/bin/zsh', '/usr/bin/bash', '/usr/bin/zsh'];
        return supportedShells.includes(userShell) ? userShell : 'bash';
    }

    execInLoginShell(command: string, options?: ExecSyncOptions): string {
        const shell = this.getLoginShell();
        const escaped = escapeForDoubleQuote(command, 'bash');
        return execSync(`${shell} -lc "${escaped}"`, {
            encoding: 'utf-8',
            ...options,
        }).trim();
    }

    commandExists(command: string): boolean {
        try {
            this.execInLoginShell(`which ${command}`);
            return true;
        } catch {
            // コマンド未インストール
            return false;
        }
    }

    execWithSudoNoPassword(command: string, options?: ExecSyncOptions): string {
        return this.execInLoginShell(`sudo -n ${command}`, options);
    }
}

// =============================================================================
// Factory
// =============================================================================

/** 環境に応じた CommandExecutor を生成 */
export function createCommandExecutor(): ICommandExecutor {
    return ENV.isWindowsNative()
        ? new WslCommandExecutor()
        : new NativeCommandExecutor();
}
