/**
 * Psmux セットアップ戦略
 *
 * Windows環境でWSLを使わず直接実行するモード。
 * - winget でパッケージインストール
 * - npm install -g でグローバルパッケージ
 * - PowerShell $PROFILE にPATH設定
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SetupContext } from '../../types';
import { PsmuxSetupStrategy } from './types';

export class PsmuxStrategy implements PsmuxSetupStrategy {
    readonly name = 'psmux' as const;

    /**
     * PowerShell経由でwingetコマンドを実行
     * VS Code環境からwingetを確実に呼び出すため
     */
    private runWinget(args: string, ctx: SetupContext, timeout: number = 120000): void {
        // PowerShell経由でwingetを実行
        const cmd = `powershell.exe -NoProfile -Command "winget ${args}"`;
        ctx.log(`[Psmux] 実行: ${cmd}`);

        try {
            const output = execSync(cmd, {
                encoding: 'utf-8',
                timeout,
                windowsHide: true,
            });
            ctx.log(`[Psmux] 出力: ${output}`);
        } catch (error: unknown) {
            // wingetは成功時でもexit code != 0を返すことがある
            // "既にインストール済み" などのケースを許容
            const execError = error as { status?: number; stdout?: string; stderr?: string };
            if (execError.stdout) {
                ctx.log(`[Psmux] stdout: ${execError.stdout}`);
            }
            if (execError.stderr) {
                ctx.log(`[Psmux] stderr: ${execError.stderr}`);
            }

            // インストール済みの場合は成功扱い
            const output = (execError.stdout || '') + (execError.stderr || '');
            if (output.includes('already installed') || output.includes('既にインストール')) {
                ctx.log('[Psmux] 既にインストール済み');
                return;
            }

            throw error;
        }
    }

    /**
     * psmux インストール（winget経由）
     * Windows用ターミナルマルチプレクサ
     */
    async installPsmux(ctx: SetupContext): Promise<void> {
        ctx.log('[Psmux] psmux をwinget経由でインストール中...');
        try {
            this.runWinget(
                'install psmux --accept-source-agreements --accept-package-agreements',
                ctx,
                120000  // 2分
            );
            ctx.log('[Psmux] psmuxインストール完了');
        } catch (error) {
            ctx.log(`[Psmux] psmuxインストール失敗: ${error}`);
            throw new Error('psmuxインストールに失敗しました（winget install psmux を手動実行してください）');
        }
    }

    /**
     * Node.js インストール（winget経由）
     */
    async installNodeJs(ctx: SetupContext): Promise<void> {
        ctx.log('[Psmux] Node.js をwinget経由でインストール中...');
        try {
            this.runWinget(
                'install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements',
                ctx,
                180000  // 3分（サイズが大きい）
            );
            ctx.log('[Psmux] Node.jsインストール完了');
        } catch (error) {
            ctx.log(`[Psmux] Node.jsインストール失敗: ${error}`);
            throw new Error('Node.jsインストールに失敗しました（winget install OpenJS.NodeJS.LTS を手動実行してください）');
        }
    }

    /**
     * jq インストール（winget経由）
     */
    async installJq(ctx: SetupContext, _password?: string): Promise<void> {
        ctx.log('[Psmux] jq をwinget経由でインストール中...');
        try {
            this.runWinget(
                'install jqlang.jq --accept-source-agreements --accept-package-agreements',
                ctx
            );
            ctx.log('[Psmux] jqインストール完了');
        } catch (error) {
            ctx.log(`[Psmux] jqインストール失敗: ${error}`);
            throw new Error('jqインストールに失敗しました（winget install jqlang.jq を手動実行してください）');
        }
    }

    /**
     * yq インストール（winget経由）
     */
    async installYq(ctx: SetupContext, _password?: string): Promise<void> {
        ctx.log('[Psmux] yq をwinget経由でインストール中...');
        try {
            this.runWinget(
                'install MikeFarah.yq --accept-source-agreements --accept-package-agreements',
                ctx
            );
            ctx.log('[Psmux] yqインストール完了');
        } catch (error) {
            ctx.log(`[Psmux] yqインストール失敗: ${error}`);
            throw new Error('yqインストールに失敗しました（winget install MikeFarah.yq を手動実行してください）');
        }
    }

    /**
     * cmd.exe経由でnpmコマンドを実行
     * PowerShellだと実行ポリシーでnpm.ps1がブロックされる場合があるため、
     * cmd.exeを使用してnpm.cmdを呼び出す
     */
    private runNpm(args: string, ctx: SetupContext, cwd?: string, timeout: number = 120000): void {
        const cdPart = cwd ? `cd /d "${cwd}" && ` : '';
        const cmd = `cmd.exe /c "${cdPart}npm ${args}"`;
        ctx.log(`[Psmux] 実行: ${cmd}`);

        try {
            const output = execSync(cmd, {
                encoding: 'utf-8',
                timeout,
                windowsHide: true,
            });
            ctx.log(`[Psmux] 出力: ${output}`);
        } catch (error: unknown) {
            const execError = error as { stdout?: string; stderr?: string };
            if (execError.stdout) {
                ctx.log(`[Psmux] stdout: ${execError.stdout}`);
            }
            if (execError.stderr) {
                ctx.log(`[Psmux] stderr: ${execError.stderr}`);
            }
            throw error;
        }
    }

    /**
     * pm2 インストール（npm global）
     */
    async installPm2(ctx: SetupContext, _password?: string): Promise<void> {
        ctx.log('[Psmux] pm2 をnpm経由でインストール中...');
        try {
            this.runNpm('install -g pm2', ctx, undefined, 120000);
            ctx.log('[Psmux] pm2インストール完了');
        } catch (error) {
            ctx.log(`[Psmux] pm2インストール失敗: ${error}`);
            throw new Error('pm2インストールに失敗しました（npm install -g pm2 を手動実行してください）');
        }
    }

    /**
     * maid-agent-messenger サーバーセットアップ（依存関係インストールのみ）
     * サーバー起動は Call コマンド実行時に ensureServerRunning で行う
     */
    async setupMessengerServer(ctx: SetupContext): Promise<void> {
        const homeDir = process.env.USERPROFILE;
        if (!homeDir) {
            throw new Error('USERPROFILEが見つかりません');
        }

        const messengerPath = path.join(homeDir, '.maid-agent', 'maid-agent-messenger');

        // npm install（PowerShell経由）
        ctx.log('[Psmux] サーバー依存関係インストール中...');
        try {
            this.runNpm('install', ctx, messengerPath, 180000);
            ctx.log('[Psmux] サーバー依存関係インストール完了');
        } catch (error) {
            ctx.log(`[Psmux] npm install失敗: ${error}`);
            throw new Error(`サーバー依存関係インストールに失敗しました（${messengerPath} で npm install を手動実行してください）`);
        }

        // 注: サーバー起動（pm2 start）は Call コマンド実行時に
        // server-manager.ts の ensureServerRunning() で行う
    }

    /**
     * PATH 設定（PowerShell $PROFILE + Git Bash .bashrc）
     */
    async setupPath(ctx: SetupContext): Promise<void> {
        const userProfile = process.env.USERPROFILE;
        if (!userProfile) {
            throw new Error('USERPROFILEが見つかりません');
        }

        // PowerShell $PROFILE のパス
        const profilePaths = [
            path.join(userProfile, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
            path.join(userProfile, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        ];

        const psPathLine = '$env:PATH = "$env:USERPROFILE\\.maid-agent\\bin;$env:PATH"';
        const comment = '# Maid Agent CLI (maidctl)';

        for (const profilePath of profilePaths) {
            const profileDir = path.dirname(profilePath);
            // ディレクトリがなければ作成
            if (!fs.existsSync(profileDir)) {
                fs.mkdirSync(profileDir, { recursive: true });
            }

            // ファイルが存在しなければ作成
            if (!fs.existsSync(profilePath)) {
                fs.writeFileSync(profilePath, `${comment}\n${psPathLine}\n`, 'utf-8');
                ctx.log(`[Psmux] PATH設定追加（新規作成）: ${profilePath}`);
            } else {
                const content = fs.readFileSync(profilePath, 'utf-8');
                if (!content.includes('.maid-agent\\bin')) {
                    fs.appendFileSync(profilePath, `\n${comment}\n${psPathLine}\n`);
                    ctx.log(`[Psmux] PATH設定追加: ${profilePath}`);
                }
            }
        }

        // Git Bash の .bashrc にも追加（maidctl は bash スクリプトのため）
        const gitBashRc = path.join(userProfile, '.bashrc');
        const bashPathLine = 'export PATH="$HOME/.maid-agent/bin:$PATH"';

        if (!fs.existsSync(gitBashRc)) {
            fs.writeFileSync(gitBashRc, `${comment}\n${bashPathLine}\n`, 'utf-8');
            ctx.log(`[Psmux] PATH設定追加（Git Bash 新規作成）: ${gitBashRc}`);
        } else {
            const content = fs.readFileSync(gitBashRc, 'utf-8');
            if (!content.includes('.maid-agent/bin')) {
                fs.appendFileSync(gitBashRc, `\n${comment}\n${bashPathLine}\n`);
                ctx.log(`[Psmux] PATH設定追加（Git Bash）: ${gitBashRc}`);
            }
        }

        ctx.log('[Psmux] PATH設定完了');
    }
}

/**
 * Psmux戦略のシングルトンインスタンス
 */
export const psmuxStrategy = new PsmuxStrategy();
