# Webview Development Pattern

## 概要

VSCode Webview開発時の制約とベストプラクティス。
CSP違反やパス不一致などの問題を事前に回避するためのチェックリスト。

## 適用条件

- VSCode拡張でWebviewパネルを実装する時
- HTMLをWebview内で表示する時
- CSPエラーが発生した時
- WSL環境で開発している時

## チェックリスト

### 1. CSP (Content Security Policy)

VSCode Webviewは厳格なCSPが適用される。以下を確認:

- [ ] インラインスクリプト（`<script>...</script>`）には nonce を付与
- [ ] インラインスタイル（`<style>...</style>`）も nonce または cspSource を使用
- [ ] インラインイベントハンドラー禁止（`onclick="..."` → `addEventListener`）
- [ ] 外部リソースは `localResourceRoots` で許可されたパスのみ

```html
<!-- NG: インラインイベントハンドラー -->
<button onclick="handleClick()">Click</button>

<!-- OK: addEventListener -->
<button id="myButton">Click</button>
<script nonce="${nonce}">
  document.getElementById('myButton').addEventListener('click', handleClick);
</script>
```

### 2. パス形式の統一（WSL/Windows対応）

WSL環境ではWindowsパスとUnixパスが混在する問題が発生:

- [ ] `vscode.Uri.joinPath()` を使用してパスを構築
- [ ] `webview.asWebviewUri()` で Webview用URIに変換
- [ ] ハードコードされたパスを避ける

```typescript
// NG: ハードコードパス
const scriptPath = '/home/user/extension/media/main.js';

// OK: URI API使用
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(extensionUri, 'media', 'main.js')
);
```

### 3. Webview固有API

- [ ] `acquireVsCodeApi()` は1回だけ呼び出す（キャッシュする）
- [ ] Extension Host との通信は `postMessage` / `onDidReceiveMessage`
- [ ] 状態保持が必要なら `getState()` / `setState()` を使用

```typescript
// Webview側
const vscode = acquireVsCodeApi();

// Extension Hostへメッセージ送信
vscode.postMessage({ command: 'alert', text: 'Hello!' });

// 状態の保存/復元
const previousState = vscode.getState();
vscode.setState({ count: 1 });
```

```typescript
// Extension Host側
panel.webview.onDidReceiveMessage(
  message => {
    switch (message.command) {
      case 'alert':
        vscode.window.showInformationMessage(message.text);
        return;
    }
  },
  undefined,
  context.subscriptions
);
```

### 4. リソース管理

- [ ] `localResourceRoots` を適切に設定
- [ ] 不要なリソースへのアクセスを制限
- [ ] 拡張機能ディレクトリ外のリソースは原則禁止

```typescript
const panel = vscode.window.createWebviewPanel(
  'myPanel',
  'My Panel',
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, 'media'),
      vscode.Uri.joinPath(context.extensionUri, 'dist')
    ]
  }
);
```

### 5. Webview内でのfetch（HTTP通信）

**重要**: Webview内での `fetch()` は相対URLが使えない。

**背景**: Webview内のベースURIは `vscode-webview://` スキームのため、相対URLは `vscode-webview://xxx/api/endpoint` に解決され、実際のHTTPサーバーにリクエストが届かない。

- [ ] fetchは必ず**絶対URL**（`http://` または `https://`）を使用
- [ ] サーバーURLは Extension Host から `postMessage` で渡す
- [ ] または Extension Host 経由でHTTP通信を行う

```typescript
// NG: 相対URL（vscode-webview:// に解決され失敗）
fetch('/api/tasks')
fetch('api/tasks')

// OK: 絶対URL（serverBaseUrl を使用）
const serverBaseUrl = 'http://localhost:3100';
fetch(`${serverBaseUrl}/api/tasks`)
```

**方法1: サーバーURLをWebviewに渡す**

```typescript
// Extension Host側: WebviewにサーバーURLを渡す
panel.webview.postMessage({
  command: 'setConfig',
  serverBaseUrl: 'http://localhost:3100'
});

// Webview側: 受け取ったURLを使用
let serverBaseUrl = '';
window.addEventListener('message', event => {
  if (event.data.command === 'setConfig') {
    serverBaseUrl = event.data.serverBaseUrl;
  }
});

async function fetchTasks() {
  const response = await fetch(`${serverBaseUrl}/api/tasks`);
  return response.json();
}
```

**方法2: Extension Host経由でHTTP通信**

```typescript
// Webview側: リクエストを依頼
vscode.postMessage({ command: 'fetchTasks' });

// Extension Host側: 実際のHTTP通信を行う
panel.webview.onDidReceiveMessage(async message => {
  if (message.command === 'fetchTasks') {
    const response = await fetch('http://localhost:3100/api/tasks');
    const data = await response.json();
    panel.webview.postMessage({ command: 'tasksData', data });
  }
});
```

## 注意点

### よくあるエラーと対処

| エラー | 原因 | 対処 |
|-------|------|------|
| `Refused to execute inline script` | CSP違反（nonce不足） | スクリプトに nonce を付与 |
| `Refused to execute inline event handler` | onclick等の使用 | addEventListener に変更 |
| `Unable to load resource` | パス不一致 | asWebviewUri() を使用 |
| `acquireVsCodeApi is not defined` | 複数回呼び出し | グローバルでキャッシュ |

### デバッグ方法

1. コマンドパレット → `Developer: Toggle Developer Tools`
2. Webviewの開発者ツールでコンソールを確認
3. CSPエラーの詳細はコンソールに表示される

## 事例

### 事例1: CSPブロック（#083-7）

**問題**: Webview内でボタンクリックが動作しない
**原因**: `onclick` 属性がCSPでブロックされていた
**解決**: `addEventListener` に変更

### 事例2: パス不一致（#116-1）

**問題**: WSL環境でWebviewのリソースが読み込めない
**原因**: Windowsパス形式でハードコードされていた
**解決**: `vscode.Uri.joinPath()` + `asWebviewUri()` に変更

### 事例3: fetch相対URL失敗（#408）

**問題**: Webview内で `fetch('/api/tasks')` がエラー
**原因**: 相対URLが `vscode-webview://xxx/api/tasks` に解決された
**解決**: Extension Hostからサーバーの絶対URL（`http://localhost:3100`）を渡し、`fetch(`${serverBaseUrl}/api/tasks`)` に変更
