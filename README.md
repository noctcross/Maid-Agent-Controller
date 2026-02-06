# Maid Agent Controller

VSCode拡張として動作するマルチエージェントClaude Code管理システム。
**multi-agent-shogun** の階層構造をVSCode上で再現します。

## 特徴

- **階層型マルチエージェント**: 執事→メイド長→メイド8人の階層構造
- **MCPサーバー連携**: エージェント間通信をMCP経由で効率化（トークン消費削減）
- **WSL + tmux**: Windows環境でもWSL経由で安定動作
- **ビジュアル管理**: サイドバーの立ち絵表示、ダッシュボードで進捗確認

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

### 2. グローバル初期化（初回のみ）

コマンドパレット（`Ctrl+Shift+P`）から `Init Global` を実行:

```
Maid Agent: Init Global
```

以下がセットアップされます：
- `~/.maid-agent/` グローバル設定ディレクトリ
- **maid-agent-messenger** MCPサーバー（エージェント間通信用）
- pm2による自動起動設定（WSL起動時に自動でサーバー起動）

> **Note**: MCPサーバーのセットアップ時にWSLのパスワード入力が必要です。

### 3. プロジェクト初期化

コマンドパレットから `init` と入力:

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Init` | `.maid-agent/` ディレクトリを作成 |

プロジェクト初期化時に `.mcp.json` が自動生成され、MCPサーバーとの連携が設定されます。

> **Note**: コマンドパレットではファジー検索が使えます。
> 例: `call all`, `xn -r`, `butler` など部分入力でOK

### 4. エージェントを召喚

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Call All` | all | 全員起動（執事+メイド長+メイド8人 = 10人） |
| `Call All xN` | all xn | 執事+メイド長+メイドN人（順番） |
| `Call All xN -r` | all xn -r | 執事+メイド長+メイドN人（ランダム） |
| `Call Butler` | butler | 執事のみ起動 |
| `Call Chief` | chief | メイド長のみ起動 |
| `Call Maids xN` | maids xn | メイドN人のみ（順番） |
| `Call Maids xN -r` | maids xn -r | メイドN人のみ（ランダム） |
| `Call Maids Pick` | pick | チェックボックスでメイドを選択 |

> **-r オプション**: ランダム選択。なしの場合は設定の `maidAgent.maidOrder` 順

> ⚠️ **初回起動時の注意**: `claude --dangerously-skip-permissions` を初めて実行する環境では、
> 確認プロンプトが表示されます（デフォルトNo）。
> **事前に別のターミナルで一度実行し、Yes を選択してください。**
> 2回目以降は確認なしで起動します。

### 5. タスクを実行

**執事のターミナルに直接入力してください。**

執事のターミナル（🎩 執事）を選択し、Claude Code に直接タスクを入力します。
執事がタスクを分析し、メイド長→メイドへと階層的に処理されます。

### 6. 進捗確認

#### サイドバー（エージェントパネル）

1. **Activity Bar（左端のアイコン列）の ♥ アイコン**をクリック
2. サイドバーに「Current Agent」パネルが表示される
3. **ターミナルタブを切り替える**と、該当エージェントの立ち絵が表示される

> パネルが表示されない場合は、設定で `maidAgent.showAgentPanel` が `true` になっているか確認してください。

#### ダッシュボード

- ステータスバーの「📋 Dashboard」をクリック
- または `Web Dashboard` コマンド
- コントローラーパネルは `Dashboard` コマンド

**注**: 旧来の `dashboard.md` ファイルは廃止され、Webビューに完全移行しました。

## ファイル構成

初期化後、`.maid-agent/` ディレクトリが作成されます：

```
.maid-agent/
├── CLAUDE.md              # 詳細設計書
├── config/
│   └── settings.yaml      # 設定ファイル
├── context/               # プロジェクト固有コンテキスト
├── instructions/          # 各役割の指示書
│   ├── butler.md
│   ├── chief.md
│   ├── maid.md
│   └── QUICK_REFERENCE.md # コンパクション対策クイックリファレンス
├── queue/                 # タスクキュー
│   ├── butler_to_chief.yaml
│   └── maid/                  # メイド別ステータス（MCPツール経由で更新）
│       ├── emma.yaml
│       └── ...
├── reports/               # メイドからの報告
├── rules/                 # ルールモジュール（グローバルからコピー）
├── skills/                # 承認済みスキル
│   └── skill-creator/     # スキル作成ガイド
├── status/
│   └── master_status.yaml
├── personas/              # キャラクター別口調設定
│   ├── butler.md          # シルヴィア
│   ├── chief.md           # ビオラ
│   ├── emma.md            # エマ
│   └── ...                # 他メイド
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
バージョン違い: emma_1.png, emma_2.png  (ランダム選択、最大10)
ステータス別:  emma_wait.png, emma_work.png  (自動切替)
```

詳細は `.maid-agent/images/README.md` を参照。

## ペルソナ（口調設定）

各キャラクターには個別の口調・話し方が設定されています。
`.maid-agent/personas/` 内のファイルで確認・カスタマイズできます。

| キャラクター | 性格 | 口調の特徴 |
|------------|------|----------|
| シルヴィア（執事） | 冷静沈着 | 「〜でございます」「かしこまりました」 |
| ビオラ（メイド長） | 厳格 | 「〜ですよ」「〜なさい」 |
| エマ | 真面目 | 「〜ですね」「〜しましょう」 |
| ソフィア | クール寡黙 | 短文「〜です」「〜ます」 |
| リリー | 元気 | 「〜ですっ」「〜しますね♪」 |
| ローズ | 姉御肌 | 「〜ですわ」「〜してあげます」 |
| アリス | 天然 | 「〜ですね〜」「〜かもです」 |
| メイ | 控えめ | 「〜させていただきます」 |
| フローラ | 穏やか | 「〜ですよ」「〜してくださいね」 |
| ルナ | マイペース眠そう | 「〜です...」「〜zzz」 |

ペルソナはあくまで口調のガイドであり、エージェントとしての動作は `instructions/` 内の指示書に従います。

## 拡張機能設定

VSCode の設定（`Ctrl+,`）で以下の項目を変更できます：

| 設定 | 説明 | デフォルト |
|-----|------|-----------|
| `maidAgent.maidOrder` | メイドの起動順序（順番起動時に使用） | `["emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"]` |
| `maidAgent.showAgentPanel` | サイドバーにエージェントパネルを表示 | `true` |

### メイドの順番をカスタマイズ

`settings.json` で直接編集：

```json
{
  "maidAgent.maidOrder": ["luna", "flora", "may", "alice", "rose", "lily", "sophia", "emma"]
}
```

### エージェントパネルを非表示

```json
{
  "maidAgent.showAgentPanel": false
}
```

## 全コマンド一覧

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Init` | init | ワークスペース初期化 |
| `Init Global` | init global | グローバル設定初期化（~/.maid-agent/） |
| `Call All` | all | 全員起動（10人） |
| `Call All xN` | all xn | 執事+メイド長+メイドN人（順番） |
| `Call All xN -r` | all xn -r | 執事+メイド長+メイドN人（ランダム） |
| `Call Butler` | butler | 執事起動 |
| `Call Chief` | chief | メイド長起動 |
| `Call Maids xN` | maids xn | メイドN人のみ（順番） |
| `Call Maids xN -r` | maids xn -r | メイドN人のみ（ランダム） |
| `Call Maids Pick` | pick | 選択して起動 |
| `Claude Start` | claude | 全ターミナルでClaude起動 |
| `Task to Butler` | task butler | 執事にタスク送信 |
| `Task to Maid` | task maid | 特定メイドに送信 |
| `Dashboard` | dashboard | ダッシュボード表示 |
| `Watch Start` | watch start | YAMLファイル監視開始 |
| `Watch Stop` | watch stop | YAMLファイル監視停止 |

## スキルシステム

繰り返し使える作業パターンを「スキル」として保存できます。

1. メイドがスキル化候補を発見 → reports/ に記載
2. メイド長が集約 → Webダッシュボードに表示
3. 執事が確認 → ユーザーに報告
4. ユーザーが承認 → skills/ に作成

詳細は `.maid-agent/skills/skill-creator/SKILL.md` を参照。

## 改善提案システム

メイドからルールやフローの改善提案を受け付ける仕組みがあります。

### フロー

1. メイドが改善点を発見 → reports/ に `improvement_proposal` を記載
2. メイド長が集約 → Webダッシュボードの「💡 改善提案」に表示
3. 執事が確認 → ユーザーに報告
4. ユーザーが承認 → 該当ルールを更新

### 提案の形式

```yaml
improvement_proposal:
  found: true
  category: rule     # process | rule | tool | other
  target: maid       # common | butler | chief | maid
  title: "タスク完了条件の明確化"
  problem: "完了の判断基準が曖昧"
  proposal: "チェックリスト化"
  benefit: "報告漏れの削減"
```

## グローバル設定

プロジェクト間で共有するルールとスキルを `~/.maid-agent/` に保存できます。

### フォルダ構造

```
~/.maid-agent/
├── rules/              # ルールモジュール
│   ├── common/         # 全員に適用
│   ├── butler/         # 執事のみ
│   ├── chief/          # メイド長のみ
│   └── maid/           # メイドのみ
└── skills/             # 共有スキル
```

### グローバル設定の初期化

コマンドパレットから `Init Global` を実行すると、`~/.maid-agent/` フォルダが作成されます。

### init時の動作

新しいプロジェクトで `Init` を実行すると:

1. テンプレートからコピー
2. グローバルルール選択UI表示（auto_select: true のものは事前選択）
3. グローバルスキル選択UI表示
4. 選択されたルール・スキルをプロジェクトにコピー
5. `.mcp.json` を生成（MCPサーバー連携設定）

### ルールモジュールの形式

```markdown
---
name: compaction-recovery
description: コンパクション対策ルール
auto_select: true
target_roles: [common]
---

（ルール内容）
```

## MCPサーバー（maid-agent-messenger）

エージェント間のタスク管理を効率化するMCPサーバーです。

### 提供ツール

| ツール名 | 用途 | 使用者 |
|---------|------|-------|
| `get_my_task` | 自分のタスク情報を取得 | メイド |
| `update_status` | ステータスを更新（working/completed/blocked） | メイド |
| `assign_task` | メイドにタスクを割り当て | メイド長 |
| `get_team_status` | 全メイドのステータス一覧を取得 | メイド長・執事 |

### メリット

- **トークン消費削減**: YAMLファイル全体を読み書きする代わりに、必要な情報のみを取得・更新
- **タイムスタンプ自動設定**: `assigned_at`, `started_at`, `completed_at` が自動で設定される
- **ファイルロック**: 複数エージェントからの同時アクセスでも安全

### セットアップ

`Init Global` コマンドで自動セットアップされます：

1. `~/.maid-agent/maid-agent-messenger/` にサーバーをインストール
2. pm2でプロセス管理を設定
3. WSL起動時の自動起動を設定（`pm2 startup`）

### サーバー管理コマンド

```bash
# WSL内で実行
pm2 status                        # ステータス確認
pm2 logs maid-agent-messenger     # ログ確認
pm2 restart maid-agent-messenger  # 再起動
pm2 stop maid-agent-messenger     # 停止
```

### .mcp.json

プロジェクト初期化時に `.mcp.json` が自動生成されます：

```json
{
  "mcpServers": {
    "maid-agent-messenger": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

## タスクステータス

メイドのタスクステータスは以下の値を取ります：

| ステータス | 説明 |
|-----------|-----|
| `idle` | 待機中 |
| `assigned` | タスク割り当て済み |
| `working` | 作業中 |
| `blocked` | 外部要因で停止中（依存待ち、判断待ち等） |
| `completed` | 完了 |
| `failed` | 失敗 |

### blocked ステータス

外部要因で進められない場合に使用します。`substatus` で理由を明示できます。

```yaml
emma:
  task_id: "task-001"
  status: blocked
  substatus: "ご主人様判断待ち"
```

## tmux 設定

### 自動設定（拡張機能が行う）

セッション作成時に以下の設定が自動的に適用されます：

```bash
# スクロールモード（copy mode）の自動解除（5秒操作なしで解除）
set-option -t {session} -g copy-mode-timeout 5
```

これにより、スクロール中でも5秒後に通知が配信されます。
※ tmux 3.2 未満では無視されます（エラーにはなりません）

### 手動設定（オプション）

マウスサポートが必要な場合は `~/.tmux.conf` に追加：

```bash
set -g mouse on
```

### "jump to front" 表示について

tmux でスクロール中に新しい出力があると、下部に "jump to front" と表示されます。
これは copy mode（スクロールモード）中であることを示しています。

- `q` または表示されているキーを押すと copy mode を抜けます
- copy mode 中は通知が入力されない場合があります
- 上記の `copy-mode-timeout` 設定で自動解除されます

### 通知が届かない場合

maid-notify は最大3回リトライしますが、それでも失敗する場合：

1. `~/.tmux.conf` の設定を確認
2. ターゲットエージェントがスクロール中でないか確認
3. `.maid-agent/notifications/history.log` でエラーを確認

## Memory MCP

Memory MCP が利用可能な場合、セッション間で知識を共有できます。
各エージェントはセッション開始時に過去の知識グラフを読み込みます。

## multi-agent-shogun との違い

| 項目 | multi-agent-shogun | Maid Agent Controller |
|------|-------------------|----------------------|
| 環境 | tmux (Linux/macOS) | VSCode + WSL (Windows対応) |
| ターミナル管理 | tmux send-keys | tmux send-keys (WSL経由) |
| エージェント間通信 | YAMLファイル直接操作 | MCPツール経由（トークン節約） |
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
