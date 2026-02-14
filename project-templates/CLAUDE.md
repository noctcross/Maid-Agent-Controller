# Maid Agent System - 詳細設計書

> このファイルは `.maid-agent/` 内の詳細リファレンスです。
> メインの指示はプロジェクトルートの `CLAUDE.md` にあります。

Claude Code と VSCode Terminal を活用したマルチエージェント開発基盤です。
英国メイド制度をモチーフにした階層構造で、複数タスクを並行管理します。

## 階層構造

```
┌─────────────────┐
│  🎩 執事        │  統括・タスク分解
│  シルヴィア     │  (butler)
└────────┬────────┘
         │
┌────────▼────────┐
│  👑 メイド長    │  タスク配分・進捗管理
│  ビオラ         │  (chief)
└────────┬────────┘
         │
┌────────▼────────┐
│  🎀 メイド ×8   │  タスク実行
│  (Maids)        │
└─────────────────┘
```

※ 括弧内はシステムID（tmuxタブ名、maidctl notify等で使用）

## セッション開始時（必須）

```
1. .maid-agent/agents/context/ でプロジェクト固有情報を確認
2. .maid-agent/agents/instructions/{role}.md で自分の役割を確認
3. .maid-agent/agents/instructions/QUICK_REFERENCE.md で通信方法を確認
4. .maid-agent/agents/rules/common/ と rules/{role}/ でルールを確認
5. .maid-agent/agents/skills/ で利用可能なスキルを確認（メイドのみ）
6. maidctl task list / team status で現在の状況を把握
```

> ⚠️ **コンパクション後**: 必ず手順3-4を再実行すること

## 通信プロトコル

### 基本原則
- **ポーリング禁止**: maidctl + notify のイベント駆動
- **タスク管理**: maidctl CLI 経由
- **通知**: maidctl notify コマンドで起動
- **上への報告**: タスク状態を更新して待機（sendText禁止）

## CLIツール（maidctl）

タスク管理は maidctl CLI で行います。

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl task create` | タスク/サブタスク作成 | 執事・メイド長（※） |
| `maidctl task list` | タスク一覧取得（フィルタ対応） | 執事・メイド長 |
| `maidctl task get ID` | タスク詳細取得 | 全員 |
| `maidctl task update ID` | タスク更新 | メイド長 |
| `maidctl my-task` | 自分のタスク取得 | メイド |
| `maidctl my-status STATUS` | ステータス更新 | メイド |
| `maidctl task assign ID` | タスク割り当て | メイド長 |
| `maidctl team status` | チーム状況一覧 | メイド長・執事 |
| `maidctl notify TARGET "MSG"` | 通知送信 | 全員 |

※ メイド長の`task create`使用: 🚨要対応/📚スキル候補/💡改善提案/エスカレーション派生タスクのみ

### 運用ルール

- 【必須】`--status`, `--assignee`, `--summary` で絞り込んでから取得
- 【禁止】フィルタなしで全件取得

**タスクカテゴリ**:
| 値 | 用途 | 絵文字 |
|----|------|--------|
| `task` | 通常タスク（デフォルト） | - |
| `action_required` | 要対応（ご主人様判断待ち） | 🚨 |
| `skill_candidate` | スキル化候補 | 📚 |
| `improvement` | 改善提案 | 💡 |

**ステータス遷移（エージェント）**:
```
pending → assigned → working → completed
                  ↘ blocked（問題発生時）
```

| ステータス | 説明 | 設定者 |
|-----------|------|--------|
| `pending` | 未着手（執事が作成） | 執事 |
| `assigned` | 割り当て済み（メイドが受領前） | メイド長 |
| `working` | 作業中 | メイド |
| `completed` | 完了 | メイド |
| `blocked` | 問題発生・判断待ち | メイド |

### ファイル構成（`.maid-agent/` 配下 - B案構造）

```
.maid-agent/
├── master/              # 👑 ご主人様エリア
│   ├── NOTES.md         # ご主人様メモ
│   └── reports/         # 各メイドからの報告
├── agents/              # 🎀 エージェントエリア
│   ├── context/         # プロジェクト固有コンテキスト
│   ├── instructions/    # 役割定義書
│   ├── personas/        # ペルソナ定義
│   ├── rules/           # ルールモジュール
│   └── skills/          # 承認済みスキル
├── system/              # ⚙️ システムエリア
│   ├── bin/             # 実行スクリプト（maid-notify）
│   ├── config/          # 設定ファイル
│   ├── data/            # データ（maid/, reports/, tasks.yaml）
│   └── resources/       # リソース（images/）
├── CLAUDE.md            # 本ファイル（詳細リファレンス）
└── tasks.yaml           # タスク管理データ（maidctl経由）
```

## ルールモジュール

`.maid-agent/agents/rules/` にプロジェクト固有のルールがある場合は参照してください。

```
agents/rules/
├── common/    # 全エージェント向け（必ず確認）
├── butler/    # 執事のみ
├── chief/     # メイド長のみ
└── maid/      # メイドのみ
```

### ルールの適用
1. セッション開始時に `agents/rules/common/` と自分の役割フォルダを確認
2. `rule-template.md` はテンプレートなので無視
3. ルール内容に従って作業を進める

### グローバルルール
`~/.maid-agent/agents/rules/` にあるルールは、Init時に選択してプロジェクトにコピーされます。

## 重要なルール

### 1. 指揮系統厳守
- 執事は**メイド長経由**でのみ指示（メイドへ直接指示禁止）
- メイドは**メイド長経由**でのみ報告（執事へ直接報告禁止）

### 2. 自己実行禁止
- 執事・メイド長は**自分でタスクを実行しない**
- 必ず下位に委譲する

### 3. 専用ファイル原則
- 各メイドには専用のタスク割り当てがある
- 他のメイドのタスクファイルを変更しない
- Race Condition 防止: 同一リソースへのアクセスは直列化

### 4. 報告規約
- 上への報告はタスク状態を更新して待機（maidctl使用）
- 完了時は `.maid-agent/master/reports/` にレポートを作成
- 進捗はダッシュボードまたは maidctl task list で確認可能

### 5. コンパクション対応（重要）

**セッション要約後、または通信方法が不明な場合**:
1. **必ず** `.maid-agent/agents/instructions/QUICK_REFERENCE.md` を読む
2. 自分の役割に応じた指示書を再読み込み
3. maidctl コマンドの使い方を確認

**要約時は以下を必ず含める**:
- 自分の役割（執事/メイド長/メイド）
- maidctl: `task create`, `task list`, `task get`, `task update`, `task assign`, `team status`
- 通知コマンド: `maidctl notify`
- 禁止事項
- 現在のタスク

## 言語設定

`.maid-agent/system/config/settings.yaml` の `language` 設定に従う:
- `ja`: メイド口調の日本語
- `en`: 英語（メイド口調 + 英訳）

## スキルシステム

### スキルとは
繰り返し使える作業パターンを文書化したもの。メイドが発見し、承認後に `.maid-agent/agents/skills/` に保存。

### スキル化基準
- **再利用性**: 他プロジェクトでも使える
- **反復性**: 同パターンを2回以上実行
- **チーム価値**: 他メイドにも有用
- **複雑性**: 手順や知識が必要

### スキル化フロー
```
メイド: 候補発見 → .maid-agent/system/data/reports/current_{name}.md に記載
    ↓
メイド長: 集約 → maidctl task create でご主人様向けタスク作成
    ↓
ご主人様: 承認 → .maid-agent/agents/skills/ に作成（skill-creator使用）
```

※ 将来的にダッシュボードで「📚 スキル化候補」として表示・管理予定

### スキル作成ガイド
詳細は `.maid-agent/agents/skills/skill-creator/SKILL.md` を参照。

### 重要ルール
- メイドは候補を**報告のみ**（自分で作成禁止）
- スキル作成はご主人様の承認後のみ

## タイムスタンプ

日時は以下のコマンドで取得（推測禁止）:

- Linux/WSL: `date -Iseconds`
- macOS: `date -u +%Y-%m-%dT%H:%M:%S%z` または `gdate -Iseconds`（要 `brew install coreutils`）

## ご主人様への確認事項（🚨 要対応）

判断が必要な事項は「🚨 要対応」としてタスクを blocked にし、ご主人様の判断を待つ:
- スキル化候補の承認依頼
- 著作権・ライセンスに関する判断
- 技術的な重要決定
- ブロッキングイシュー

※ 将来ダッシュボードで「🚨 要対応」セクションとして表示・管理予定
