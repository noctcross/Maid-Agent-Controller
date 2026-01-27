# Maid Agent Controller

VSCode拡張として動作するマルチエージェントClaude Code管理システム。
メイドさんチームがご主人様のコーディングをお手伝いします！

## 概要

tmux依存を排除し、VSCode完結でマルチエージェント構成を実現する拡張機能です。
元ネタの「multi-agent-shogun」をメイドさんテーマでVSCode APIで再実装しています。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│ VSCode                                              │
│  ┌──────────────────┬─────────────────────────────┐ │
│  │ Editor           │ Dashboard (Webview)         │ │
│  │                  │  🎀 Maid Agent Status       │ │
│  ├──────────────────┴─────────────────────────────┤ │
│  │ Terminal Panes                                 │ │
│  │ ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │ │
│  │ │🎀 ヘッドメイド│ │💼 チーフメイド│ │👒 メイド×8│  │ │
│  │ │ Claude Code │ │ Claude Code │ │Claude Code│  │ │
│  │ └─────────────┘ └─────────────┘ └───────────┘  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### メイドさん階層

| 役職 | 人数 | 役割 |
|------|------|------|
| 🎀 ヘッドメイド | 1名 | 統括・全体指揮 |
| 💼 チーフメイド | 1名 | 副統括・タスク管理 |
| 👒 メイド | 8名 | 実働部隊（エマ、ソフィア、リリー、ローズ、アリス、メイ、フローラ、ルナ） |

## 技術的ポイント

`terminal.sendText()` がtmux send-keys相当の機能を提供します：

```typescript
const terminal = vscode.window.terminals.find(t => t.name === "チーフメイド");
terminal.sendText("タスクを実行してください");
```

## インストール

```bash
npm install
npm run compile
```

## 使い方

1. F5でデバッグ起動
2. コマンドパレット（Ctrl+Shift+P）から以下のコマンドを実行：

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Start Head & Chief Maid` | ヘッドメイドとチーフメイドを起動 |
| `Maid Agent: Start 8 Maids` | メイド8人を起動 |
| `Maid Agent: Start All (10 Maids)` | 全員起動（10人） |
| `Maid Agent: Send Command to Chief Maid` | チーフメイドに指示を送信 |
| `Maid Agent: Send Command to Maid` | 特定のメイドに指示を送信 |
| `Maid Agent: Start Claude on All Maids` | 全メイドでClaude Codeを起動 |
| `Maid Agent: Show Dashboard` | ダッシュボードを表示 |

## ダッシュボード

かわいいピンク系のダッシュボードで、メイドさんたちの状態を確認できます：

- 総メイド数
- 稼働中のメイド数
- 各メイドのステータス（💤 待機中 / ⚡ 稼働中 / ✅ 完了）

## 今後の実装予定

- [ ] YAMLタスク管理（ファイル監視で自動配信）
- [ ] メイド口調のプロンプト設定
- [ ] 進捗のリアルタイム表示強化
- [ ] タスク完了通知

## 参考

- 元ネタ記事: https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1
- GitHub: https://github.com/yohey-w/multi-agent-shogun
- VSCode Extension API: https://code.visualstudio.com/api
