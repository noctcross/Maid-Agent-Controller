# Maid Agent Controller

VSCode拡張として動作するマルチエージェントClaude Code管理システム。
**multi-agent-shogun** の階層構造をVSCode上で再現します。

## 階層構造

```
┌─────────────────┐
│  🎩 執事        │ ← ユーザーからタスクを受け取り、分解
│  (Butler)       │
└────────┬────────┘
         │ サブタスクを指示
         ▼
┌─────────────────┐
│  👑 メイド長    │ ← サブタスクを各メイドに配分
│  (Chief Maid)   │
└────────┬────────┘
         │ 個別タスクを指示
         ▼
┌──┬──┬──┬──┬──┬──┬──┬──┐
│🎀│🎀│🎀│🎀│🎀│🎀│🎀│🎀│ ← 並列実行
│エ│ソ│リ│ロ│ア│メ│フ│ル│
│マ│フ│リ│｜│リ│イ│ロ│ナ│
│  │ィ│｜│ズ│ス│  │ラ│  │
│  │ア│  │  │  │  │  │  │
└──┴──┴──┴──┴──┴──┴──┴──┘
```

## インストール

```bash
cd vscode-multi-agent
npm install
npm run compile
```

## 使い方

### 1. 起動

```
F5でデバッグ起動 → Extension Development Host が開く
```

### 2. 初期化

コマンドパレット（`Ctrl+Shift+P`）から `initialize` と入力:

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Initialize Workspace` | `.maid-agent/` ディレクトリを作成 |

> **Note**: コマンドパレットでは部分一致検索ができます。
> 例: `initialize` や `start all` と入力するだけでコマンドが見つかります。

### 3. エージェントを起動

| コマンド | 説明 |
|---------|------|
| `Start All (10 Agents)` | 全員起動（執事+メイド長+メイド8人） |
| `Start Butler` | 執事のみ起動 |
| `Start Chief Maid` | メイド長のみ起動 |
| `Start 8 Maids` | メイド8人を起動 |
| `Start Selected Maids` | チェックボックスでメイドを選択して起動 |
| `Start Maids By Count` | 人数を指定して起動（ランダム/順番選択可） |

### 4. タスクを実行

**執事のターミナルに直接入力してください。**

執事のターミナル（🎩 執事）を選択し、Claude Code に直接タスクを入力します。
執事がタスクを分析し、メイド長→メイドへと階層的に処理されます。

> 補助コマンドとして `Send Task to Butler` もありますが、
> 通常は直接ターミナルに入力する方がシンプルです。

### 5. 進捗確認

#### サイドバー（エージェントパネル）

Activity Bar に「Maid Agent」アイコンが表示されます。
現在アクティブなターミナルのエージェント情報が表示されます。

#### ダッシュボード

- ステータスバーの「🎩 Maid Agent」をクリック
- または `Show Dashboard` コマンド

## ファイル構成

初期化後、`.maid-agent/` ディレクトリが作成されます：

```
.maid-agent/
├── CLAUDE.md              # 詳細設計書
├── dashboard.md           # 進捗ダッシュボード
├── config/
│   └── settings.yaml      # 設定ファイル
├── context/               # プロジェクト固有コンテキスト
├── instructions/          # 各役割の指示書
│   ├── butler.md
│   ├── chief.md
│   └── maid.md
├── queue/                 # タスクキュー
│   ├── butler_to_chief.yaml
│   └── chief_to_maids.yaml
├── reports/               # メイドからの報告
├── skills/                # 承認済みスキル
│   └── skill-creator/     # スキル作成ガイド
├── status/
│   └── master_status.yaml
└── images/                # カスタム画像（オプション）
```

## カスタム画像

`.maid-agent/images/` にエージェント画像を配置すると、
サイドバーのエージェントパネルに表示されます。

対応ファイル名:
- `butler.png` / `butler.jpg` など
- `chief.png`
- `emma.png`, `sophia.png`, `lily.png`, `rose.png`
- `alice.png`, `may.png`, `flora.png`, `luna.png`

## スキルシステム

繰り返し使える作業パターンを「スキル」として保存できます。

1. メイドがスキル化候補を発見 → reports/ に記載
2. メイド長が集約 → dashboard.md に記載
3. 執事が確認 → ユーザーに報告
4. ユーザーが承認 → skills/ に作成

詳細は `.maid-agent/skills/skill-creator/SKILL.md` を参照。

## Memory MCP

Memory MCP が利用可能な場合、セッション間で知識を共有できます。
各エージェントはセッション開始時に過去の知識グラフを読み込みます。

## 全コマンド一覧

| コマンド | 説明 |
|---------|------|
| `Initialize Workspace` | ワークスペース初期化 |
| `Start All (10 Agents)` | 全員起動 |
| `Start Butler` | 執事起動 |
| `Start Chief Maid` | メイド長起動 |
| `Start 8 Maids` | メイド8人起動 |
| `Start Selected Maids` | 選択したメイドを起動 |
| `Start Maids By Count` | 人数指定で起動 |
| `Start Claude in Current Terminal` | 現在のターミナルでClaude起動 |
| `Send Task to Butler` | 執事にタスク送信（補助） |
| `Send Task to Maid` | 特定メイドに送信（補助） |
| `Show Dashboard` | ダッシュボード表示 |
| `Watch Task File` | YAMLファイル監視開始 |
| `Stop Watch Task File` | YAMLファイル監視停止 |

## multi-agent-shogun との違い

| 項目 | multi-agent-shogun | Maid Agent Controller |
|------|-------------------|----------------------|
| 環境 | tmux (Linux/macOS) | VSCode (クロスプラットフォーム) |
| ターミナル管理 | tmux send-keys | terminal.sendText() |
| 階層構造 | 将軍→家老→足軽 | 執事→メイド長→メイド |
| GUI | なし | サイドバー + ダッシュボード |
| 起動方法 | シェルスクリプト | VSCodeコマンド |
| 画像表示 | なし | サイドバーパネル |

## 参考

- 元ネタ: [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)
- 記事: https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1
- VSCode API: https://code.visualstudio.com/api

## ライセンス

MIT
