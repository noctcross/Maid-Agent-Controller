# Multi Agent Controller

VSCode拡張として動作するマルチエージェントClaude Code管理システム。

## 概要

tmux依存を排除し、VSCode完結でマルチエージェント構成を実現する拡張機能です。
元ネタの「multi-agent-shogun」をVSCode APIで再実装しています。

## アーキテクチャ

```
┌─────────────────────────────────────────────┐
│ VSCode                                      │
│  ┌──────────────────┬────────────────────┐  │
│  │ Editor           │ Dashboard(Webview) │  │
│  │                  │  🏯 Agent Status   │  │
│  ├──────────────────┴────────────────────┤  │
│  │ Terminal Panes                        │  │
│  │ ┌──────────────┐ ┌──────────────────┐ │  │
│  │ │🏯 将軍(Shogun)│ │🏯 家老(Karo)     │ │  │
│  │ │ Claude Code  │ │ Claude Code      │  │ │
│  │ └──────────────┘ └──────────────────┘ │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 技術的ポイント

`terminal.sendText()` がtmux send-keys相当の機能を提供します：

```typescript
const terminal = vscode.window.terminals.find(t => t.name === "家老");
terminal.sendText("タスクを実行せよ");
```

## インストール

```bash
npm install
npm run compile
```

## 使い方

1. F5でデバッグ起動
2. コマンドパレット（Ctrl+Shift+P）から：
   - `Multi Agent: Start Agents (Shogun + Karo)` - 将軍と家老を起動
   - `Multi Agent: Send Command to Karo` - 家老にコマンドを送信
   - `Multi Agent: Show Dashboard` - ダッシュボードを表示

## コマンド

| コマンド | 説明 |
|---------|------|
| `multiAgent.startAgents` | 将軍と家老のターミナルを作成 |
| `multiAgent.sendToKaro` | 家老にコマンドを送信 |
| `multiAgent.showDashboard` | エージェント状態のダッシュボードを表示 |

## 今後の実装予定

- [ ] 足軽8体の追加
- [ ] Claude Code自動起動（`claude` コマンド送信）
- [ ] YAMLタスク管理（ファイル監視で自動配信）
- [ ] 戦国口調のプロンプト設定
- [ ] 進捗のリアルタイム表示強化

## 参考

- 元ネタ記事: https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1
- GitHub: https://github.com/yohey-w/multi-agent-shogun
- VSCode Extension API: https://code.visualstudio.com/api
