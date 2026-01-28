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

コマンドパレット（`Ctrl+Shift+P`）から `init` と入力:

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Init` | `.maid-agent/` ディレクトリを作成 |

> **Note**: コマンドパレットではファジー検索が使えます。
> 例: `call all`, `call xn`, `butler` など部分入力でOK

### 3. エージェントを召喚

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Call All` | all | 全員起動（執事+メイド長+メイド8人） |
| `Call Butler` | butler | 執事のみ起動 |
| `Call Chief` | chief | メイド長のみ起動 |
| `Call Maids x8` | x8 | メイド8人のみ起動 |
| `Call Maids Pick` | pick | チェックボックスでメイドを選択 |
| `Call Maids xN` | xn | 執事+メイド長+メイドN人を起動（ランダム/順番選択可） |

### 4. タスクを実行

**執事のターミナルに直接入力してください。**

執事のターミナル（🎩 執事）を選択し、Claude Code に直接タスクを入力します。
執事がタスクを分析し、メイド長→メイドへと階層的に処理されます。

### 5. 進捗確認

#### サイドバー（エージェントパネル）

Activity Bar に「Maid Agent」アイコンが表示されます。
ターミナルタブを切り替えると、該当エージェントの立ち絵が表示されます。

#### ダッシュボード

- ステータスバーの「🎩 Maid Agent」をクリック
- または `Dashboard` コマンド

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
└── images/                # カスタム立ち絵（オプション）
```

## カスタム立ち絵

`.maid-agent/images/` にキャラクター画像を配置すると、
サイドバーのエージェントパネルに表示されます。

### 推奨サイズ

| 項目 | 推奨値 |
|-----|-------|
| サイズ | 幅200〜300px × 高さ300〜500px |
| 縦横比 | 縦長（立ち絵スタイル） |
| 形式 | PNG（透過推奨）/ JPG / WebP |

### ファイル命名

```
基本:     emma.png
バージョン違い: emma_1.png, emma_2.png  (ランダム選択)
ステータス別:  emma_wait.png, emma_work.png  (自動切替)
```

詳細は `.maid-agent/images/README.md` を参照。

## 全コマンド一覧

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Init` | init | ワークスペース初期化 |
| `Call All` | all | 全員起動 |
| `Call Butler` | butler | 執事起動 |
| `Call Chief` | chief | メイド長起動 |
| `Call Maids x8` | x8 | メイド8人のみ起動 |
| `Call Maids Pick` | pick | 選択して起動 |
| `Call Maids xN` | xn | 執事+メイド長+メイドN人起動 |
| `Claude Start` | claude | 全ターミナルでClaude起動 |
| `Task to Butler` | task butler | 執事にタスク送信 |
| `Task to Maid` | task maid | 特定メイドに送信 |
| `Dashboard` | dashboard | ダッシュボード表示 |
| `Watch Start` | watch start | YAMLファイル監視開始 |
| `Watch Stop` | watch stop | YAMLファイル監視停止 |

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

## multi-agent-shogun との違い

| 項目 | multi-agent-shogun | Maid Agent Controller |
|------|-------------------|----------------------|
| 環境 | tmux (Linux/macOS) | VSCode (クロスプラットフォーム) |
| ターミナル管理 | tmux send-keys | terminal.sendText() |
| 階層構造 | 将軍→家老→足軽 | 執事→メイド長→メイド |
| GUI | なし | サイドバー + ダッシュボード |
| 起動方法 | シェルスクリプト | VSCodeコマンド |
| 立ち絵表示 | なし | サイドバーパネル（ステータス連動） |

## 参考

- 元ネタ: [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)
- 記事: https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1
- VSCode API: https://code.visualstudio.com/api

## ライセンス

MIT
