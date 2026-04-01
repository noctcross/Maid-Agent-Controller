/**
 * TerminalFactory - VSCodeターミナル生成の環境別分岐を統一
 *
 * psmux/WslTmux/NativeTmux の3環境に対応した
 * ターミナル生成ファクトリを提供する。
 */
import * as vscode from 'vscode';
import { ENV } from './environment-context';

// =============================================================================
// Interface
// =============================================================================

export interface ITerminalFactory {
    /** マルチプレクサにアタッチするビューアターミナルを作成 */
    createViewerTerminal(
        name: string,
        sessionName: string,
        workspaceRoot?: string,
    ): vscode.Terminal;

    /** ツールインストール用ターミナルを作成 */
    createInstallTerminal(name: string): vscode.Terminal;

    /** マルチプレクサのインストール手順を表示 */
    showMultiplexerInstallInstructions(outputChannel: vscode.OutputChannel): void;
}

// =============================================================================
// Implementations
// =============================================================================

/** psmux 環境（Windows PowerShell ネイティブ） */
class PsmuxTerminalFactory implements ITerminalFactory {
    createViewerTerminal(
        name: string,
        sessionName: string,
        workspaceRoot?: string,
    ): vscode.Terminal {
        return vscode.window.createTerminal({
            name,
            shellPath: 'powershell.exe',
            shellArgs: ['-NoProfile', '-Command', `psmux attach-session -t ${sessionName}`],
            cwd: workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined,
        });
    }

    createInstallTerminal(name: string): vscode.Terminal {
        return vscode.window.createTerminal({ name });
    }

    showMultiplexerInstallInstructions(outputChannel: vscode.OutputChannel): void {
        outputChannel.appendLine('【Windows PowerShell 環境】');
        outputChannel.appendLine('  psmux は別途インストールが必要です:');
        outputChannel.appendLine('    winget install psmux');
        outputChannel.appendLine('');
        outputChannel.appendLine('  インストール後、Init Global を再実行してください。');
    }
}

/** WSL経由 tmux 環境（Windows + WSL） */
class WslTmuxTerminalFactory implements ITerminalFactory {
    createViewerTerminal(
        name: string,
        sessionName: string,
        workspaceRoot?: string,
    ): vscode.Terminal {
        const wslPath = workspaceRoot ? ENV.windowsToWslPath(workspaceRoot) : '~';
        return vscode.window.createTerminal({
            name,
            shellPath: 'wsl.exe',
            shellArgs: ['-e', 'bash', '-c', `cd "${wslPath}" && tmux attach-session -t ${sessionName}`],
        });
    }

    createInstallTerminal(name: string): vscode.Terminal {
        return vscode.window.createTerminal({
            name,
            shellPath: 'wsl.exe',
        });
    }

    showMultiplexerInstallInstructions(outputChannel: vscode.OutputChannel): void {
        outputChannel.appendLine('【Windows + WSL 環境】');
        outputChannel.appendLine('  WSL内で以下のコマンドを実行してください:');
        outputChannel.appendLine('    sudo apt-get update && sudo apt-get install -y tmux');
        outputChannel.appendLine('');
        outputChannel.appendLine('  インストール後、Init Global を再実行してください。');
    }
}

/** ネイティブ tmux 環境（macOS / Linux） */
class NativeTmuxTerminalFactory implements ITerminalFactory {
    createViewerTerminal(
        name: string,
        sessionName: string,
        workspaceRoot?: string,
    ): vscode.Terminal {
        const terminal = vscode.window.createTerminal({
            name,
            cwd: workspaceRoot,
        });
        terminal.sendText(`tmux attach-session -t ${sessionName}`);
        return terminal;
    }

    createInstallTerminal(name: string): vscode.Terminal {
        return vscode.window.createTerminal({ name });
    }

    showMultiplexerInstallInstructions(outputChannel: vscode.OutputChannel): void {
        if (ENV.isMacOS()) {
            outputChannel.appendLine('【macOS 環境】');
            outputChannel.appendLine('  Homebrew で tmux をインストール:');
            outputChannel.appendLine('    brew install tmux');
        } else {
            outputChannel.appendLine('【Linux 環境】');
            outputChannel.appendLine('  パッケージマネージャで tmux をインストール:');
            outputChannel.appendLine('    sudo apt-get update && sudo apt-get install -y tmux');
            outputChannel.appendLine('  または:');
            outputChannel.appendLine('    sudo dnf install -y tmux');
        }
        outputChannel.appendLine('');
        outputChannel.appendLine('  インストール後、Init Global を再実行してください。');
    }
}

// =============================================================================
// Factory function
// =============================================================================

/**
 * 現在の環境とランタイムモードに応じた TerminalFactory を生成
 *
 * @param isPsmux psmuxモードかどうか（RuntimeModeに基づく判定）
 */
export function createTerminalFactory(isPsmux: boolean = false): ITerminalFactory {
    if (ENV.isWindowsNative()) {
        if (isPsmux) {
            return new PsmuxTerminalFactory();
        }
        return new WslTmuxTerminalFactory();
    }
    return new NativeTmuxTerminalFactory();
}
