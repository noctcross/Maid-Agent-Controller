# Maid Agent Controller

VSCode拡張として動作するマルチエージェントClaude Code管理システム。
英国メイド制度をモチーフにした階層構造で、複数タスクを並行処理します。

## 特徴

- **階層型マルチエージェント**: 執事 → メイド長 → メイド8人の3層構造
- **MCPサーバー連携**: タスク管理・エージェント間通信をMCP経由で効率化（トークン消費削減）
- **タスク管理システム**: tasks.yaml による一元管理、ステータス追跡、レポートアーカイブ
- **ダッシュボード**: リアルタイムでタスク進捗を確認、ブラウザからもアクセス可能
- **WSL + tmux**: Windows環境でもWSL経由で安定動作
- **ビジュアル管理**: サイドバーの立ち絵表示、tmuxビューア

## 環境要件

### 対応プラットフォーム

| プラットフォーム | v1 サポート | 備考 |
|----------------|------------|------|
| Windows + WSL2 | ✅ サポート | メイン開発・テスト環境 |
| Linux (ネイティブ) | ❌ 非サポート | v1ではサポート対象外 |
| macOS | ❌ 非サポート | v1ではサポート対象外 |

### 必須ソフトウェア

| ソフトウェア | バージョン | 備考 |
|------------|-----------|------|
| VSCode | 1.85.0 以上 | |
| Node.js | 20.x 以上 | npm install に必要 |
| Claude Code (CLI) | 最新版 | Anthropic 公式 CLI |
| tmux | 3.0 以上 | |

### Windows 追加要件

| ソフトウェア | バージョン | 備考 |
|------------|-----------|------|
| WSL2 | - | `Init Global` で自動チェック |
| Ubuntu (WSL) | 22.04+ 推奨 | Node.js, tmux は WSL 内にインストール |

### 自動インストールされるもの

以下は `Init Global` 実行時に自動セットアップされます:
- **PM2**: プロセスマネージャー
- **maid-agent-messenger**: MCPサーバー

## 階層構造

```
┌─────────────────┐
│  🎩 執事        │ ← ユーザーからタスクを受け取り、分解
│  シルヴィア     │    create_task でタスク作成
└────────┬────────┘
         │ maid-notify で指示
         ▼
┌─────────────────┐
│  👑 メイド長    │ ← サブタスクを各メイドに配分
│  ビオラ         │    assign_task で割り当て
└────────┬────────┘
         │ maid-notify で指示
         ▼
┌──┬──┬──┬──┬──┬──┬──┬──┐
│🎀│🎀│🎀│🎀│🎀│🎀│🎀│🎀│ ← 並列実行
│エ│ソ│リ│ロ│ア│メ│フ│ル│    update_status で報告
│マ│フ│リ│｜│リ│イ│ロ│ナ│
│  │ィ│｜│ズ│ス│  │ラ│  │
│  │ア│  │  │  │  │  │  │
└──┴──┴──┴──┴──┴──┴──┴──┘
```

## インストール

### 方法1: VSIX ファイルから（推奨）

1. [Releases ページ](https://github.com/noctcross/AgentMaid/releases) から `.vsix` ファイルをダウンロード
2. VSCode のコマンドパレット（`Ctrl+Shift+P`）→ `Extensions: Install from VSIX...`
3. ダウンロードした `.vsix` ファイルを選択

### 方法2: ソースからビルド（開発者向け）

```bash
cd "VSCode拡張/AgentMaid"
npm install
npm run compile
# F5 でデバッグ起動、または:
npx @vscode/vsce package  # .vsix ファイルを生成
```

## 事前準備

### Claude Code のセットアップ

本拡張機能はエージェント起動時に Claude Code CLI を使用します。事前にインストールと認証を完了してください。

1. [Claude Code 公式ドキュメント](https://docs.anthropic.com/en/docs/claude-code) に従いインストール
   ```bash
   # WSL 内で実行
   npm install -g @anthropic-ai/claude-code
   ```
2. 初回認証を完了:
   ```bash
   claude  # 初回起動で認証フロー
   ```
3. `--dangerously-skip-permissions` の初回確認:
   ```bash
   claude --dangerously-skip-permissions
   # → Yes を選択（エージェント自律動作に必要）
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
- **maid-agent-messenger** MCPサーバー（タスク管理・エージェント間通信用）
- pm2による自動起動設定（WSL起動時に自動でサーバー起動）

> **Note**: MCPサーバーのセットアップ時にWSLのパスワード入力が必要です。

### 3. プロジェクト初期化

コマンドパレットから `init` と入力:

| コマンド | 説明 |
|---------|------|
| `Maid Agent: Init` | `.maid-agent/` ディレクトリを作成 |

プロジェクト初期化時に `.mcp.json` が自動生成され、MCPサーバーとの連携が設定されます。

初期化時の処理:
1. テンプレートからプロジェクトファイルをコピー
2. グローバルルール選択UI表示（`auto_select: true` のものは事前選択）
3. グローバルスキル選択UI表示
4. 選択されたルール・スキルをプロジェクトにコピー
5. `.mcp.json` を生成（MCPサーバー連携設定）

> **Note**: コマンドパレットではファジー検索が使えます。
> 例: `call all`, `xn -r`, `butler` など部分入力でOK

### 4. エージェントを召喚

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Call All` | all | 全員起動（執事+メイド長+メイド8人 = 10人） |
| `Call Butler` | butler | 執事のみ起動 |
| `Call Chief` | chief | メイド長のみ起動 |
| `Call Butler & Chief` | agents | 執事とメイド長を起動 |
| `Call Maids Pick` | pick | チェックボックスでメイドを選択 |

> ⚠️ **初回起動時の注意**: `--dangerously-skip-permissions` の初回確認が必要です。
> 詳細は[事前準備](#事前準備)セクションを参照してください。

### 5. タスクを実行

**執事のターミナルに直接入力してください。**

執事のターミナル（🎩 執事）を選択し、Claude Code に直接タスクを入力します。
執事がタスクを分析し、メイド長 → メイドへと階層的に処理されます。

### 6. 進捗確認

#### ダッシュボード（推奨）

- ステータスバーの「📋 Dashboard」をクリック
- または `Dashboard` コマンド
- ブラウザで開く場合は `Open Dashboard in Browser` コマンド
- 10秒間隔で自動更新

#### コントローラーパネル

- `Controller` コマンドで表示（VSCode内WebView）

#### サイドバー（エージェントパネル）

1. **Activity Bar（左端のアイコン列）の ♥ アイコン**をクリック
2. サイドバーに「Maid Agent」パネルが表示される
3. **ターミナルタブを切り替える**と、該当エージェントの立ち絵が表示される

> パネルが表示されない場合は、設定で `maidAgent.showAgentPanel` が `true` になっているか確認してください。

### 7. セッション管理

| コマンド | 説明 |
|---------|------|
| `Resume` | 既存のtmuxセッションに復帰 |
| `Kill All` | 全セッション一括終了 |
| `Kill Pick` | エージェントを選んで終了 |
| `Restart Pick` | エージェントを選んで再起動 |
| `Tmux Viewer` | tmuxビューアを開く |
| `Claude Start` | 全ターミナルでClaude Code起動 |

> IDE起動時に既存セッションがあれば自動復帰します（`maidAgent.autoResumeOnStartup`）

## タスク管理システム

### 概要

tasks.yaml を Single Source of Truth（正データ）として、全タスクを一元管理します。

```
執事 ──→ create_task ──→ tasks.yaml（正）
メイド長 → assign_task ──→ executeUpdateTask ──→ tasks.yaml + maid yaml 自動同期
メイド ──→ update_status → executeUpdateTask ──→ tasks.yaml + maid yaml + レポートアーカイブ
```

### タスクステータス

```
pending → assigned → working → completed
                  ↘ blocked（問題発生時）
                  ↘ cancelled（キャンセル時）
```

| ステータス | 説明 | 設定者 |
|-----------|------|--------|
| `pending` | 未着手（作成直後） | 執事 |
| `assigned` | メイドに割り当て済み | メイド長 |
| `working` | 作業中 | メイド |
| `completed` | 完了 | メイド |
| `blocked` | 外部要因で停止中（判断待ち等） | メイド |
| `cancelled` | キャンセル | メイド長 |

### タスクカテゴリ

| カテゴリ | 用途 | 表示 |
|---------|------|------|
| `task` | 通常タスク（デフォルト） | - |
| `action_required` | ご主人様の判断が必要 | 🚨 要対応 |
| `skill_candidate` | スキル化候補 | 📚 スキル候補 |
| `improvement` | 改善提案 | 💡 改善提案 |

## ファイル構成

初期化後、`.maid-agent/` ディレクトリが作成されます：

```
.maid-agent/
├── CLAUDE.md                    # 詳細設計書（エージェント用リファレンス）
├── master/                      # ご主人様エリア
│   ├── NOTES.md                 # ご主人様メモ
│   └── reports/                 # 完了レポートアーカイブ（task-*.md）
├── agents/                      # エージェントエリア
│   ├── context/                 # プロジェクト固有コンテキスト
│   ├── instructions/            # 各役割の指示書
│   │   ├── butler.md            # 執事
│   │   ├── chief.md             # メイド長
│   │   ├── maid.md              # メイド
│   │   └── QUICK_REFERENCE.md   # コンパクション対策クイックリファレンス
│   ├── personas/                # キャラクター別口調設定
│   │   ├── butler.md            # シルヴィア
│   │   ├── chief.md             # ビオラ
│   │   ├── emma.md              # エマ
│   │   └── ...                  # 他メイド
│   ├── rules/                   # ルールモジュール（グローバルからコピー）
│   │   ├── common/              # 全員に適用
│   │   ├── butler/              # 執事のみ
│   │   ├── chief/               # メイド長のみ
│   │   └── maid/                # メイドのみ
│   └── skills/                  # 承認済みスキル
│       └── skill-creator/       # スキル作成ガイド
└── system/                      # システムエリア
    ├── bin/                     # 実行スクリプト（maid-notify）
    ├── config/                  # 設定ファイル（settings.yaml）
    ├── data/
    │   ├── maid/                # メイド別ステータス（MCPツール経由で更新）
    │   │   ├── emma.yaml
    │   │   └── ...
    │   ├── reports/             # 作業中レポート（current_{name}.md）
    │   └── tasks.yaml           # タスク管理データ（SSOT）
    └── resources/
        └── images/              # カスタム立ち絵（オプション）
```

## MCPサーバー（maid-agent-messenger）

エージェント間のタスク管理を効率化するMCPサーバーです。

### 提供ツール

| ツール名 | 用途 | 使用者 |
|---------|------|-------|
| `create_task` | 新規タスク/サブタスク作成 | 執事・メイド長 |
| `list_tasks` | タスク一覧取得（フィルタ・ソート対応） | 執事・メイド長 |
| `get_task` | タスク詳細取得（サブタスク含む） | 全員 |
| `get_report` | タスクのレポート内容取得 | 執事・メイド長 |
| `update_task` | タスク更新（ステータス・カテゴリ等） | メイド長 |
| `assign_task` | メイドにタスクを割り当て | メイド長 |
| `get_my_task` | 自分のタスク情報を取得 | メイド |
| `update_status` | ステータスを更新（working/completed/blocked） | メイド |
| `get_team_status` | 全メイドのステータス一覧を取得 | メイド長・執事 |

### メリット

- **トークン消費削減**: YAMLファイル全体を読み書きする代わりに、必要な情報のみを取得・更新
- **タイムスタンプ自動設定**: `assignedAt`, `startedAt`, `completedAt` が自動で設定される
- **ファイルロック**: 複数エージェントからの同時アクセスでも安全
- **自動同期**: tasks.yaml 更新時に maid yaml への同期、レポートアーカイブが自動実行

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

## カスタム立ち絵

`.maid-agent/system/resources/images/` にキャラクター画像を配置すると、
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

## ペルソナ（口調設定）

各キャラクターには個別の口調・話し方が設定されています。
`.maid-agent/agents/personas/` 内のファイルで確認・カスタマイズできます。

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

ペルソナはあくまで口調のガイドであり、エージェントとしての動作は `agents/instructions/` 内の指示書に従います。

## 拡張機能設定

VSCode の設定（`Ctrl+,`）で以下の項目を変更できます：

| 設定 | 説明 | デフォルト |
|-----|------|-----------|
| `maidAgent.maidOrder` | メイドの起動順序（順番起動時に使用） | `["emma", "sophia", ...]` |
| `maidAgent.showAgentPanel` | サイドバーにエージェントパネルを表示 | `true` |
| `maidAgent.sessionWarningThreshold` | セッション数警告の閾値 | `10` |
| `maidAgent.autoResumeOnStartup` | IDE起動時にセッション自動復帰 | `true` |

### メイドの順番をカスタマイズ

`settings.json` で直接編集：

```json
{
  "maidAgent.maidOrder": ["luna", "flora", "may", "alice", "rose", "lily", "sophia", "emma"]
}
```

## 全コマンド一覧

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Init` | init | ワークスペース初期化 |
| `Init Global` | init global | グローバル設定初期化（~/.maid-agent/） |
| `Resume` | resume | 既存セッションに復帰 |
| `Call All` | all | 全員起動（10人） |
| `Call Butler` | butler | 執事起動 |
| `Call Chief` | chief | メイド長起動 |
| `Call Butler & Chief` | agents | 執事とメイド長を起動 |
| `Call Maids Pick` | pick | 選択して起動 |
| `Claude Start` | claude | 全ターミナルでClaude起動 |
| `Task to Butler` | task butler | 執事にタスク送信 |
| `Task to Maid` | task maid | 特定メイドに送信 |
| `Controller` | controller | コントローラーパネル表示 |
| `Dashboard` | dashboard | ダッシュボード表示 |
| `Open Dashboard in Browser` | browser | ブラウザでダッシュボードを開く |
| `Tmux Viewer` | tmux viewer | tmuxビューアを開く |
| `Kill All` | kill all | 全セッション一括終了 |
| `Kill Pick` | kill pick | エージェントを選んで終了 |
| `Restart Pick` | restart | エージェントを選んで再起動 |
| `Watch Start` | watch start | YAMLファイル監視開始 |
| `Watch Stop` | watch stop | YAMLファイル監視停止 |
| `Promote Rule` | promote rule | ルールをグローバルに昇格 |

## スキルシステム

繰り返し使える作業パターンを「スキル」として保存できます。

1. メイドがスキル化候補を発見 → reports/ に記載
2. メイド長が集約 → `create_task(category: "skill_candidate")` でタスク作成
3. ダッシュボードの「📚 スキル候補」に表示
4. ユーザーが承認 → skills/ に作成

詳細は `.maid-agent/agents/skills/skill-creator/SKILL.md` を参照。

## 改善提案システム

メイドからルールやフローの改善提案を受け付ける仕組みがあります。

1. メイドが改善点を発見 → reports/ に `improvement_proposal` を記載
2. メイド長が集約 → `create_task(category: "improvement")` でタスク作成
3. ダッシュボードの「💡 改善提案」に表示
4. ユーザーが承認 → 該当ルールを更新

## グローバル設定

プロジェクト間で共有するルールとスキルを `~/.maid-agent/` に保存できます。

```
~/.maid-agent/
├── rules/              # ルールモジュール
│   ├── common/         # 全員に適用
│   ├── butler/         # 執事のみ
│   ├── chief/          # メイド長のみ
│   └── maid/           # メイドのみ
└── skills/             # 共有スキル
```

`Init Global` コマンドでフォルダが作成されます。

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

## maid-notify（エージェント間通知）

tmux send-keys ベースのエージェント間通知コマンド。

```bash
# 基本形式
.maid-agent/system/bin/maid-notify {ターゲット} "メッセージ"

# 使用例
.maid-agent/system/bin/maid-notify chief "タスク完了しました"
.maid-agent/system/bin/maid-notify emma "新しいタスクがあります"
```

### MCP再接続

MCPツール使用時に「Server not initialized」エラーが発生した場合:

```bash
.maid-agent/system/bin/maid-notify --mcp-reconnect {自分のID} &
```

自動的に MCP サーバーの disable → enable が実行されます。

## tmux 設定

### 自動設定（拡張機能が行う）

セッション作成時に以下の設定が自動的に適用されます：

```bash
# スクロールモード（copy mode）の自動解除（5秒操作なしで解除）
set-option -t {session} -g copy-mode-timeout 5
```

これにより、スクロール中でも5秒後に通知が配信されます。

### 手動設定（オプション）

マウスサポートが必要な場合は `~/.tmux.conf` に追加：

```bash
set -g mouse on
```

### 通知が届かない場合

maid-notify は最大3回リトライしますが、それでも失敗する場合：

1. `~/.tmux.conf` の設定を確認
2. ターゲットエージェントがスクロール中でないか確認
3. `.maid-agent/system/data/notifications/history.log` でエラーを確認

## LAN内ダッシュボード閲覧

LAN内の別端末（スマートフォン・タブレット等）からダッシュボードを閲覧できます。

### 前提条件

- Windows 11 22H2以降
- WSL 2.0.4以降

### セットアップ

#### Step 1: WSL2 ネットワークモードを mirrored に変更

`%USERPROFILE%\.wslconfig` を作成または編集:

```ini
[wsl2]
networkingMode=mirrored
```

PowerShellでWSLを再起動:
```powershell
wsl --shutdown
```

#### Step 2: mcp-server.yaml のホスト設定を変更

`~/.maid-agent/system/config/mcp-server.yaml`:

```yaml
server:
  host: 0.0.0.0   # 127.0.0.1 から変更
```

#### Step 3: Windows Firewall インバウンドルール追加

管理者権限のPowerShellで:

```powershell
New-NetFireWallRule -DisplayName 'Maid Agent Dashboard' -Direction Inbound -LocalPort 3100 -Action Allow -Protocol TCP
```

### アクセス方法

LAN内端末のブラウザから:

```
http://<WindowsのIPアドレス>:3100/dashboard?project=<プロジェクトパス>
```

### セキュリティ

- ダッシュボード（`/dashboard`）、ファイル配信（`/file`、`/image`）はLAN公開
- MCPエンドポイント（`/mcp`）、レガシーAPI（`/legacy`）、タスクAPI（`/api`）はloopbackのみアクセス可（LAN端末からは403）
- 認証機構は未実装のため、信頼できるLAN内でのみ使用推奨

## 参考

- 元ネタ: [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)
- 記事: https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1
- VSCode API: https://code.visualstudio.com/api

## ライセンス

MIT
