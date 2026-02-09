# Maid Agent Controller

Claude Code の複数インスタンスを、英国メイド制度をモチーフにした階層構造で管理する VSCode 拡張機能です。

**1つのタスクを指示するだけで、執事がサブタスクに分解し、メイド長が各メイドに割り振り、最大8人が並列で作業します。**

<!-- TODO: デモGIF or スクリーンショット -->

## 主な機能

- **マルチエージェント並列処理**: 最大10人（執事+メイド長+メイド8人）の Claude Code が同時稼働
- **自動タスク管理**: タスクの作成・割り当て・進捗追跡・レポート生成を自動化
- **ダッシュボード**: ブラウザからもアクセスできるリアルタイム進捗確認画面
- **キャラクター付きUI**: 各エージェントに個性的なペルソナと立ち絵を設定可能

## Quick Start

### 前提条件

| 必須ソフトウェア | バージョン | 備考 |
|----------------|-----------|------|
| Windows + WSL2 | - | v1 は Windows + WSL2 のみサポート |
| VSCode | 1.85.0+ | Windsurf でも動作確認済み |
| Node.js | 20.x+ | WSL 内にインストール |
| tmux | 3.0+ | WSL 内にインストール |
| Claude Code (CLI) | 最新版 | [公式ドキュメント](https://docs.anthropic.com/en/docs/claude-code) 参照 |

### Step 1: Claude Code を準備

```bash
# WSL 内で実行
npm install -g @anthropic-ai/claude-code
claude                              # 初回認証
claude --dangerously-skip-permissions  # → Yes を選択（エージェント自律動作に必要）
```

### Step 2: 拡張機能をインストール

**方法A: VSIX ファイルから（推奨）**

1. [Releases ページ](https://github.com/noctcross/Maid-Agent-Controller/releases) から `.vsix` をダウンロード
2. VSCode コマンドパレット（`Ctrl+Shift+P`）→ `Extensions: Install from VSIX...`

**方法B: ソースからビルド（開発者向け）**

```bash
cd "VSCode拡張/AgentMaid"
npm install && npm run compile
npx @vscode/vsce package  # .vsix ファイルを生成
```

### Step 3: グローバル初期化（初回のみ）

コマンドパレットで `Init Global` を実行:

```
Maid Agent: Init Global
```

MCPサーバー（エージェント間通信基盤）と PM2（プロセス管理）が自動セットアップされます。

> WSLのパスワード入力を求められます。

### Step 4: プロジェクト初期化

作業したいプロジェクトを VSCode で開き、コマンドパレットで `Init` を実行:

```
Maid Agent: Init
```

`.maid-agent/` ディレクトリとMCPサーバー連携設定（`.mcp.json`）が作成されます。

### Step 5: エージェントを起動してタスクを実行

```
Maid Agent: Call All    ← 全員起動（10人）
```

起動後、**執事のターミナル（🎩 執事）** にタスクを入力するだけです。
執事がタスクを分析 → メイド長が配分 → メイドたちが並列で作業を開始します。

進捗はステータスバーの「📋 Dashboard」をクリックして確認できます。

---

## 動作の仕組み

### 階層構造

```
┌─────────────────┐
│  🎩 執事        │ ← ユーザーからタスクを受け取り、サブタスクに分解
│  シルヴィア     │
└────────┬────────┘
         │
┌────────▼────────┐
│  👑 メイド長    │ ← サブタスクを各メイドに配分・進捗管理
│  ビオラ         │
└────────┬────────┘
         │
┌──┬──┬──▼──┬──┬──┬──┬──┐
│☕│❄️│🎀│🌹│✨│🕊️│🌿│🌙│ ← 最大8人が並列で作業
│エ│ソ│リ│ロ│ア│メ│フ│ル│
│マ│フ│リ│｜│リ│イ│ロ│ナ│
│  │ィ│｜│ズ│ス│  │｜│  │
│  │ア│  │  │  │  │ラ│  │
└──┴──┴──┴──┴──┴──┴──┴──┘
```

### タスクの流れ

```
1. ユーザー → 執事にタスクを入力
2. 執事 → タスクを分解・作成（create_task）
3. メイド長 → メイドに割り当て（assign_task）
4. メイド → 作業実行 → 完了報告（update_status）
5. ダッシュボードで進捗・レポートを確認
```

### タスクステータス

```
pending → assigned → working → completed
                  ↘ blocked（外部要因で停止中）
```

---

## 画面

### ダッシュボード

タスク進捗とレポートの閲覧画面。10秒間隔で自動更新されます。

| 表示方法 | 操作 |
|---------|------|
| VSCode 内 | `Dashboard` コマンド |
| ブラウザ | `Open Dashboard in Browser` コマンド |
| LAN内端末 | [LAN内ダッシュボード閲覧](#lan内ダッシュボード閲覧) 参照 |

主な機能:
- タスク一覧（ステータス別表示）
- 作業報告書の閲覧
- カテゴリ別タブ（🚨 要対応 / 📚 スキル候補 / 💡 改善提案）

### コントローラーパネル

エージェントの起動・停止・再起動を管理する操作画面です。

- `Controller` コマンドで表示
- 各エージェントのステータス確認と操作ボタン

### サイドバー（エージェントパネル）

Activity Bar の ♥ アイコンで表示。ターミナルタブの切り替えに連動して、対応するエージェントの立ち絵が表示されます。

---

## コマンド一覧

コマンドパレット（`Ctrl+Shift+P`）からファジー検索で呼び出せます。

### 起動・停止

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Call All` | all | 全員起動（10人） |
| `Call Butler` | butler | 執事のみ起動 |
| `Call Chief` | chief | メイド長のみ起動 |
| `Call Butler & Chief` | agents | 執事とメイド長を起動 |
| `Call Maids Pick` | pick | チェックボックスでメイドを選択して起動 |
| `Kill All` | kill all | 全セッション一括終了 |
| `Kill Pick` | kill pick | エージェントを選んで終了 |
| `Restart Pick` | restart | エージェントを選んで再起動 |

### セッション・タスク

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Resume` | resume | 既存のtmuxセッションに復帰 |
| `Claude Start` | claude | 全ターミナルでClaude Code起動 |
| `Task to Butler` | task butler | 執事にタスク送信 |
| `Task to Maid` | task maid | 特定メイドに送信 |

### UI

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Dashboard` | dashboard | ダッシュボード表示 |
| `Open Dashboard in Browser` | browser | ブラウザでダッシュボードを開く |
| `Controller` | controller | コントローラーパネル表示 |
| `Tmux Viewer` | tmux viewer | tmuxビューアを開く |

### 管理

| コマンド | 検索キーワード | 説明 |
|---------|--------------|------|
| `Init` | init | ワークスペース初期化 |
| `Init Global` | init global | グローバル設定初期化 |
| `Watch Start` | watch start | YAMLファイル監視開始 |
| `Watch Stop` | watch stop | YAMLファイル監視停止 |
| `Promote Rule` | promote rule | ルールをグローバルに昇格 |

---

## 設定

### 拡張機能設定

VSCode の設定（`Ctrl+,`）で変更できます。

| 設定 | 説明 | デフォルト |
|-----|------|-----------|
| `maidAgent.maidOrder` | メイドの起動順序 | `["emma", "sophia", ...]` |
| `maidAgent.showAgentPanel` | サイドバーにエージェントパネルを表示 | `true` |
| `maidAgent.sessionWarningThreshold` | セッション数警告の閾値 | `10` |
| `maidAgent.autoResumeOnStartup` | IDE起動時にセッション自動復帰 | `true` |

### カスタム立ち絵

`.maid-agent/system/resources/images/` にキャラクター画像を配置すると、サイドバーに表示されます。

| 項目 | 推奨値 |
|-----|-------|
| サイズ | 幅200〜300px x 高さ300〜500px |
| 形式 | PNG（透過推奨）/ JPG / WebP |

```
基本:          emma.png
バリエーション: emma_1.png, emma_2.png  (ランダム選択、最大10)
ステータス別:   emma_wait.png, emma_work.png  (自動切替)
```

### ペルソナ（口調設定）

`.maid-agent/agents/personas/` で各キャラクターの口調をカスタマイズできます。

| キャラクター | 性格 | 口調の特徴 |
|------------|------|----------|
| シルヴィア（執事） | 冷静沈着 | 「〜でございます」 |
| ビオラ（メイド長） | 厳格 | 「〜ですよ」「〜なさい」 |
| エマ | 真面目 | 「〜ですね」 |
| ソフィア | クール寡黙 | 短文「〜です」 |
| リリー | 元気 | 「〜ですっ」 |
| ローズ | 姉御肌 | 「〜ですわ」 |
| アリス | 天然 | 「〜かもです」 |
| メイ | 控えめ | 「〜させていただきます」 |
| フローラ | 穏やか | 「〜してくださいね」 |
| ルナ | マイペース眠そう | 「〜zzz」 |

ペルソナは口調のガイドであり、エージェントの動作は `agents/instructions/` の指示書に従います。

---

## 詳細リファレンス

### ファイル構成

初期化後に作成される `.maid-agent/` ディレクトリ:

```
.maid-agent/
├── CLAUDE.md                    # エージェント用リファレンス
├── master/                      # ご主人様エリア
│   ├── NOTES.md                 # メモ
│   └── reports/                 # 完了レポートアーカイブ
├── agents/                      # エージェントエリア
│   ├── context/                 # プロジェクト固有コンテキスト
│   ├── instructions/            # 各役割の指示書
│   ├── personas/                # キャラクター口調設定
│   ├── rules/                   # ルールモジュール
│   └── skills/                  # 承認済みスキル
└── system/                      # システムエリア
    ├── bin/                     # 実行スクリプト（maid-notify）
    ├── config/                  # 設定ファイル
    ├── data/                    # タスク・レポートデータ
    └── resources/images/        # カスタム立ち絵
```

### MCPサーバー（maid-agent-messenger）

エージェント間のタスク管理を行うサーバーです。`Init Global` で自動セットアップされます。

**提供ツール:**

| ツール名 | 用途 | 使用者 |
|---------|------|-------|
| `create_task` | タスク/サブタスク作成 | 執事・メイド長 |
| `list_tasks` | タスク一覧取得（フィルタ対応） | 執事・メイド長 |
| `get_task` | タスク詳細取得 | 全員 |
| `get_report` | レポート内容取得 | 執事・メイド長 |
| `update_task` | タスク更新 | メイド長 |
| `assign_task` | タスク割り当て | メイド長 |
| `get_my_task` | 自分のタスク取得 | メイド |
| `update_status` | ステータス更新 | メイド |
| `get_team_status` | 全メイドの状況取得 | メイド長・執事 |

**サーバー管理:**

```bash
# WSL内で実行
pm2 status                        # ステータス確認
pm2 logs maid-agent-messenger     # ログ確認
pm2 restart maid-agent-messenger  # 再起動
```

**`.mcp.json`（プロジェクト初期化時に自動生成）:**

```json
{
  "mcpServers": {
    "maid-agent-messenger": {
      "type": "http",
      "url": "http://localhost:3100/mcp",
      "headers": {
        "X-Maid-Project-Path": "${CLAUDE_PROJECT_DIR}"
      }
    }
  }
}
```

`X-Maid-Project-Path` ヘッダーで、MCPサーバーが操作対象のプロジェクトを識別します。

### タスクカテゴリ

通常タスク以外に、ユーザー判断が必要な特殊カテゴリがあります。

| カテゴリ | 用途 | 表示 |
|---------|------|------|
| `task` | 通常タスク（デフォルト） | - |
| `action_required` | ユーザーの判断が必要 | 🚨 要対応 |
| `skill_candidate` | スキル化候補 | 📚 スキル候補 |
| `improvement` | 改善提案 | 💡 改善提案 |

### 報告書システム

メイドのタスク完了時に作業報告書が自動アーカイブされ、ダッシュボードから閲覧できます。

```
メイド: current_{name}.md に報告書作成
    ↓ update_status(completed)
MCPサーバー: master/reports/task-{id}-{name}.md にアーカイブ
    ↓
ダッシュボード: タスク詳細からレポートを閲覧
```

### スキルシステム

繰り返し使える作業パターンを「スキル」として保存する仕組みです。

1. メイドがスキル化候補を発見 → reports/ に記載
2. メイド長が集約 → ダッシュボードの「📚 スキル候補」に表示
3. ユーザーが承認 → `.maid-agent/agents/skills/` に作成

### 改善提案システム

メイドからルールやフローの改善提案を受け付ける仕組みです。

1. メイドが改善点を発見 → reports/ に記載
2. メイド長が集約 → ダッシュボードの「💡 改善提案」に表示
3. ユーザーが承認 → 該当ルールを更新

### グローバル設定

プロジェクト間で共有するルールとスキルを `~/.maid-agent/` に保存できます。`Init Global` で作成されます。

```
~/.maid-agent/
├── rules/              # ルールモジュール
│   ├── common/         # 全員に適用
│   ├── butler/         # 執事のみ
│   ├── chief/          # メイド長のみ
│   └── maid/           # メイドのみ
└── skills/             # 共有スキル
```

ルールモジュールの形式:

```markdown
---
name: compaction-recovery
description: コンパクション対策ルール
auto_select: true
target_roles: [common]
---

（ルール内容）
```

### maid-notify（エージェント間通知）

tmux send-keys ベースのエージェント間通知コマンドです。

```bash
.maid-agent/system/bin/maid-notify {ターゲット} "メッセージ"

# 例
.maid-agent/system/bin/maid-notify chief "タスク完了しました"
```

MCPツール使用時に「Server not initialized」エラーが発生した場合:

```bash
.maid-agent/system/bin/maid-notify --mcp-reconnect {自分のID} &
```

### tmux 設定

セッション作成時にスクロールモードの自動解除（5秒）が設定されます。
マウスサポートが必要な場合は `~/.tmux.conf` に `set -g mouse on` を追加してください。

### LAN内ダッシュボード閲覧

LAN内の別端末からダッシュボードにアクセスできます。

**前提条件:** Windows 11 22H2以降、WSL 2.0.4以降

**セットアップ:**

1. `%USERPROFILE%\.wslconfig` に `networkingMode=mirrored` を設定し、WSLを再起動
2. `~/.maid-agent/system/config/mcp-server.yaml` の `host` を `0.0.0.0` に変更
3. Windows Firewall でポート3100のインバウンドルールを追加:
   ```powershell
   New-NetFireWallRule -DisplayName 'Maid Agent Dashboard' -Direction Inbound -LocalPort 3100 -Action Allow -Protocol TCP
   ```

**アクセス:** `http://<WindowsのIPアドレス>:3100/dashboard?project=<プロジェクトパス>`

> 認証機構は未実装のため、信頼できるLAN内でのみ使用してください。MCPエンドポイントはloopbackのみアクセス可です。

---

## 謝辞

本プロジェクトは [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)（[@shio_shoppaize](https://x.com/shio_shoppaize)氏）を参考に開発しました。
執事・メイド長・メイドの3層構造によるマルチエージェント管理という着想は、同プロジェクトに着想を得ています。

本プロジェクトでは、MCPサーバーによるエージェント間通信、VSCode拡張としてのGUI統合、ダッシュボード機能などを独自に追加しています。

## 参考

- [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun) -- 3層マルチエージェント管理の元プロジェクト
- [解説記事](https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1) -- multi-agent-shogun の設計思想
- [VSCode API](https://code.visualstudio.com/api) -- VSCode拡張開発リファレンス

## ライセンス

- **ソースコード**: MIT License
- **キャラクター画像**: MIT License の対象外（© 2026 noctcross All Rights Reserved）

詳細は [LICENSE](LICENSE) を参照してください。
