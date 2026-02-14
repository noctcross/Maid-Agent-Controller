# Maid Agent System - 詳細設計書

> このファイルは `.maid-agent/` 内の詳細リファレンスです。
> メインの指示はプロジェクトルートの `CLAUDE.md` にあります。

Claude Code と VSCode Terminal を活用したマルチエージェント開発基盤です。
英国メイド制度をモチーフにした階層構造で、複数タスクを並行管理します。

## 階層構造

```
🎩 執事(butler) → 👑 メイド長(chief) → 🎀 メイド×8
```

※ 括弧内はシステムID（maidctl notify等で使用）

## セッション開始時（必須）

```
1. .maid-agent/agents/context/ でプロジェクト固有情報を確認
2. .maid-agent/agents/instructions/{role}.md で自分の役割を確認
3. .maid-agent/agents/instructions/QUICK_REFERENCE.md で通信方法を確認
4. .maid-agent/agents/rules/common/ と rules/{role}/ でルールを確認
5. .maid-agent/agents/skills/ で利用可能なスキルを確認
6. maidctl task list / team status で現在の状況を把握
```

> ⚠️ **コンパクション後**: 必ず手順2-3を再実行すること

## 通信プロトコル

- **ポーリング禁止**: maidctl + notify のイベント駆動
- **タスク管理**: maidctl CLI 経由
- **通知**: maidctl notify コマンドで起動
- **上への報告**: タスク状態を更新して待機（sendText禁止）

## CLIツール（maidctl）

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl task create` | タスク/サブタスク作成 | 執事・メイド長 |
| `maidctl task list` | タスク一覧取得 | 執事・メイド長 |
| `maidctl task get ID` | タスク詳細取得 | 全員 |
| `maidctl task update ID` | タスク更新 | メイド長 |
| `maidctl task assign ID` | タスク割り当て | メイド長 |
| `maidctl my-task` | 自分のタスク取得 | メイド |
| `maidctl my-status STATUS` | ステータス更新 | メイド |
| `maidctl team status` | チーム状況一覧 | メイド長・執事 |
| `maidctl notify TARGET "MSG"` | 通知送信 | 全員 |

### 運用ルール

- 【必須】`--status`, `--assignee`, `--summary` で絞り込んでから取得
- 【禁止】フィルタなしで全件取得

### タスクカテゴリ

| 値 | 用途 |
|----|------|
| `task` | 通常タスク（デフォルト） |
| `action_required` | 🚨 要対応（ご主人様判断待ち） |
| `skill_candidate` | 📚 スキル化候補 |
| `improvement` | 💡 改善提案 |

### ステータス遷移

```
pending → assigned → working → completed
                  ↘ blocked（問題発生時）
```

## ファイル構成

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
│   ├── bin/             # 実行スクリプト
│   ├── config/          # 設定ファイル
│   └── data/            # データ（reports/, tasks.yaml）
└── CLAUDE.md            # 本ファイル
```

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

### 4. 報告規約
- 上への報告はタスク状態を更新して待機（maidctl使用）
- 完了時は `.maid-agent/master/reports/` にレポートを作成

### 5. コンパクション対応
セッション要約後は、役割の指示書と QUICK_REFERENCE.md を再読み込みすること。

## スキルシステム

繰り返し使える作業パターンを `.maid-agent/agents/skills/` に保存。
詳細は `skill-creator/SKILL.md` を参照。

- メイドは候補を**報告のみ**（自分で作成禁止）
- スキル作成はご主人様の承認後のみ

## ご主人様への確認事項（🚨 要対応）

判断が必要な事項は「🚨 要対応」としてタスクを blocked にし、ご主人様の判断を待つ:
- スキル化候補の承認依頼
- 著作権・ライセンスに関する判断
- 技術的な重要決定
- ブロッキングイシュー
