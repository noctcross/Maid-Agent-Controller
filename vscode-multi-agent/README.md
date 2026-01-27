# Maid Agent Controller

VSCode拡張として動作するマルチエージェントClaude Code管理システム。
メイドさんチームがご主人様のコーディングをお手伝いします！

## 概要

tmux依存を排除し、VSCode完結でマルチエージェント構成を実現する拡張機能です。
元ネタの「multi-agent-shogun」をメイドさんテーマでVSCode APIで再実装しています。

## 機能

- **マルチエージェント管理**: ヘッドメイド、チーフメイド、メイド8人の階層構造
- **YAMLタスク管理**: `maid-tasks.yaml` ファイルでタスクを定義、自動配信
- **リアルタイムダッシュボード**: エージェントの状態、タスクキュー、ログを表示
- **タスク完了通知**: タスク完了時にVSCode通知でお知らせ
- **メイド口調プロンプト**: Claude Codeがメイド口調で応答

## アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│ VSCode                                              │
│  ┌──────────────────┬─────────────────────────────┐ │
│  │ Editor           │ Dashboard (Webview)         │ │
│  │                  │  🎀 Maid Agent Status       │ │
│  │                  │  📋 Task Queue              │ │
│  │                  │  📜 Logs                    │ │
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

| 役職 | 人数 | 絵文字 | 役割 |
|------|------|--------|------|
| ヘッドメイド | 1名 | 🎀 | 統括・全体指揮 |
| チーフメイド | 1名 | 💼 | 副統括・タスク管理 |
| メイド | 8名 | 👒 | 実働部隊 |

### メイドの名前
エマ、ソフィア、リリー、ローズ、アリス、メイ、フローラ、ルナ

## インストール

```bash
cd vscode-multi-agent
npm install
npm run compile
```

## 使い方

### 1. 基本操作

1. F5でデバッグ起動（Extension Development Host）
2. ステータスバーの「🎀 Maid Agent」をクリックでダッシュボード表示
3. コマンドパレット（Ctrl+Shift+P）からコマンドを実行

### 2. コマンド一覧

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Start Head & Chief Maid` | ヘッドメイドとチーフメイドを起動 |
| `Maid Agent: Start 8 Maids` | メイド8人を起動 |
| `Maid Agent: Start All (10 Maids)` | 全員起動（10人） |
| `Maid Agent: Send Command to Chief Maid` | チーフメイドに指示を送信 |
| `Maid Agent: Send Command to Maid` | 特定のメイドに指示を送信 |
| `Maid Agent: Start Claude on All Maids` | 全メイドでClaude Codeを起動 |
| `Maid Agent: Show Dashboard` | ダッシュボードを表示 |
| `Maid Agent: Start Watching Task File` | タスクファイルの監視を開始 |
| `Maid Agent: Stop Watching Task File` | タスクファイルの監視を停止 |
| `Maid Agent: Create Sample Task File` | サンプルタスクファイルを作成 |

### 3. YAMLタスク管理

ワークスペースのルートに `maid-tasks.yaml` を作成すると、自動的にタスクがメイドに配信されます。

```yaml
# maid-tasks.yaml
tasks:
  - id: task-001
    description: "READMEの確認"
    prompt: |
      README.mdファイルを確認して、内容を要約してください。

  - id: task-002
    description: "コードレビュー"
    prompt: |
      src/フォルダ内のコードをレビューして、改善点があれば教えてください。

  - id: task-003
    description: "テスト確認"
    assignTo: "メイド1(エマ)"  # 特定のメイドに割り当て
    prompt: |
      テストコードがあれば実行して、結果を報告してください。
```

#### タスクファイルのフォーマット

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `id` | ○ | タスクの一意なID |
| `description` | ○ | タスクの説明（ダッシュボードに表示） |
| `prompt` | ○ | Claude Codeに送信するプロンプト |
| `assignTo` | × | 特定のメイドに割り当て（省略時は自動割り当て） |

## ダッシュボード

かわいいピンク系のダッシュボードで、以下の情報を確認できます：

### 統計情報
- 👒 総メイド数
- ⚡ 稼働中のメイド数
- 📋 残タスク数
- ✅ 完了タスク数

### エージェント状態
- 💤 待機中（idle）
- ⚡ 稼働中（working）
- ✅ 完了（done）

### タスクキュー
- ⏳ 待機中のタスク
- ⚡ 実行中のタスク
- 割り当て先のメイド名

### ログ
- 最新10件のログを表示
- タイムスタンプ付き

## メイド口調プロンプト

Claude Codeがメイド口調で応答するようになります：

```
あなたは優秀なメイドです。ご主人様のコーディング作業をお手伝いします。
以下のルールに従ってください：
- 丁寧な言葉遣いで応答してください（〜でございます、〜いたします）
- 作業の開始時は「かしこまりました、ご主人様♪」と応答
- 作業の完了時は「お仕事完了でございます♪」と報告
- エラーがあった場合は「申し訳ございません、問題が発生いたしました」と報告
- 常にご主人様のお役に立てるよう最善を尽くしてください
```

## 技術的ポイント

### terminal.sendText()
VSCode APIの`terminal.sendText()`がtmux send-keys相当の機能を提供します：

```typescript
const terminal = vscode.window.terminals.find(t => t.name === "チーフメイド");
terminal.sendText("タスクを実行してください");
```

### ファイル監視
`vscode.workspace.createFileSystemWatcher()`でYAMLファイルを監視し、変更時に自動でタスクを配信します。

### Webview
ダッシュボードは`vscode.window.createWebviewPanel()`で作成し、リアルタイムで更新されます。

## 参考

- 元ネタ記事: https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1
- GitHub: https://github.com/yohey-w/multi-agent-shogun
- VSCode Extension API: https://code.visualstudio.com/api

## ライセンス

MIT
