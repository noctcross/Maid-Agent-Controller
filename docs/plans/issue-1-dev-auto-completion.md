# Issue #1 修正計画書（dev版）: 完了ボタン待ち解消

## 概要

Mac/Linux環境でinit/InitGlobal実行時の「完了」ボタン押下待ちを解消する。

**対象ブランチ**: feature/flow-improvement（devベース）
**対象ワークツリー**: ws-dev-flow-improvement

### 目標

| フェーズ | 現状 | 目標 |
|----------|------|------|
| 開始時 | - | 必要な入力（パスワード）を先に取得 |
| 処理中 | 「完了」ボタン待ちで中断 | 自動で進行し、完了まで止まらない |
| 終了時 | - | 結果表示のみ |

---

## 1. 問題箇所の特定

### 1.1 installPm2Native() - L246-276

**ファイル**: `src/setup/pm2-setup.ts`

**現状の問題**:
- ターミナルで `sudo npm install -g pm2` を実行
- 「完了」ボタンをユーザーが押すまで**待機**

```typescript
// L252-261: 問題のコード
terminal.show();
terminal.sendText(`sudo ${PM_CONFIG[pm].globalInstall('pm2')}`);

const result = await vscode.window.showInformationMessage(
    'pm2のインストールを開始しました。\n' +
    'インストールが完了したら「完了」を押してください。\n' +
    '（sudoパスワードの入力が必要な場合があります）',
    '完了',      // ← ユーザーがこれを押すまで待機
    'キャンセル'
);
```

### 1.2 setupPm2StartupNative() - L452-471

**ファイル**: `src/setup/pm2-setup.ts`

**現状の問題**:
- ターミナルで `sudo env PATH=... pm2 startup ...` を実行
- 「完了」ボタンをユーザーが押すまで**待機**

```typescript
// L456-465: 問題のコード
terminal.show();
terminal.sendText(match[0]);

const result = await vscode.window.showInformationMessage(
    'pm2 startupの設定を開始しました。\n' +
    '設定が完了したら「完了」を押してください。\n' +
    '（sudoパスワードの入力が必要な場合があります）',
    '完了',      // ← ユーザーがこれを押すまで待機
    'キャンセル'
);
```

---

## 2. 解決方針

### 2.1 Windows (WSL) との比較

Windows版は既に自動化されている:

```typescript
// Windows版: パスワードを入力して自動実行
execSync(
    `wsl bash -lc "sudo -S ${PM_CONFIG[pm].globalInstall('pm2')} 2>&1"`,
    { encoding: 'utf-8', timeout: 120000, input: password + '\n' }
);
```

### 2.2 Mac/Linux での解決策

同様のパターンを適用:

1. **パスワードレスsudo確認** → 成功なら `sudo -n` で自動実行
2. **パスワード必要な場合** → 入力ダイアログ → `echo pwd | sudo -S` で自動実行
3. **ターミナル不要** → execSync で完結

---

## 3. 修正計画

### 3.1 新規追加: checkPasswordlessSudoNative()

**ファイル**: `src/setup/pm2-setup.ts`（または `wsl-setup.ts` に追加）

**After（新規追加）**:
```typescript
/**
 * Mac/Linux環境でパスワードレスsudoが利用可能か確認
 * @returns true: パスワード不要でsudo実行可能
 */
export function checkPasswordlessSudoNative(): boolean {
    try {
        execSync('sudo -n true 2>/dev/null', { stdio: 'pipe', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}
```

**追加位置**: pm2-setup.ts L40付近（他のヘルパー関数の近く）

---

### 3.2 新規追加: promptNativePassword()

**ファイル**: `src/setup/pm2-setup.ts`

**After（新規追加）**:
```typescript
/**
 * Mac/Linux環境でsudoパスワードを入力ダイアログで取得
 * @param purpose 用途（表示用）
 * @param attempt 試行回数
 * @param maxAttempts 最大試行回数
 * @returns パスワード文字列、キャンセル時はundefined
 */
async function promptNativePassword(
    purpose: string,
    attempt: number = 1,
    maxAttempts: number = 3
): Promise<string | undefined> {
    const message = attempt > 1
        ? `${purpose}のためsudoパスワードを入力してください（${attempt}/${maxAttempts}回目）`
        : `${purpose}のためsudoパスワードを入力してください`;

    return await vscode.window.showInputBox({
        prompt: message,
        password: true,
        ignoreFocusOut: true
    });
}
```

**追加位置**: pm2-setup.ts L50付近

---

### 3.3 修正: installPm2Native()

**ファイル**: `src/setup/pm2-setup.ts` L246-276

**Before**:
```typescript
async function installPm2Native(ctx: SetupContext): Promise<boolean> {
    const pm = detectPackageManager(getMcpServerPath());
    // ターミナルでインストール（sudoパスワード入力が必要な場合があるため）
    const terminal = vscode.window.createTerminal({
        name: '📦 pm2 インストール'
    });
    terminal.show();
    terminal.sendText(`sudo ${PM_CONFIG[pm].globalInstall('pm2')}`);

    const result = await vscode.window.showInformationMessage(
        'pm2のインストールを開始しました。\n' +
        'インストールが完了したら「完了」を押してください。\n' +
        '（sudoパスワードの入力が必要な場合があります）',
        '完了',
        'キャンセル'
    );

    if (result === '完了') {
        try {
            runShellCommand('which pm2', { stdio: 'pipe' });
            ctx.log('[MCP] pm2 インストール完了（ネイティブ）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            return true;
        } catch {
            vscode.window.showErrorMessage('pm2 のインストールに失敗したようです。手動でインストールしてください。');
            return false;
        }
    }

    return false;
}
```

**After**:
```typescript
async function installPm2Native(ctx: SetupContext): Promise<boolean> {
    const pm = detectPackageManager(getMcpServerPath());
    const installCmd = PM_CONFIG[pm].globalInstall('pm2');

    // 1. パスワードレスsudoが利用可能か確認
    if (checkPasswordlessSudoNative()) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(`sudo -n ${installCmd} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 120000,
                    stdio: 'pipe'
                });
            });

            ctx.log('[MCP] pm2 インストール完了（パスワードレス・ネイティブ）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            return true;
        } catch (error) {
            ctx.log(`[MCP] pm2 インストール失敗（パスワードレス）: ${error}`);
            // フォールバック: パスワード入力へ
        }
    }

    // 2. パスワード入力が必要な場合
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const password = await promptNativePassword('pm2 のインストール', attempt, MAX_ATTEMPTS);

        if (password === undefined) {
            ctx.log('[MCP] pm2 インストールがキャンセルされました');
            return false;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'pm2 をインストール中...',
                cancellable: false
            }, async () => {
                execSync(`sudo -S ${installCmd} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 120000,
                    input: password + '\n'
                });
            });

            ctx.log('[MCP] pm2 インストール完了（ネイティブ）');
            vscode.window.showInformationMessage('✅ pm2 をインストールしました');
            // パスワードをキャッシュ（startup用）
            cachedNativePassword = password;
            return true;
        } catch (error) {
            ctx.log(`[MCP] pm2 インストール試行 ${attempt} 失敗: ${error}`);
        }
    }

    vscode.window.showErrorMessage(
        'pm2 のインストールに失敗しました。\n' +
        '以下を手動実行してください:\n' +
        `sudo ${installCmd}`
    );
    return false;
}
```

**変更点**:
- ターミナル使用を廃止
- パスワードレスsudo確認を追加（`sudo -n`）
- パスワード入力ダイアログ + `sudo -S` で自動実行
- 「完了」ボタン待ちを**完全削除**

---

### 3.4 修正: setupPm2StartupNative()

**ファイル**: `src/setup/pm2-setup.ts` L408-471

**Before**:
```typescript
async function setupPm2StartupNative(ctx: SetupContext): Promise<void> {
    // pm2 startup コマンドを取得
    let output: string;
    try {
        output = runShellCommand('pm2 startup 2>&1');
    } catch (execError: unknown) {
        // ... エラーハンドリング
    }

    // 既に設定済みか確認
    if (output.includes('already')) {
        ctx.log('[MCP] pm2 startup 既に設定済み');
        return;
    }

    // sudoコマンドを抽出
    const match = output.match(/sudo .+$/m);
    if (!match) {
        ctx.log('[MCP] startup コマンドが見つかりません');
        return;
    }

    // ユーザーに確認
    const choice = await vscode.window.showInformationMessage(
        'MCPサーバーの自動起動を設定しますか？\n（システム起動時に自動で起動します）',
        '設定する',
        'スキップ'
    );

    if (choice !== '設定する') {
        ctx.log('[MCP] pm2 startup をスキップ');
        return;
    }

    // ターミナルでstartupコマンドを実行（sudoパスワード入力が必要）
    const terminal = vscode.window.createTerminal({
        name: '⚙️ pm2 startup'
    });
    terminal.show();
    terminal.sendText(match[0]);

    const result = await vscode.window.showInformationMessage(
        'pm2 startupの設定を開始しました。\n' +
        '設定が完了したら「完了」を押してください。\n' +
        '（sudoパスワードの入力が必要な場合があります）',
        '完了',
        'キャンセル'
    );

    if (result === '完了') {
        ctx.log('[MCP] pm2 startup 設定完了（ネイティブ）');
        vscode.window.showInformationMessage('✅ 自動起動を設定しました');
    }
}
```

**After**:
```typescript
async function setupPm2StartupNative(ctx: SetupContext): Promise<void> {
    // pm2 startup コマンドを取得
    let output: string;
    try {
        output = runShellCommand('pm2 startup 2>&1');
    } catch (execError: unknown) {
        if (execError && typeof execError === 'object' && 'stdout' in execError) {
            output = (execError as { stdout: string }).stdout || '';
        } else if (execError && typeof execError === 'object' && 'message' in execError) {
            output = (execError as Error).message;
        } else {
            ctx.log(`[MCP] pm2 startup 取得失敗: ${execError}`);
            vscode.window.showWarningMessage('自動起動設定の取得に失敗しました');
            return;
        }
    }

    ctx.log(`[MCP] pm2 startup 出力: ${output}`);

    // 既に設定済みか確認
    if (output.includes('already')) {
        ctx.log('[MCP] pm2 startup 既に設定済み');
        return;
    }

    // sudoコマンドを抽出
    const match = output.match(/sudo .+$/m);
    if (!match) {
        ctx.log('[MCP] startup コマンドが見つかりません');
        return;
    }

    const startupCmd = match[0];

    // ユーザーに確認
    const choice = await vscode.window.showInformationMessage(
        'MCPサーバーの自動起動を設定しますか？\n（システム起動時に自動で起動します）',
        '設定する',
        'スキップ'
    );

    if (choice !== '設定する') {
        ctx.log('[MCP] pm2 startup をスキップ');
        return;
    }

    // 1. パスワードレスsudoが利用可能か確認
    if (checkPasswordlessSudoNative()) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '自動起動を設定中...',
                cancellable: false
            }, async () => {
                // sudo -n に変換して実行
                const cmdWithN = startupCmd.replace(/^sudo\s+/, 'sudo -n ');
                execSync(`${cmdWithN} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    stdio: 'pipe'
                });
            });

            ctx.log('[MCP] pm2 startup 設定完了（パスワードレス・ネイティブ）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[MCP] pm2 startup 失敗（パスワードレス）: ${error}`);
            // フォールバック: パスワード入力へ
        }
    }

    // 2. キャッシュ済みパスワードがあれば使用
    if (cachedNativePassword) {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '自動起動を設定中...',
                cancellable: false
            }, async () => {
                const cmdWithS = startupCmd.replace(/^sudo\s+/, 'sudo -S ');
                execSync(`${cmdWithS} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    input: cachedNativePassword + '\n'
                });
            });

            ctx.log('[MCP] pm2 startup 設定完了（キャッシュパスワード）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[MCP] pm2 startup 失敗（キャッシュパスワード）: ${error}`);
            cachedNativePassword = undefined; // キャッシュクリア
        }
    }

    // 3. パスワード入力が必要な場合
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const password = await promptNativePassword('pm2 startup 設定', attempt, MAX_ATTEMPTS);

        if (password === undefined) {
            ctx.log('[MCP] pm2 startup がキャンセルされました');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '自動起動を設定中...',
                cancellable: false
            }, async () => {
                const cmdWithS = startupCmd.replace(/^sudo\s+/, 'sudo -S ');
                execSync(`${cmdWithS} 2>&1`, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    input: password + '\n'
                });
            });

            ctx.log('[MCP] pm2 startup 設定完了（ネイティブ）');
            vscode.window.showInformationMessage('✅ 自動起動を設定しました');
            return;
        } catch (error) {
            ctx.log(`[MCP] pm2 startup 試行 ${attempt} 失敗: ${error}`);
        }
    }

    vscode.window.showErrorMessage(
        '自動起動の設定に失敗しました。\n' +
        '以下を手動実行してください:\n' +
        startupCmd
    );
}
```

**変更点**:
- ターミナル使用を廃止
- パスワードレスsudo確認を追加（`sudo -n`）
- キャッシュ済みパスワード再利用
- パスワード入力ダイアログ + `sudo -S` で自動実行
- 「完了」ボタン待ちを**完全削除**

---

### 3.5 追加: cachedNativePassword 変数

**ファイル**: `src/setup/pm2-setup.ts`

**追加位置**: L20付近（既存の `cachedWslPassword` の近く）

```typescript
// Mac/Linux用パスワードキャッシュ（startup設定で再利用）
let cachedNativePassword: string | undefined;
```

**setupMcpServer() の finally ブロックにクリア処理を追加**:

```typescript
} finally {
    // セキュリティ: パスワードをクリア
    cachedWslPassword = undefined;
    cachedNativePassword = undefined;  // ← 追加
}
```

---

## 4. 修正サマリー

| 対象 | 行番号 | 変更内容 |
|------|--------|----------|
| `cachedNativePassword` | L20付近 | 新規追加（パスワードキャッシュ変数） |
| `checkPasswordlessSudoNative()` | L40付近 | 新規追加（パスワードレス確認） |
| `promptNativePassword()` | L50付近 | 新規追加（パスワード入力ダイアログ） |
| `installPm2Native()` | L246-276 | 全面書き換え（ターミナル→execSync） |
| `setupPm2StartupNative()` | L408-471 | 全面書き換え（ターミナル→execSync） |
| `setupMcpServer()` finally | L160付近 | `cachedNativePassword` クリア追加 |

---

## 5. テスト計画

### 5.1 Mac環境テスト

| テストケース | 操作 | 期待結果 |
|-------------|------|----------|
| パスワードレスsudo有効 | InitGlobal実行 | パスワード入力なしで完了 |
| パスワード入力必要 | InitGlobal実行 | ダイアログで1回入力→完了 |
| パスワード間違い | 誤パスワード入力 | 再入力ダイアログ（最大3回） |
| キャンセル | ダイアログでESC | 適切なエラー表示 |

### 5.2 Linux環境テスト

| テストケース | 操作 | 期待結果 |
|-------------|------|----------|
| Ubuntu | InitGlobal実行 | Mac同様の動作 |
| sudoers設定あり | InitGlobal実行 | パスワード入力なしで完了 |

### 5.3 回帰テスト

| 確認項目 | 期待結果 |
|----------|----------|
| Windows (WSL) 環境 | 既存動作に影響なし |
| pm2インストール済み環境 | スキップして正常進行 |
| pm2 startup設定済み | スキップして正常進行 |

---

## 6. リスク評価

| リスク | 影響度 | 対策 |
|--------|--------|------|
| パスワードキャッシュのセキュリティ | 中 | finally でクリア、メモリ上のみ保持 |
| `sudo -S` の互換性 | 低 | macOS/Linux標準サポート |
| タイムアウト設定 | 低 | 120秒（インストール）、30秒（startup） |

---

## 7. 作成者情報

- **作成者**: アリス
- **タスクID**: task-245-2
- **作成日**: 2026-02-18
- **ブランチ**: feature/flow-improvement
- **ワークツリー**: ws-dev-flow-improvement
