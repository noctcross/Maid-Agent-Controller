---
name: vscode-extension
description: VSCode拡張機能の開発・リリースに関するベストプラクティス。Webview制約対応、リリース手順、MCP連携などのパターンを含む。拡張機能開発・デバッグ・リリース時に使用。
version: 1.0
patterns: ["webview", "release"]
---

# VSCode Extension Development

## Overview

VSCode拡張機能の開発・リリースに関するスキル。
Webview開発時の制約対応やリリース前チェックリストなど、繰り返し必要になるパターンを集約。

## When to Use

- VSCode拡張機能を新規開発する時
- Webviewパネルを実装する時
- 拡張機能をリリース・アップデートする時
- CSPエラーやパス不一致のデバッグ時

## Prerequisites

- Node.js / npm
- VSCode Extension API の基礎知識
- TypeScript（推奨）

## Quick Start

### 開発時

1. Webview実装時は [Webview Pattern](resources/patterns/webview.md) を確認
2. CSPエラーが発生したら同パターンのチェックリストを参照
3. WSL環境ではパス変換に注意

### リリース時

1. [Release Pattern](resources/patterns/release.md) のチェックリストを実行
2. package.json のバージョン更新
3. vsix パッケージ作成・テスト
4. ユーザー向け手順を準備

## Patterns

### [Webview Development](resources/patterns/webview.md)

VSCode Webview開発時の制約とベストプラクティス:
- CSP (Content Security Policy) 対応
- インラインイベントハンドラー禁止
- WSL/Windows パス形式の統一
- webview固有API（acquireVsCodeApi, postMessage）

### [Release Checklist](resources/patterns/release.md)

拡張機能リリース前のチェックリスト:
- vsix パッケージ作成・検証
- 設定継続性確認
- MCP互換性確認
- ユーザー向け推奨手順

## Guidelines

### 一般的な注意点

1. **CSPを軽視しない**: VSCode Webviewは厳格なCSPが適用される
2. **パス変換を意識する**: WSL環境ではWindowsパスとUnixパスが混在
3. **非同期処理を適切に**: Extension Host はシングルスレッド
4. **設定の互換性**: バージョンアップ時は既存設定の継続性を確認

### デバッグのヒント

- `Developer: Toggle Developer Tools` でWebviewをデバッグ
- Extension Development Host のコンソールを確認
- `vscode.window.showErrorMessage()` でユーザーにエラー通知

## Examples

### Webview CSP設定例

```typescript
const webview = panel.webview;
webview.options = {
  enableScripts: true,
  localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
};

// CSP準拠のHTML生成
const nonce = getNonce();
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource};">
</head>
<body>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    // ...
  </script>
</body>
</html>
`;
```

### パス変換例（WSL対応）

```typescript
function toWebviewUri(webview: vscode.Webview, extensionUri: vscode.Uri, relativePath: string): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, relativePath));
}
```
