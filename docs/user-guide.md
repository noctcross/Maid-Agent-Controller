# Maid-Agent ユーザーガイド（取扱説明書）

> 最終更新: 2026-02-12
> 対象バージョン: Maid-Agent v1.x

本ガイドは2部構成です:
- **Part I（汎用ガイド）**: Maid-Agent 拡張機能の基本操作（どのプロジェクトでも共通）
- **Part II（プロジェクト固有カスタマイズ）**: プロジェクトごとに異なるスキル・ルール・コンテキスト設定

---

## 目次

### Part I: 汎用ガイド

1. [初期セットアップ・設定](#1-初期セットアップ設定)
2. [設定ファイルリファレンス](#2-設定ファイルリファレンス)
3. [エージェント管理](#3-エージェント管理)
4. [外観・UI](#4-外観ui)
5. [タスク管理](#5-タスク管理)
6. [運用・メンテナンス](#6-運用メンテナンス)
7. [トラブルシューティング](#7-トラブルシューティング)

### Part II: プロジェクト固有カスタマイズ

8. [プロジェクトコンテキスト](#8-プロジェクトコンテキスト)
9. [ルールモジュール](#9-ルールモジュール)
10. [スキル管理](#10-スキル管理)

### 付録

- [付録A: ファイル構成一覧](#付録a-ファイル構成一覧)
- [付録B: コマンドリファレンス](#付録b-コマンドリファレンス)
- [付録C: 開発者向けガイド](#付録c-開発者向けガイド)

---

# Part I: 汎用ガイド

---

## 1. 初期セットアップ・設定

### 1-1. 前提条件

**WSLモード（推奨）**

| 項目 | 要件 |
|------|------|
| OS | WSL2 (Ubuntu) / macOS / Linux |
| Node.js | v18 以上 |
| tmux | インストール済み |
| VSCode | 最新版 |
| Claude Code | CLI インストール済み |
| PM2 | グローバルインストール済み (`npm install -g pm2`) |

**Windows-nativeモード（実験的）**

| 項目 | 要件 |
|------|------|
| OS | Windows 10/11（WSL不要） |
| Node.js | v18 以上（Windows上） |
| psmux | `winget install psmux` |
| Git for Windows | Git Bash 使用（推奨） |
| VSCode | 最新版 |
| Claude Code | CLI インストール済み |
| PM2 | グローバルインストール済み |

> **Windows-nativeモード**: psmux を使用してWSLなしで動作します。実験的機能のため、安定性を重視する場合はWSLモードを選択してください。

### 1-2. インストール手順

#### Step 1: VSCode 拡張のインストール

1. `.vsix` ファイルを入手する
2. VSCode を開く
3. 拡張機能パネル（`Ctrl+Shift+X`）→ 上部の「`...`」メニュー → 「**VSIXからインストール...**」を選択
4. 入手した `.vsix` ファイルを選択
5. インストール完了後、VSCode を再読み込み（コマンドパレット → `Developer: Reload Window`）

#### Step 2: グローバル初期化（Init Global）

VSCode コマンドパレット（`Ctrl+Shift+P`）から `Maid Agent: Init Global` を実行。

**Windows環境ではモード選択ダイアログが表示されます:**

| 選択肢 | 説明 |
|-------|------|
| **WSLを使用（従来通り）** | tmux で複数エージェントを管理。安定性重視。 |
| **Windows直接実行** | psmux でWSL不要。実験的機能。 |

このコマンドで以下が設定される:

- **MCPサーバーのデプロイ**: `~/.maid-agent/maid-agent-messenger/` に配置
- **PM2への登録**: MCPサーバーを常駐プロセスとして起動
- **グローバル設定の初期化**: `~/.maid-agent/` 配下の共通設定
- **ランタイムモード設定**: WSL / Windows-native の選択（Windows環境のみ）

```
~/.maid-agent/
├── maid-agent-messenger/    # MCPサーバー本体
│   └── dist/
├── system/
│   └── config/
│       └── maid-agent-messenger.yaml  # サーバー設定（runtime.mode含む）
└── rules/                   # グローバルルール（任意）
```

> **Note**: Init Global は VSCode 拡張インストール後、最初に1回だけ実行すれば十分です。

> **モード変更**: 後から `Maid Agent: Set Runtime Mode` コマンドでモードを変更できます。

#### Step 3: プロジェクト初期化（Init Project）

プロジェクトフォルダを開いた状態で、コマンドパレットから `Maid Agent: Init Project` を実行。

このコマンドで以下が作成される:

> **再初期化時の動作**: 既存の `.maid-agent/` がある場合、`agents/instructions/` は自動的に最新版に更新されます。カスタマイズしていた場合は `instructions/backup/` にバックアップが保存されるため、新旧を比較してカスタム設定を再適用できます。

```
.maid-agent/
├── CLAUDE.md              # システム詳細設計書
├── agents/
│   ├── context/           # プロジェクトコンテキスト
│   ├── instructions/      # 役割別指示書
│   ├── personas/          # ペルソナ定義
│   ├── rules/             # ルールモジュール
│   └── skills/            # 承認済みスキル
├── master/
│   └── reports/           # 報告書アーカイブ
└── system/
    ├── bin/               # maid-notify 等のスクリプト
    ├── config/            # settings.yaml, maid-agent-messenger.yaml
    ├── data/              # tasks.yaml, maid/, reports/
    └── resources/         # images/ 等
```

### 1-3. MCPサーバーの確認

MCPサーバー（maid-agent-messenger）はエージェント間のタスク管理を担当する中核コンポーネント。

#### 起動確認

```bash
# PM2でサーバーステータスを確認
pm2 status maid-agent-messenger

# ダッシュボードにアクセス
curl http://localhost:3100/dashboard
```

#### MCP接続設定

各エージェントのClaude Code設定（`~/.claude/projects/{project}/settings.json` または VSCode設定）にMCPサーバーが登録されている必要がある。VSCode拡張の `Init Project` で自動設定される。

### 1-4. tmux セッション構成

Maid-Agent は tmux セッションで複数のエージェントを並行稼働させる。

#### セッション構成

```
maid-session（セッション名）
├── butler    # 執事
├── chief     # メイド長
├── emma      # メイド
├── sophia    # メイド
├── lily      # メイド
├── rose      # メイド
├── alice     # メイド
├── may       # メイド
├── flora     # メイド
└── luna      # メイド
```

#### セッション名の設定

`.maid-agent/system/config/.session-name` にtmuxセッション名が保存される。VSCode拡張からエージェントを起動すると自動設定される。

#### 手動操作

```bash
# セッション一覧
tmux list-sessions

# 特定のウィンドウに切替
tmux select-window -t maid-session:emma

# 全ウィンドウ一覧
tmux list-windows -t maid-session
```

---

## 2. 設定ファイルリファレンス

### 2-1. settings.yaml

**場所**: `.maid-agent/system/config/settings.yaml`

全システム設定の中心ファイル。

#### language（言語設定）

```yaml
language: ja
```

| 値 | 説明 |
|----|------|
| `ja` | 日本語（メイド口調） |
| `en` | 英語 |
| `es`, `zh`, `ko`, `fr`, `de` | その他の言語 |

#### agents（エージェント設定）

```yaml
agents:
  butler:
    name: "執事"         # 表示名
    emoji: "🎩"          # フォールバック絵文字
  chief:
    name: "メイド長"
    emoji: "👑"
  maids:
    - name: "エマ"       # 表示名
      id: "emma"         # システムID（tmuxタブ名、通知先等で使用）
      emoji: "☕"        # フォールバック絵文字
      specialty: "コードレビュー"  # 得意分野（タスク割り当ての参考）
```

**カスタマイズポイント**:
- `name`: 表示名を自由に変更可能
- `emoji`: サイドバーで画像がない場合のフォールバック
- `specialty`: 得意分野の説明。メイド長がタスク割り当て時に参考にする
- メイドの追加・削除については [3. エージェント管理](#3-エージェント管理) を参照

#### model（LLMモデル設定）

```yaml
model:
  # 全エージェント共通のデフォルト
  default: "sonnet"

  # 役割別の指定（省略可、デフォルトより優先）
  roles:
    butler: "opus"       # 執事: 戦略立案に高性能モデル
    chief: "sonnet"      # メイド長: バランス型
    maid: "haiku"        # メイド: コスト効率重視

  # エージェント個別の指定（省略可、役割別より優先）
  agents:
    emma: "sonnet"       # 特定メイドだけ別モデル
```

**優先順位**: `agents.{id}` > `roles.{role}` > `default` > Claude Codeデフォルト

| モデル名 | 用途の目安 |
|---------|----------|
| `opus` | 複雑な戦略立案、設計作業 |
| `sonnet` | バランス型（デフォルト推奨） |
| `haiku` | 単純作業、コスト効率重視 |

省略時はClaude Codeのデフォルトモデルが使用される。

#### skills（スキル設定）

```yaml
skills:
  global_path: "~/.claude/skills/maid-generated/"  # 全プロジェクト共有
  local_path: ".maid-agent/skills/"                 # プロジェクト固有
```

#### screenshot（スクリーンショット設定）

```yaml
screenshot:
  windows_path: "C:\\Users\\{{USERNAME}}\\Pictures\\Screenshots"
  wsl_path: "/mnt/c/Users/{{USERNAME}}/Pictures/Screenshots"
```

WSL環境でスクリーンショットを参照する場合のパス設定。`{{USERNAME}}` は実際のユーザー名に置き換えて使用。

#### log（ログ設定）

```yaml
log:
  level: info    # debug, info, warn, error
  path: ".maid-agent/logs/"
```

#### memory（Memory MCP設定）

```yaml
memory:
  enabled: true
  graph_path: "~/.claude/memory/"
```

### 2-2. maid-agent-messenger.yaml

**場所**: `.maid-agent/system/config/maid-agent-messenger.yaml`

MCPサーバーの動作設定。

| セクション | 主要項目 | デフォルト | 説明 |
|-----------|---------|-----------|------|
| `server.mode` | `hybrid` | `hybrid` | `central` / `local` / `hybrid` |
| `server.port` | `3100` | `3100` | 中央サーバーのポート。複数プロジェクト時は変更 |
| `server.host` | `0.0.0.0` | `0.0.0.0` | バインドアドレス |
| `central.connection_timeout` | `3000` | 3秒 | 接続タイムアウト |
| `keepalive.session_idle_timeout` | `1800000` | 30分 | セッションアイドルタイムアウト |
| `keepalive.ping_interval` | `30000` | 30秒 | 死活監視間隔 |
| `pm2.max_memory_restart` | `"500M"` | 500MB | PM2メモリ上限 |

**複数プロジェクト運用時**: `server.port` をプロジェクトごとに変更する（例: A=3100, B=3101）。

### 2-3. CLAUDE.md

**場所**: プロジェクトルートの `CLAUDE.md`

Claude Codeが最初に読み込む設定ファイル。プロジェクト全体のルールと、Maid-Agent の階層構造・MCPツール一覧を定義。

**カスタマイズ可能な箇所**:
- 言語設定の指示
- ドキュメント出力先の指定
- コーディング規約
- Git運用ルール

**注意**: CLAUDE.md は全エージェントに影響するため、変更は慎重に行うこと。

---

## 3. エージェント管理

### 3-1. エージェントの構成

デフォルト構成:

| 役割 | ID | 人数 | 説明 |
|------|-----|------|------|
| 執事 | `butler` | 1 | 戦略立案・タスク分解 |
| メイド長 | `chief` | 1 | タスク配分・進捗管理 |
| メイド | `emma` 等 | 8 | 実作業担当 |

### 3-2. メイドの追加

1. **settings.yaml にエントリ追加**:

```yaml
maids:
  # ... 既存メイド ...
  - name: "新しいメイド名"
    id: "new_maid"          # 英字小文字、スネークケース推奨
    emoji: "🌟"
    specialty: "得意分野"
```

2. **ペルソナファイル作成**: `.maid-agent/agents/personas/{id}.md`

```markdown
# {名前} ペルソナ

## 基本情報
- 名前: {名前}
- 役職: メイド
- イメージカラー: {カラー名} ({カラーコード})

## 性格
{性格の説明}

## 口調
- {口調の特徴}

### 語尾パターン
- 肯定: 「〜」
- 提案: 「〜」
- 報告: 「〜」
- 確認: 「〜」

### 例文
{例文}

## 重要
このペルソナはあくまで口調・話し方のガイドです。
エージェントとしての実際の動作は `.maid-agent/instructions/maid.md` に従ってください。
```

3. **maid-notify の対象に追加**: `.maid-agent/system/bin/maid-notify` の `VALID_TARGETS` に新しいIDを追加

```bash
VALID_TARGETS="butler chief emma sophia lily rose alice may flora luna new_maid"
```

4. **画像の配置**（任意）: `.maid-agent/system/resources/images/{id}.png`

### 3-3. メイドの削除

1. `settings.yaml` の `maids` リストから該当エントリを削除
2. 関連ファイルの削除（任意）:
   - `.maid-agent/agents/personas/{id}.md`
   - `.maid-agent/system/resources/images/{id}*.png`
   - `.maid-agent/system/data/maid/{id}.yaml`
3. `maid-notify` の `VALID_TARGETS` から削除

### 3-4. ペルソナのカスタマイズ

**場所**: `.maid-agent/agents/personas/{id}.md`

ペルソナは口調・話し方のみを制御する。作業手順やルールには影響しない。

カスタマイズ可能な項目:
- 名前・イメージカラー
- 性格の説明
- 口調の特徴・語尾パターン
- 例文

### 3-5. 指示書

**場所**: `.maid-agent/agents/instructions/`

| ファイル | 対象 | 内容 |
|---------|------|------|
| `butler.md` | 執事 | タスク分解・メイド長への指示方法 |
| `chief.md` | メイド長 | タスク配分・進捗管理・メイドへの指示方法 |
| `maid.md` | 全メイド共通 | タスク実行手順・報告方法・禁止事項 |
| `QUICK_REFERENCE.md` | 全員 | MCPツール・通知コマンドのクイックリファレンス |

**カスタマイズ**: 指示書を編集することでエージェントの振る舞いを変更できる。ただし、MCPツールの使い方やステータス遷移に関する記述を変更するとシステムが正常に動作しなくなる可能性があるため、注意が必要。

### 3-6. 指示書の自動更新とバックアップ

`Init Project` を再実行すると、指示書は自動的に最新版に更新される。

**バックアップの仕組み**:

1. テンプレートと既存ファイルを比較
2. 差分があれば `instructions/backup/{filename}_YYYYMMDD_HHmmss.md` に保存
3. 最新版で上書き
4. 更新通知を表示

**カスタム設定の再適用**:

```bash
# バックアップファイルを確認
ls .maid-agent/agents/instructions/backup/

# 差分を確認（例: butler.md）
diff .maid-agent/agents/instructions/butler.md \
     .maid-agent/agents/instructions/backup/butler_20260212_143052.md

# 必要な部分を手動でマージ
```

**注意**: バックアップは自動削除されないため、不要になったら手動で削除してください。

---

## 4. 外観・UI

### 4-1. Webダッシュボード

**URL**: `http://localhost:3100/dashboard`

タスク一覧、エージェントステータス、報告書をブラウザで確認できる。

**ポート変更**: `maid-agent-messenger.yaml` の `server.port` を変更。

### 4-2. VSCode サイドバー

VSCodeのアクティビティバーに Maid-Agent のアイコンが表示される。サイドバーから以下の操作が可能:

- エージェントの起動・停止
- ステータスの確認
- エージェントパネル（画像表示）

### 4-3. キャラクター画像の管理

**場所**: `.maid-agent/system/resources/images/`

#### 画像の仕様

| 項目 | 推奨値 |
|------|--------|
| サイズ | 幅200〜300px × 高さ300〜500px |
| 縦横比 | 縦長（立ち絵スタイル） |
| 形式 | PNG（透過推奨）/ JPG / WebP / GIF |
| 最大表示サイズ | 幅280px × 高さ400px |

#### 命名規則

| パターン | 形式 | 例 | 説明 |
|---------|------|-----|------|
| 基本画像 | `{id}.png` | `emma.png` | デフォルトの画像 |
| バージョン違い | `{id}_{番号}.png` | `emma_1.png`, `emma_2.png` | 起動時ランダム選択（最大10枚） |
| ステータス別 | `{id}_{status}.png` | `emma_work.png` | 自動切替 |

**ステータス別画像の種類**:

| ステータス | ファイル名 | 表示タイミング |
|-----------|-----------|---------------|
| `wait` | `{id}_wait.png` | 待機中 |
| `work` | `{id}_work.png` | 作業中 |
| `done` | `{id}_done.png` | 完了時 |

#### 表示の優先順位

```
1. ステータス画像 (emma_work.png)
   ↓ なければ
2. バージョン画像 (emma_1.png 等) からランダム
   ↓ なければ
3. 基本画像 (emma.png)
   ↓ なければ
4. 絵文字フォールバック (settings.yaml の emoji)
```

#### 画像の追加・変更

1. 上記命名規則に従って画像ファイルを配置
2. VSCode拡張を再読み込み（コマンドパレット → `Developer: Reload Window`）

#### 画像の差し替え例

```bash
# エマの画像を差し替え
cp my-new-emma.png .maid-agent/system/resources/images/emma_1.png

# 作業中ステータス画像を追加
cp emma-working.png .maid-agent/system/resources/images/emma_work.png
```

---

## 5. タスク管理

### 5-1. タスク管理の概要

タスクは MCPツール（maid-agent-messenger）を通じて管理される。データは `.maid-agent/tasks.yaml` に保存。

#### 階層構造

```
執事: タスク作成（create_task）→ 大きなタスクを分解
  ↓
メイド長: タスク割り当て（assign_task）→ メイドに配分
  ↓
メイド: タスク実行（update_status）→ 作業・報告
```

### 5-2. Webダッシュボードでのタスク管理

**URL**: `http://localhost:3100/dashboard`

ダッシュボードでは以下を確認できる:
- タスク一覧（ステータス別フィルタ可能）
- 各エージェントの稼働状況
- 報告書の内容

### 5-3. タスクのステータス遷移

```
pending → assigned → working → completed
                  ↘ blocked（問題発生時）
```

| ステータス | 説明 | 設定者 |
|-----------|------|--------|
| `pending` | 未着手 | 執事 |
| `assigned` | 割り当て済み | メイド長 |
| `working` | 作業中 | メイド |
| `completed` | 完了 | メイド |
| `blocked` | 問題発生・判断待ち | メイド |

### 5-4. タスクカテゴリ

| カテゴリ | 値 | 用途 |
|---------|-----|------|
| 通常タスク | `task` | デフォルト |
| 要対応 | `action_required` | ご主人様の判断が必要 |
| スキル化候補 | `skill_candidate` | スキル化の承認待ち |
| 改善提案 | `improvement` | 改善提案 |

### 5-5. MCPツール一覧

| ツール | 用途 | 使用者 |
|--------|------|--------|
| `create_task` | 新規タスク・サブタスク作成 | 執事・メイド長 |
| `list_tasks` | タスク一覧取得（フィルタ対応） | 執事・メイド長 |
| `get_task` | タスク詳細取得 | 全員 |
| `get_report` | タスクの報告書取得 | 執事・メイド長 |
| `update_task` | タスク更新 | メイド長 |
| `get_my_task` | 自分のタスク取得 | メイド |
| `update_status` | ステータス更新 | メイド |
| `assign_task` | メイドにタスク割り当て | メイド長 |
| `get_team_status` | 全メイドの状況一覧 | メイド長・執事 |

### 5-6. 報告書

メイドの作業報告は以下に保存される:

| ファイル | 場所 | 説明 |
|---------|------|------|
| 作業中報告 | `.maid-agent/system/data/reports/current_{name}.md` | 現在のタスクの報告書 |
| アーカイブ | `.maid-agent/master/reports/task-{id}-{name}-{title}.md` | 完了後に自動アーカイブ |

---

## 6. 運用・メンテナンス

### 6-1. LLMモデルの変更

`settings.yaml` の `model` セクションを編集する。

**全エージェント一括変更**:

```yaml
model:
  default: "haiku"    # 全員をhaikuに
```

**役割別に変更**:

```yaml
model:
  default: "sonnet"
  roles:
    butler: "opus"    # 執事のみopus
    maid: "haiku"     # メイドはhaiku
```

**特定のエージェントのみ変更**:

```yaml
model:
  default: "sonnet"
  agents:
    emma: "opus"      # エマだけopus
```

変更はエージェントの次回セッション開始時から反映される。稼働中のエージェントを再起動する必要がある。

### 6-2. MCPサーバーの再起動

```bash
# PM2でMCPサーバーを再起動
pm2 restart maid-agent-messenger

# ステータス確認
pm2 status maid-agent-messenger

# ログ確認
pm2 logs maid-agent-messenger
```

**再起動後**: 各エージェントのMCP接続が切断されるため、再接続が必要。

```bash
# 全エージェントのMCP再接続（maid-notifyを使用）
.maid-agent/system/bin/maid-notify --mcp-reconnect butler &
.maid-agent/system/bin/maid-notify --mcp-reconnect chief &
# ... 各メイドも同様
```

または VSCode のコマンドパレットから `/mcp disable maid-agent-messenger` → `/mcp enable maid-agent-messenger` で個別に再接続。

### 6-3. ログの確認

#### MCPサーバーログ

```bash
pm2 logs maid-agent-messenger
```

#### 通知ログ

```bash
cat .maid-agent/system/data/notifications/history.log
```

#### ログレベルの変更

`settings.yaml`:

```yaml
log:
  level: debug    # debug, info, warn, error
```

### 6-4. データのバックアップ

定期的にバックアップを推奨するファイル:

| ファイル/フォルダ | 重要度 | 内容 |
|-----------------|--------|------|
| `.maid-agent/tasks.yaml` | 高 | 全タスクデータ |
| `.maid-agent/system/config/` | 高 | 設定ファイル |
| `.maid-agent/agents/` | 中 | 指示書・ペルソナ・スキル |
| `.maid-agent/master/reports/` | 低 | 報告書アーカイブ |

### 6-5. バージョンアップ手順

拡張機能をアップデートする際の手順です。

#### Step 1: 新しい VSIX をインストール

1. [Releases ページ](https://github.com/noctcross/Maid-Agent-Controller/releases) から最新の `.vsix` をダウンロード
2. VSCode コマンドパレット → `Extensions: Install from VSIX...`
3. VSCode を再読み込み（`Developer: Reload Window`）

#### Step 2: グローバル設定を更新

コマンドパレットで `Init Global` を実行:

```
Maid Agent: Init Global
```

MCPサーバーが最新版に更新され、PM2 で再起動されます。

#### Step 3: プロジェクト設定を更新

各プロジェクトで `Init` を実行:

```
Maid Agent: Init
```

**指示書の自動更新**: `agents/instructions/` が最新版に更新されます。カスタマイズしていた場合は `instructions/backup/` にバックアップが保存されるため、新旧を比較してカスタム設定を再適用してください。

#### 注意事項

- **IDE再起動**: VSIX インストール後は必ず VSCode を再読み込み（`Developer: Reload Window`）または再起動してください。再起動しないと新機能が反映されません
- **MCP再接続**: MCPサーバー更新後、稼働中のエージェントは MCP 再接続が必要です
- **バックアップ確認**: カスタマイズした指示書がある場合、更新前に差分を確認してください
- **CHANGELOG**: [CHANGELOG.md](../CHANGELOG.md) で変更内容を確認できます

### 6-6. アンインストール

> **詳細な手順**: [アンインストール手順書](アンインストール手順書.md) を参照してください。

#### プロジェクトからの削除

```bash
# Maid-Agent のプロジェクト設定を削除
rm -rf .maid-agent/

# CLAUDE.md から Maid-Agent 関連の記述を削除（手動）
```

#### VSCode拡張の削除

1. VSCode の拡張機能パネルから Maid-Agent を無効化/アンインストール
2. グローバルファイルの削除（任意）:

```bash
rm -rf ~/.maid-agent/
rm -rf ~/.claude/skills/maid-generated/
```

#### MCPサーバーの停止・削除

```bash
pm2 stop maid-agent-messenger
pm2 delete maid-agent-messenger
rm -rf ~/.maid-agent/maid-agent-messenger/
```

---

## 7. トラブルシューティング

### 7-1. MCP接続エラー

**症状**: MCPツール呼び出し時に以下のエラー:

```
Session not found. Client should create a new session by sending an initialize request.
```

**原因**: MCPサーバーとのセッションが切断された。

**対処法**:

1. maid-notify で再接続を試行:

```bash
.maid-agent/system/bin/maid-notify --mcp-reconnect {agent_id} &
```

2. `[MCP再接続完了]` メッセージを待つ

3. それでも失敗する場合、Claude Code 内で手動再接続:

```
/mcp disable maid-agent-messenger
/mcp enable maid-agent-messenger
```

### 7-2. MCPサーバーが起動しない

**症状**: `pm2 status` で `errored` または `stopped` と表示される。

**対処法**:

```bash
# ログで原因を確認
pm2 logs maid-agent-messenger --lines 50

# よくある原因:
# 1. ポート競合 → maid-agent-messenger.yaml の port を変更
# 2. Node.jsバージョン不足 → node -v で確認（v18以上が必要）
# 3. デプロイ未実行 → npm run build && node deploy-local.js を実行
```

### 7-3. エージェントがフリーズする

**症状**: エージェントが応答しない、タスクが進まない。

**対処法**:

1. tmux で該当ウィンドウを確認:

```bash
tmux select-window -t maid-session:{agent_id}
```

2. Claude Code がプロンプト待ちかを確認
3. 必要に応じて Claude Code を再起動（Ctrl+C → 再起動）
4. VSCode拡張からエージェントを再起動

### 7-4. タスクが割り当てられない

**症状**: メイドが `get_my_task` を呼んでも空が返る。

**確認ポイント**:

1. `tasks.yaml` に該当タスクが存在するか
2. タスクの `assignee` フィールドが正しいメイドIDになっているか
3. タスクのステータスが `assigned` になっているか
4. メイドのIDが `settings.yaml` の maids リストと一致しているか

### 7-5. 通知が届かない

**症状**: `maid-notify` を実行しても相手に通知が届かない。

**確認ポイント**:

1. tmux セッションが存在するか: `tmux list-sessions`
2. セッション名が `.session-name` と一致するか
3. 対象ウィンドウが存在するか: `tmux list-windows -t {session}`
4. 通知ログを確認: `cat .maid-agent/system/data/notifications/history.log`

### 7-6. ダッシュボードにアクセスできない

**症状**: `http://localhost:3100/dashboard` が表示されない。

**対処法**:

```bash
# MCPサーバーが起動しているか確認
pm2 status maid-agent-messenger

# ポートが使用されているか確認
lsof -i :3100

# サーバーを再起動
pm2 restart maid-agent-messenger
```

### 7-7. 報告書が上書きされる

**症状**: 前のタスクの報告書が新しいタスクで上書きされる。

**原因**: サブタスクを `create_task` で作成せずに `assign_task` だけで指示した場合に発生する。

**防止策**: レビュー・追加作業をメイドに指示する際は、必ず `create_task`（`parentId` 指定）でサブタスクを作成してから `assign_task` する。

### 7-8. コンパクション後にエージェントが正しく動作しない

**症状**: Claude Codeのコンテキスト圧縮後、エージェントが自分の役割や通信方法を忘れる。

**対処法**: エージェントに以下を再読み込みさせる:

1. `.maid-agent/agents/instructions/{role}.md`（自分の役割の指示書）
2. `.maid-agent/agents/instructions/QUICK_REFERENCE.md`（通信方法）

指示書にはコンパクション後の再読み込み手順が記載されている。

### 7-9. Windows-nativeモード（psmux）関連

#### psmux が見つからない

**症状**: Init Global で「psmux が見つかりません」エラー。

**対処法**:
```powershell
# psmux をインストール
winget install psmux

# インストール確認
psmux --version
```

#### jq/yq のインストールに失敗

**症状**: Init Global で jq/yq インストールエラー。

**対処法**:
```powershell
# 手動でインストール
winget install stedolan.jq
winget install mikefarah.yq

# パスが通っているか確認
jq --version
yq --version
```

#### モードを変更したい

**症状**: Init Global 後に WSL/psmux モードを変更したい。

**対処法**:
1. コマンドパレットで `Maid Agent: Set Runtime Mode` を実行
2. 希望のモードを選択
3. サーバーが自動的に再起動される

#### サーバーが起動しない（Windows-native）

**症状**: Windows-nativeモードでサーバーが起動しない。

**確認ポイント**:
```powershell
# pm2 の状態確認
pm2 status

# Node.js がWindowsにインストールされているか
node --version

# npm グローバルパスの確認
npm config get prefix
```

---

# Part II: プロジェクト固有カスタマイズ

> 以下のセクションはプロジェクトごとに異なる設定です。`Init Project` 実行後、プロジェクトの要件に合わせてカスタマイズしてください。

---

## 8. プロジェクトコンテキスト

**場所**: `.maid-agent/agents/context/`

プロジェクト固有のコンテキスト情報を保存するフォルダ。エージェントがセッション開始時に参照する。

| ファイル | 用途 |
|---------|------|
| `project.md` | プロジェクト概要・リポジトリ構成・ビルド手順 |
| `document-paths.md` | ドキュメント出力先の分類ルール |
| 任意の `{topic}.md` | プロジェクト固有のトピック別コンテキスト |

**カスタマイズ**: プロジェクト固有の方針や決定事項をMarkdownファイルとして追加可能。エージェントはセッション開始時にこのフォルダ内のファイルを自動的に読み込む。

---

## 9. ルールモジュール

**場所**: `.maid-agent/agents/rules/`

ルールモジュールはエージェントの行動に対する制約や指針を定義する仕組み。

```
rules/
├── common/          # 全エージェント向け
│   └── rule-template.md        # テンプレート（参考用）
├── butler/          # 執事のみ
├── chief/           # メイド長のみ
└── maid/            # メイドのみ
```

### 9-1. ルールの追加

1. `rule-template.md` をコピーして新しいルールファイルを作成

```yaml
---
name: my-custom-rule
description: ルールの概要
auto_select: true          # Init時に自動選択するか
target_roles: [common]     # [common], [butler], [chief], [maid], [butler, chief] 等
---
```

2. ルール内容を記述（必須事項、推奨事項、禁止事項）
3. 適切なフォルダに配置

### 9-2. グローバルルール

`~/.maid-agent/rules/` にルールを配置すると、新規プロジェクトの Init 時に選択してコピーできる。プロジェクト横断で共通のルールがある場合に活用。

---

## 10. スキル管理

### 10-1. スキルとは

メイドが作業中に発見した「繰り返し使えるパターン」を文書化したもの。承認後、全メイドが参照・活用できる。

### 10-2. スキル一覧の確認

**場所**: `.maid-agent/agents/skills/`

```bash
ls .maid-agent/agents/skills/
```

### 10-3. スキルの構造

```
skill-name/
├── SKILL.md          # 必須: スキル定義
├── scripts/          # オプション: 実行スクリプト
└── resources/        # オプション: 参照ファイル（テンプレート等）
```

`SKILL.md` のフロントマター:

```yaml
---
name: skill-name
description: いつこのスキルを使うか、具体的なユースケースを明記
---
```

### 10-4. スキルの追加（承認フロー）

スキルの作成にはご主人様（ユーザー）の承認が必要。

```
1. メイドが候補を発見 → 報告書に「スキル化候補」として記載
2. メイド長が集約 → create_task でご主人様向けタスク作成
3. 執事が確認 → ご主人様に報告
4. ご主人様が承認
5. メイド長が skill-creator スキルを使用してスキルを作成
6. .maid-agent/agents/skills/{name}/ に保存
```

#### 手動でスキルを追加する場合

1. `.maid-agent/agents/skills/{skill-name}/` ディレクトリを作成
2. `SKILL.md` を作成（`skill-creator/SKILL.md` のテンプレートを参照）
3. 必要に応じて `resources/` や `scripts/` を追加

### 10-5. スキルの編集

`SKILL.md` を直接編集する。変更は次回のエージェントセッションから反映される。

### 10-6. スキルの保存先

| 保存先 | パス | スコープ |
|--------|------|---------|
| ローカル | `.maid-agent/agents/skills/` | プロジェクト固有 |
| グローバル | `~/.claude/skills/maid-generated/` | 全プロジェクト共有 |

---

## 付録A: ファイル構成一覧

```
.maid-agent/
├── CLAUDE.md                          # システム詳細設計書
├── tasks.yaml                         # タスク管理データ
├── agents/
│   ├── context/                       # プロジェクトコンテキスト
│   │   ├── project.md
│   │   └── document-paths.md
│   ├── instructions/                  # 役割別指示書
│   │   ├── butler.md
│   │   ├── chief.md
│   │   ├── maid.md
│   │   └── QUICK_REFERENCE.md
│   ├── personas/                      # ペルソナ定義
│   │   ├── butler.md
│   │   ├── chief.md
│   │   ├── emma.md, sophia.md, ...
│   ├── rules/                         # ルールモジュール
│   │   ├── common/                    # 全エージェント向け
│   │   ├── butler/
│   │   ├── chief/
│   │   └── maid/
│   └── skills/                        # 承認済みスキル
│       ├── web-analysis/
│       ├── skill-creator/
│       └── ...
├── master/
│   └── reports/                       # 報告書アーカイブ
└── system/
    ├── bin/
    │   ├── maid-notify                # エージェント間通知CLI
    │   └── session-start-hook.sh      # セッション開始フック
    ├── config/
    │   ├── settings.yaml              # メイン設定ファイル
    │   ├── maid-agent-messenger.yaml            # MCPサーバー設定
    │   └── .session-name              # tmuxセッション名
    ├── data/
    │   ├── maid/                      # 各メイドの状態
    │   ├── reports/                   # 作業中報告書
    │   └── notifications/             # 通知ログ
    └── resources/
        └── images/                    # キャラクター画像
```

## 付録B: コマンドリファレンス

### maid-notify

```bash
# エージェントに通知を送信
.maid-agent/system/bin/maid-notify <target> "<message>"

# MCP接続の再接続
.maid-agent/system/bin/maid-notify --mcp-reconnect <target> [server-name]

# 対象: butler, chief, emma, sophia, lily, rose, alice, may, flora, luna
```

### PM2 操作

```bash
pm2 status maid-agent-messenger     # ステータス確認
pm2 restart maid-agent-messenger    # 再起動
pm2 logs maid-agent-messenger       # ログ確認
pm2 stop maid-agent-messenger       # 停止
```

### tmux 操作

```bash
tmux list-sessions                          # セッション一覧
tmux list-windows -t {session}              # ウィンドウ一覧
tmux select-window -t {session}:{window}    # ウィンドウ切替
```

---

## 付録C: 開発者向けガイド

Maid-Agent の開発に興味がある方、改善提案を検討されている方向けのガイドです。

### C-1. リポジトリ構成

```
MaidsHouse/
├── VSCode拡張/
│   └── AgentMaid/
│       ├── packages/
│       │   ├── maid-agent-messenger/    # MCPサーバー（TypeScript）
│       │   └── vscode-extension/        # VSCode拡張本体
│       ├── project-templates/           # プロジェクト初期化用テンプレート
│       └── package.json                 # モノレポルート
├── docs/
│   └── maid-agent/
│       ├── designs/                     # 設計ドキュメント
│       ├── guides/                      # ガイド（本ファイル含む）
│       └── plans/                       # 実装計画
└── .maid-agent/                         # 実運用ディレクトリ（MaidsHouseプロジェクト用）
```

### C-2. 開発環境のセットアップ

#### 前提条件

| 項目 | バージョン |
|------|-----------|
| Node.js | v18 以上 |
| npm | v9 以上 |
| VSCode | 最新版 |
| tmux | インストール済み |

#### セットアップ手順

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd MaidsHouse

# 2. 依存関係をインストール（モノレポルートから）
cd VSCode拡張/AgentMaid
npm install

# 3. パッケージをビルド
npm run build

# 4. VSCode拡張をパッケージ化（任意）
cd packages/vscode-extension
npx vsce package
```

### C-3. ビルド手順

#### MCPサーバー（maid-agent-messenger）

```bash
cd VSCode拡張/AgentMaid/packages/maid-agent-messenger

# ビルド
npm run build

# テスト実行
npm test

# 開発モード（監視ビルド）
npm run dev
```

**注意**: テストは必ず `npm test` で実行してください。Jest の ESM モードでは `--experimental-vm-modules` フラグが必要なため、`npx jest` では正しく動作しません。

#### VSCode拡張（vscode-extension）

```bash
cd VSCode拡張/AgentMaid/packages/vscode-extension

# ビルド
npm run compile

# VSIXパッケージ作成
npx vsce package

# 開発モード（F5でデバッグ起動）
# VSCodeで該当フォルダを開き、F5キーを押す
```

### C-4. 開発時のテスト方法

#### ローカルでのMCPサーバーテスト

```bash
# 1. ビルド済みのMCPサーバーを起動
cd VSCode拡張/AgentMaid/packages/maid-agent-messenger
node dist/index.js

# 2. 別ターミナルでダッシュボードにアクセス
curl http://localhost:3100/dashboard
```

#### VSCode拡張のデバッグ

1. VSCodeで `VSCode拡張/AgentMaid/packages/vscode-extension/` を開く
2. F5キーで拡張開発ホストを起動
3. 新しいVSCodeウィンドウでテスト用プロジェクトを開く
4. コマンドパレットから拡張機能の動作を確認

### C-5. コントリビューション方法

#### Issue の報告

バグ報告や機能リクエストは GitHub Issue でお願いします。

**バグ報告時に含めてほしい情報**:
- 再現手順
- 期待される動作と実際の動作
- 環境情報（OS、Node.jsバージョン、VSCodeバージョン）
- エラーログ（あれば）

#### Pull Request

1. フォークしてブランチを作成
2. 変更を実装（テストも追加）
3. 既存のテストがパスすることを確認（`npm test`）
4. Pull Request を作成

**コーディング規約**:
- TypeScript を使用
- ESLint / Prettier の設定に従う
- コミットメッセージは日本語または英語で簡潔に

### C-6. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                        VSCode 拡張                              │
│  - エージェント起動/停止                                        │
│  - サイドバー UI                                                │
│  - tmux セッション管理                                          │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTP / WebSocket
┌────────────────────────────────▼────────────────────────────────┐
│                    MCP サーバー (maid-agent-messenger)           │
│  - タスク管理 API (create_task, list_tasks, etc.)              │
│  - エージェント状態管理                                         │
│  - Web ダッシュボード                                           │
└────────────────────────────────┬────────────────────────────────┘
                                 │ MCP Protocol
┌────────────────────────────────▼────────────────────────────────┐
│                      Claude Code エージェント                    │
│  - 執事 / メイド長 / メイド                                     │
│  - MCP ツール経由でタスク操作                                   │
│  - maid-notify で相互通知                                       │
└─────────────────────────────────────────────────────────────────┘
```

### C-7. 主要な設計ドキュメント

| ドキュメント | 場所 | 内容 |
|-------------|------|------|
| 運用系ロジック設計書 | `docs/maid-agent/designs/運用系ロジック設計書.md` | タスク管理・ステータス遷移の詳細設計 |
| MCPサーバー設計 | `docs/maid-agent/designs/` | MCPツールのAPI設計 |
| 実装計画 | `docs/maid-agent/plans/` | 各機能の実装計画 |

### C-8. よくある質問（開発者向け）

**Q: 新しいMCPツールを追加するには？**

A: `packages/maid-agent-messenger/src/tools/` 配下にツール定義を追加し、`src/index.ts` で登録してください。既存のツール（`task-manager.ts` 等）を参考にしてください。

**Q: エージェントの振る舞いを変更するには？**

A: `.maid-agent/agents/instructions/{role}.md` の指示書を編集してください。MCPツールの使い方やステータス遷移に関する記述は慎重に扱ってください。

**Q: 新しいメイドを追加するには？**

A: 本ガイドの「3-2. メイドの追加」を参照してください。
