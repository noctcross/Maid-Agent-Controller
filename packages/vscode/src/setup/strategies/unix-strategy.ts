/**
 * Unix セットアップ戦略
 *
 * WSL / Mac / Linux 共通の実行モード。
 * - runShellCommand 経由でコマンド実行（WSLはwsl bash -lc経由）
 * - apt / brew / バイナリダウンロードでパッケージインストール
 * - sudo 必要な操作あり
 * - .bashrc / .zshrc にPATH設定
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext } from '../../types';
import { UnixSetupStrategy } from './types';
import { CURRENT_ENV } from '../../utils/environment';
import { runShellCommand, getMessengerShellPath } from '../pm2-setup';
import { detectPackageManager, PM_CONFIG } from '../../utils/package-manager';

export class UnixStrategy implements UnixSetupStrategy {
    readonly name = 'unix' as const;

    /**
     * jq インストール（apt / brew）
     */
    async installJq(ctx: SetupContext, password?: string): Promise<void> {
        ctx.log('[Unix] jq をインストール中...');

        if (CURRENT_ENV === 'macos') {
            // macOS: brew install（sudo不要）
            try {
                runShellCommand('brew install jq', { stdio: 'pipe' });
                ctx.log('[Unix] jqインストール完了（brew）');
            } catch (error) {
                ctx.log(`[Unix] jqインストール失敗: ${error}`);
                throw new Error('jqインストールに失敗しました（brew install jq を手動実行してください）');
            }
            return;
        }

        // Linux / WSL: apt install（sudo必要）
        if (!password) {
            throw new Error('パスワードが必要です');
        }

        try {
            const cmd = `echo '${password}' | sudo -S apt-get update && echo '${password}' | sudo -S apt-get install -y jq`;
            this.execWithSudo(cmd, password);
            ctx.log('[Unix] jqインストール完了（apt）');
        } catch (error) {
            ctx.log(`[Unix] jqインストール失敗: ${error}`);
            throw new Error('jqインストールに失敗しました');
        }
    }

    /**
     * yq インストール（brew / バイナリダウンロード）
     */
    async installYq(ctx: SetupContext, password?: string): Promise<void> {
        ctx.log('[Unix] yq をインストール中...');

        if (CURRENT_ENV === 'macos') {
            // macOS: brew install（sudo不要）
            try {
                runShellCommand('brew install yq', { stdio: 'pipe' });
                ctx.log('[Unix] yqインストール完了（brew）');
            } catch (error) {
                ctx.log(`[Unix] yqインストール失敗: ${error}`);
                throw new Error('yqインストールに失敗しました（brew install yq を手動実行してください）');
            }
            return;
        }

        // Linux / WSL: バイナリダウンロード（apt-getにはない）
        if (!password) {
            throw new Error('パスワードが必要です');
        }

        try {
            const downloadCmd = 'wget -qO /tmp/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64';
            const installCmd = `echo '${password}' | sudo -S mv /tmp/yq /usr/local/bin/yq && echo '${password}' | sudo -S chmod +x /usr/local/bin/yq`;

            runShellCommand(downloadCmd, { stdio: 'pipe' });
            this.execWithSudo(installCmd, password);
            ctx.log('[Unix] yqインストール完了（バイナリ）');
        } catch (error) {
            ctx.log(`[Unix] yqインストール失敗: ${error}`);
            throw new Error('yqインストールに失敗しました');
        }
    }

    /**
     * pm2 インストール（npm global + sudo）
     */
    async installPm2(ctx: SetupContext, password?: string): Promise<void> {
        ctx.log('[Unix] pm2 をインストール中...');

        const pm = detectPackageManager(getMessengerShellPath());
        const installCmd = PM_CONFIG[pm].globalInstall('pm2');

        try {
            if (password) {
                const cmdWithSudo = `echo '${password}' | sudo -S ${installCmd}`;
                this.execWithSudo(cmdWithSudo, password);
            } else {
                // パスワードレスsudo
                runShellCommand(`sudo -n ${installCmd}`, { stdio: 'pipe' });
            }
            ctx.log('[Unix] pm2インストール完了');
        } catch (error) {
            ctx.log(`[Unix] pm2インストール失敗: ${error}`);
            throw new Error('pm2インストールに失敗しました');
        }
    }

    /**
     * maid-agent-messenger サーバーセットアップ（依存関係インストールのみ）
     * サーバー起動は Call コマンド実行時に ensureServerRunning で行う
     */
    async setupMessengerServer(ctx: SetupContext): Promise<void> {
        const messengerPath = getMessengerShellPath();
        const pm = detectPackageManager(messengerPath);

        // npm/pnpm/yarn install
        ctx.log('[Unix] サーバー依存関係インストール中...');
        const installCmd = PM_CONFIG[pm].install;
        runShellCommand(`cd "${messengerPath}" && ${installCmd}`, { stdio: 'pipe' });
        ctx.log('[Unix] サーバー依存関係インストール完了');

        // 注: サーバー起動（pm2 start）は Call コマンド実行時に
        // server-manager.ts の ensureServerRunning() で行う
    }

    /**
     * パスワードレスsudo設定
     */
    async setupPasswordlessSudo(ctx: SetupContext, password?: string): Promise<void> {
        ctx.log('[Unix] パスワードレスsudo設定中...');

        if (!password) {
            throw new Error('パスワードが必要です');
        }

        try {
            // ユーザー名を取得
            const username = runShellCommand('whoami', { stdio: 'pipe' }).trim();

            // sudoersファイルに追加
            const sudoersLine = `${username} ALL=(ALL) NOPASSWD: ALL`;
            const cmd = `echo '${password}' | sudo -S bash -c "echo '${sudoersLine}' > /etc/sudoers.d/maid-agent-nopasswd && chmod 440 /etc/sudoers.d/maid-agent-nopasswd"`;

            this.execWithSudo(cmd, password);
            ctx.log('[Unix] パスワードレスsudo設定完了');
        } catch (error) {
            ctx.log(`[Unix] パスワードレスsudo設定失敗: ${error}`);
            throw new Error('パスワードレスsudo設定に失敗しました');
        }
    }

    /**
     * pm2 startup設定
     */
    async setupPm2Startup(ctx: SetupContext, password?: string): Promise<void> {
        ctx.log('[Unix] pm2 startup設定中...');

        try {
            // pm2 startup コマンドを取得
            const output = runShellCommand('pm2 startup 2>&1');

            // 既に設定済みか確認
            if (output.includes('already')) {
                ctx.log('[Unix] pm2 startup 既に設定済み');
                return;
            }

            // sudoコマンドを抽出
            const match = output.match(/sudo .+$/m);
            if (!match) {
                ctx.log('[Unix] pm2 startup コマンドが見つかりません');
                return;
            }

            const startupCmd = match[0];

            if (password) {
                const cmdWithS = startupCmd.replace(/^sudo\s+/, 'sudo -S ');
                this.execWithSudo(cmdWithS, password);
            } else {
                // パスワードレス
                const cmdWithN = startupCmd.replace(/^sudo\s+/, 'sudo -n ');
                runShellCommand(cmdWithN, { stdio: 'pipe' });
            }

            ctx.log('[Unix] pm2 startup設定完了');
        } catch (error) {
            ctx.log(`[Unix] pm2 startup設定失敗: ${error}`);
            throw new Error('pm2 startup設定に失敗しました');
        }
    }

    /**
     * PATH 設定（.bashrc / .zshrc）
     */
    async setupPath(ctx: SetupContext): Promise<void> {
        const homeDir = CURRENT_ENV === 'windows-native'
            ? this.getWslHomeDir()
            : (process.env.HOME || process.env.USERPROFILE);

        if (!homeDir) {
            throw new Error('ホームディレクトリが見つかりません');
        }

        const pathLine = 'export PATH="$HOME/.maid-agent/bin:$PATH"';
        const comment = '# Maid Agent CLI (maidctl)';

        // .zshrc または .bashrc に追加
        const shellConfigs = ['.zshrc', '.bashrc'];

        for (const config of shellConfigs) {
            const configPath = path.join(homeDir, config);
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                if (!content.includes('.maid-agent/bin')) {
                    fs.appendFileSync(configPath, `\n${comment}\n${pathLine}\n`);
                    ctx.log(`[Unix] PATH設定追加: ${config}`);
                }
            }
        }

        ctx.log('[Unix] PATH設定完了');
    }

    /**
     * sudo付きコマンドを実行（環境に応じてWSL経由または直接）
     */
    private execWithSudo(cmd: string, password: string): void {
        if (CURRENT_ENV === 'windows-native') {
            // WSL経由
            execSync(`wsl bash -lc "${cmd.replace(/"/g, '\\"')}"`, {
                encoding: 'utf-8',
                timeout: 120000,
                input: password + '\n',
            });
        } else {
            // 直接実行
            execSync(cmd, {
                encoding: 'utf-8',
                timeout: 120000,
                input: password + '\n',
            });
        }
    }

    /**
     * WSL内のホームディレクトリを取得
     */
    private getWslHomeDir(): string {
        try {
            const wslHome = execSync('wsl bash -lc "echo $HOME"', {
                encoding: 'utf-8',
                timeout: 5000,
            }).trim();
            // WSLパスをWindowsパスに変換
            const windowsPath = execSync(`wsl wslpath -w "${wslHome}"`, {
                encoding: 'utf-8',
                timeout: 5000,
            }).trim();
            return windowsPath;
        } catch {
            // フォールバック
            return '';
        }
    }
}

/**
 * Unix戦略のシングルトンインスタンス
 */
export const unixStrategy = new UnixStrategy();
