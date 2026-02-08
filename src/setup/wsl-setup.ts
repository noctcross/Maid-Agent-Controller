import * as vscode from 'vscode';
import { execSync } from 'child_process';
import { SetupContext } from '../types';
import { CURRENT_ENV } from '../utils/environment';

/**
 * WSL2の状態をチェックし、必要に応じてセットアップを案内
 * @returns true: WSL準備完了、false: 再起動等が必要
 */
export async function checkAndSetupWsl(ctx: SetupContext): Promise<boolean> {
    ctx.log('[WSL] チェック開始');

    // 1. WSL2がインストールされているかチェック
    try {
        execSync('wsl.exe --version', { encoding: 'utf-8', stdio: 'pipe' });
        ctx.log('[WSL] WSL2 確認OK');
    } catch {
        ctx.log('[WSL] WSL2 未インストール');

        const choice = await vscode.window.showWarningMessage(
            'WSL2がインストールされていません。インストールしますか?(管理者権限が必要です)',
            'インストールする',
            'キャンセル'
        );

        if (choice === 'インストールする') {
            try {
                // 管理者権限でwsl --installを実行
                execSync('powershell -Command "Start-Process wsl -ArgumentList \'--install --no-launch\' -Verb RunAs -Wait"', {
                    encoding: 'utf-8',
                    stdio: 'pipe'
                });

                await vscode.window.showInformationMessage(
                    '✅ WSL2のインストールを開始しました。\n\n' +
                    '**PCを再起動してから、再度 Init Global を実行してください。**',
                    { modal: true }
                );
            } catch (error) {
                ctx.log(`[WSL] インストール失敗: ${error}`);
                vscode.window.showErrorMessage(
                    'WSL2のインストールに失敗しました。\n' +
                    'PowerShell(管理者)で以下を実行してください:\n' +
                    'wsl --install'
                );
            }
        }
        return false;
    }

    // 2. Ubuntuディストロがインストールされているかチェック
    try {
        const distros = execSync('wsl.exe -l -q', { encoding: 'utf-8' })
            .replace(/\0/g, '')
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        ctx.log(`[WSL] ディストロ一覧: ${distros.join(', ')}`);

        if (distros.length === 0) {
            ctx.log('[WSL] ディストロなし');

            const choice = await vscode.window.showWarningMessage(
                'WSL用のLinuxディストリビューションがありません。Ubuntuをインストールしますか?',
                'インストールする',
                'キャンセル'
            );

            if (choice === 'インストールする') {
                try {
                    execSync('powershell -Command "Start-Process wsl -ArgumentList \'--install -d Ubuntu --no-launch\' -Verb RunAs -Wait"', {
                        encoding: 'utf-8',
                        stdio: 'pipe'
                    });

                    await vscode.window.showInformationMessage(
                        '✅ Ubuntuのインストールを開始しました。\n\n' +
                        '**PCを再起動してから、再度 Init Global を実行してください。**\n\n' +
                        '再起動後、Ubuntuを起動してユーザー名とパスワードを設定してください。',
                        { modal: true }
                    );
                } catch (error) {
                    ctx.log(`[WSL] Ubuntu インストール失敗: ${error}`);
                    vscode.window.showErrorMessage(
                        'Ubuntuのインストールに失敗しました。\n' +
                        'PowerShell(管理者)で以下を実行してください:\n' +
                        'wsl --install -d Ubuntu'
                    );
                }
            }
            return false;
        }
    } catch (error) {
        ctx.log(`[WSL] ディストロ確認失敗: ${error}`);
        vscode.window.showErrorMessage('WSLの状態を確認できませんでした');
        return false;
    }

    // 3. WSLが正常に動作するかチェック
    try {
        execSync("wsl bash -c 'echo ok'", { encoding: 'utf-8', stdio: 'pipe' });
        ctx.log('[WSL] 動作確認OK');
    } catch {
        ctx.log('[WSL] WSL動作不可');

        await vscode.window.showWarningMessage(
            'WSLが正常に動作していません。\n\n' +
            '以下を確認してください:\n' +
            '1. Ubuntuを一度起動してユーザー設定を完了\n' +
            '2. PCを再起動\n\n' +
            'その後、再度 Init Global を実行してください。',
            { modal: true }
        );
        return false;
    }

    ctx.log('[WSL] 全チェックOK');
    return true;
}

/**
 * WSLパスワードを取得(説明ダイアログ付き)
 */
export async function promptWslPassword(purpose: string, attempt: number, maxAttempts: number): Promise<string | undefined> {
    // 初回は説明ダイアログを表示
    if (attempt === 1) {
        const proceed = await vscode.window.showInformationMessage(
            `${purpose}\n\nWSL (Ubuntu) のパスワード入力が必要です。\n(Windowsのパスワードではありません)`,
            { modal: true },
            'パスワードを入力'
        );
        if (proceed !== 'パスワードを入力') {
            return undefined;
        }
    }

    return await vscode.window.showInputBox({
        prompt: attempt > 1
            ? `パスワードが正しくありません(残り${maxAttempts - attempt + 1}回)`
            : 'WSL (Ubuntu) のパスワード',
        password: true,
        placeHolder: 'Ubuntu 初回起動時に設定したパスワード',
        ignoreFocusOut: true
    });
}

/**
 * パスワードのヘルプを表示
 */
export async function showPasswordHelp(ctx: SetupContext): Promise<void> {
    const help = await vscode.window.showInformationMessage(
        'パスワードを忘れた場合は、管理者権限のPowerShellで「wsl -u root」→「passwd ユーザー名」でリセットできます',
        'OK',
        'リセット方法を詳しく見る'
    );

    if (help !== 'リセット方法を詳しく見る') {
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'passwordHelp',
        'WSLパスワードのリセット方法',
        vscode.ViewColumn.One,
        {}
    );
    panel.webview.html = getPasswordHelpHtml();
}

/**
 * パスワードヘルプのHTML
 */
export function getPasswordHelpHtml(): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: sans-serif; padding: 20px; }
                code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
                pre { background: #f0f0f0; padding: 10px; border-radius: 5px; overflow-x: auto; }
            </style>
        </head>
        <body>
            <h1>WSLパスワードのリセット方法</h1>
            <ol>
                <li>PowerShell を<strong>管理者として</strong>起動</li>
                <li>以下のコマンドを実行:
                    <pre>wsl -u root</pre>
                </li>
                <li>rootでログインしたら、パスワードをリセット:
                    <pre>passwd ユーザー名</pre>
                    ※ユーザー名は <code>whoami</code> で確認できます
                </li>
                <li>新しいパスワードを2回入力</li>
                <li><code>exit</code> でrootを終了</li>
                <li>再度 Init Global を実行</li>
            </ol>
        </body>
        </html>
    `;
}

/**
 * パスワードレスsudoが設定されているか確認
 */
export function checkPasswordlessSudo(): boolean {
    try {
        // sudoers.d に maid-agent 設定ファイルが存在するか確認
        const result = execSync(
            `wsl bash -c "test -f /etc/sudoers.d/maid-agent && echo 'exists' || echo 'not_found'"`,
            { encoding: 'utf-8', stdio: 'pipe' }
        ).trim();
        return result === 'exists';
    } catch {
        return false;
    }
}

/**
 * WSLのユーザー名を取得
 */
export function getWslUsername(): string {
    try {
        const username = execSync(`wsl bash -c "whoami"`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        // ユーザー名バリデーション（sudoersファイルへのインジェクション防止）
        if (!/^[a-z_][a-z0-9_-]*$/.test(username)) {
            return 'user'; // 不正な文字を含む場合はフォールバック
        }
        return username;
    } catch {
        return 'user'; // フォールバック
    }
}

/**
 * パスワードレスsudoを設定(/etc/sudoers.d/maid-agent を作成)
 * @returns 成功したらtrue
 */
export async function setupPasswordlessSudo(ctx: SetupContext): Promise<boolean> {
    // 既に設定済みならスキップ
    if (checkPasswordlessSudo()) {
        ctx.log('[Sudo] パスワードレスsudo 設定済み');
        return true;
    }

    // ユーザーに確認
    const choice = await vscode.window.showInformationMessage(
        'sudoパスワードの自動化設定を行いますか?\n\n' +
        '一度だけパスワードを入力すると、以降は自動で実行されます。\n' +
        '(/etc/sudoers.d/maid-agent に設定を追加します)',
        { modal: true },
        '設定する',
        'スキップ'
    );

    if (choice !== '設定する') {
        ctx.log('[Sudo] パスワードレスsudo 設定をスキップ');
        return false;
    }

    const username = getWslUsername();
    ctx.log(`[Sudo] WSLユーザー名: ${username}`);

    // sudoersファイルの内容
    // 注意: visudoを通さずに直接書き込むため、構文エラーに注意
    const sudoersContent = `# Maid Agent - Passwordless sudo for pm2 operations
# Created by VSCode Maid Agent Extension
${username} ALL=(ALL) NOPASSWD: /usr/bin/npm install -g pm2
${username} ALL=(ALL) NOPASSWD: /usr/bin/env *
`;

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const password = await promptWslPassword('パスワードレスsudo設定', attempt, MAX_ATTEMPTS);
        if (!password) {
            ctx.log('[Sudo] パスワード入力がキャンセルされました');
            return false;
        }

        try {
            const escapedContent = sudoersContent
                .replace(/'/g, "'\\''")
                .replace(/\n/g, '\\n');  // 改行をリテラル \n に変換

            // sudoers.d に設定ファイルを作成（stdin パイプでパスワードを渡す）
            execSync(
                `wsl bash -c "sudo -S bash -c 'echo -e \\"${escapedContent}\\" > /etc/sudoers.d/maid-agent && chmod 440 /etc/sudoers.d/maid-agent'"`,
                { encoding: 'utf-8', timeout: 30000, input: password + '\n' }
            );

            // 設定の検証
            execSync(
                `wsl bash -c "sudo -n true 2>/dev/null"`,
                { encoding: 'utf-8', stdio: 'pipe' }
            );

            ctx.log('[Sudo] パスワードレスsudo 設定完了');
            vscode.window.showInformationMessage('✅ パスワードレスsudo を設定しました。以降は自動で実行されます。');
            return true;
        } catch (error) {
            ctx.log(`[Sudo] 設定失敗 (${attempt}/${MAX_ATTEMPTS}): ${error}`);
        }
    }

    vscode.window.showErrorMessage('パスワードレスsudoの設定に失敗しました。');
    return false;
}

/**
 * パスワードレスでsudoコマンドを実行(設定済みの場合)
 * @returns 成功したらtrue
 */
export function execSudoNoPassword(command: string): boolean {
    try {
        // シェルメタ文字の拒否（コマンドインジェクション防止）
        if (/[;&|`$()\n\r<>]/.test(command)) {
            return false;
        }
        execSync(`wsl bash -c "sudo -n ${command}"`, { encoding: 'utf-8', stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * WSLが利用可能かチェックし、なければインストールを提案
 */
export async function ensureWslAvailable(ctx: SetupContext): Promise<boolean> {
    // isWslAvailable() の代わりに直接チェック
    try {
        execSync('wsl.exe --version', { encoding: 'utf-8', stdio: 'pipe' });
    } catch {
        const choice = await vscode.window.showErrorMessage(
            'WSL (Windows Subsystem for Linux) がインストールされていません。\n\n' +
            'この拡張機能はWSL上のtmuxを使用します。\n' +
            'WSLをインストールしますか?\n\n' +
            '※ 管理者権限のPowerShellが開きます',
            'インストールする',
            'インストール方法を表示',
            'キャンセル'
        );

        if (choice === 'インストールする') {
            return await installWsl(ctx);
        } else if (choice === 'インストール方法を表示') {
            showWslInstallInstructions(ctx);
            return false;
        }

        return false;
    }

    return true;
}

/**
 * WSLをインストール
 */
export async function installWsl(ctx: SetupContext): Promise<boolean> {
    // PowerShellを管理者権限で開いてwsl --installを実行
    try {
        // 管理者権限でPowerShellを起動
        const terminal = vscode.window.createTerminal({
            name: '📦 WSL インストール',
            shellPath: 'powershell.exe'
        });
        terminal.show();
        terminal.sendText('Start-Process powershell -Verb RunAs -ArgumentList \'-Command\', \'wsl --install; Read-Host "インストールが完了したらEnterを押してください"\'');

        const result = await vscode.window.showInformationMessage(
            'WSLインストーラーを起動しました。\n\n' +
            '1. 管理者権限のPowerShellウィンドウが開きます\n' +
            '2. インストールが完了するまで待ちます\n' +
            '3. PCを再起動してください\n' +
            '4. 再起動後、再度このコマンドを実行してください\n\n' +
            'インストールが完了しましたか?',
            'PCを再起動する',
            '後で手動で行う'
        );

        if (result === 'PCを再起動する') {
            const confirmRestart = await vscode.window.showWarningMessage(
                '本当にPCを再起動しますか?\n作業中のファイルを保存してください。',
                '再起動',
                'キャンセル'
            );
            if (confirmRestart === '再起動') {
                execSync('shutdown /r /t 30 /c "WSLインストール完了のため再起動します"');
                vscode.window.showInformationMessage('30秒後にPCが再起動します。');
            }
        }

        return false; // 再起動が必要なので一旦falseを返す
    } catch (error) {
        vscode.window.showErrorMessage(`WSLインストールの起動に失敗しました: ${error}`);
        return false;
    }
}

/**
 * WSLインストール方法を表示
 */
export function showWslInstallInstructions(ctx: SetupContext): void {
    ctx.log('=== WSL インストール方法 ===');
    ctx.log('');
    ctx.log('【方法1: コマンドでインストール(推奨)】');
    ctx.log('1. PowerShellを管理者権限で開く');
    ctx.log('   - Windowsキーを押して「powershell」と入力');
    ctx.log('   - 「管理者として実行」を選択');
    ctx.log('');
    ctx.log('2. 以下のコマンドを実行:');
    ctx.log('   wsl --install');
    ctx.log('');
    ctx.log('3. PCを再起動');
    ctx.log('');
    ctx.log('4. 再起動後、WSLが自動的に起動しUbuntuのセットアップが始まります');
    ctx.log('   - ユーザー名とパスワードを設定してください');
    ctx.log('');
    ctx.log('【方法2: Windowsの機能から有効化】');
    ctx.log('1. 「Windowsの機能の有効化または無効化」を開く');
    ctx.log('2. 「Linux用Windowsサブシステム」にチェック');
    ctx.log('3. 「仮想マシンプラットフォーム」にチェック');
    ctx.log('4. PCを再起動');
    ctx.log('5. Microsoft StoreからUbuntuをインストール');
    ctx.log('');
    ctx.log('インストール後、再度Callコマンドを実行してください。');
    ctx.outputChannel.show();
}
