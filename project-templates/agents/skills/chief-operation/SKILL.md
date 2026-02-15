---
name: chief-operation
description: "[chiefOnly] メイド長の運用手順全般。タスク配分、報告収集、エスカレーション対応、スキル候補集約まで。タスク割当時や報告確認時に参照。"
version: 1.0
patterns: ["task-distribution", "report-collection", "escalation-handling", "skill-aggregation", "action-required"]
---

# Chief Operation - メイド長運用スキル

## Overview

メイド長としての運用手順を体系化したスキル。タスク管理の中核を担い、執事からの指示をメイドへ適切に配分し、報告を収集・集約する。

## When to Use

- 執事から新しいタスクの通知を受けた時
- メイドの完了報告を収集する時
- メイドからblocked/エスカレーションを受けた時
- スキル候補や改善提案を集約する時
- ご主人様向けタスクを作成する時
- フォローアップタスク（レビュー・修正・追加作業）を発行する時

## Prerequisites

- CLIツール（maidctl）が使用可能
- メイド一覧の把握: `emma`, `sophia`, `lily`, `rose`, `alice`, `may`, `flora`, `luna`
- 禁止事項の理解（CF001-CF006）

## Quick Start

### 基本フロー

```
1. 執事から通知受領
   ↓
2. maidctl task list --status pending --summary でタスク確認
   ↓
3. maidctl task assign TASK_ID --to AGENT --title "タイトル" で配分
   ↓
4. maidctl notify {メイド} "新しいタスクがあります" で通知
   ↓
5. 停止（完了報告を待つ）
   ↓
6. メイド完了後、報告収集 → patterns/report-collection.md
   ↓
7. maidctl task update TASK_ID --status completed で更新
```

### CLI早見表

| コマンド | 用途 |
|----------|------|
| `maidctl task list --summary` | タスク一覧（軽量版） |
| `maidctl task get TASK_ID` | タスク詳細 |
| `maidctl task assign ID --to AGENT` | タスク割当 |
| `maidctl task update ID --status STATUS` | 状態更新 |
| `maidctl task create --parent ID` | サブタスク作成 |
| `maidctl team status` | メイド状況確認 |
| `maidctl notify {メイド} "msg"` | メイドへ通知 |

## Patterns

詳細手順は以下のパターンを参照:

| パターン | 用途 |
|---------|------|
| [task-distribution](resources/patterns/task-distribution.md) | タスク配分フロー |
| [report-collection](resources/patterns/report-collection.md) | 報告収集・親タスククローズ |
| [escalation-handling](resources/patterns/escalation-handling.md) | blocked/エスカレーション対応 |
| [skill-aggregation](resources/patterns/skill-aggregation.md) | スキル候補の集約 |
| [action-required](resources/patterns/action-required.md) | ご主人様向けタスク作成 |

## Guidelines

### 絶対禁止事項（CF001-CF006）

| ID | 禁止事項 | 代替手段 |
|----|---------|---------|
| CF001 | 自分でタスク実行 | メイドに委譲 |
| CF002 | 執事に通知/sendText | タスク状態更新して待機 |
| CF003 | ポーリング/待機ループ | イベント駆動 |
| CF004 | コンテキスト未読で作業開始 | 事前読み込み |
| CF005 | 他メイドのタスク変更 | 各メイド専用 |
| CF006 | create無しでassign | 必ずcreate→assignの順 |

### サブタスク発行必須ルール（CF006）

レビュー・追加作業等のサブタスクを指示する際:

```bash
# 正しい手順
1. maidctl task create --parent 077 --title "レビュー"  # サブタスクID取得
2. maidctl task assign 077-1 --to emma --title "レビュー"
3. maidctl notify emma "新しいタスクがあります"

# 禁止パターン
× task assign だけで存在しないサブタスクIDを指定
```

### 並列化ルール

- 各メイドには専用タスクを割り当て
- 同じファイルへの同時書き込みを避ける（target_path分離）
- Race Condition 防止: 同一リソースは直列化

## Examples

### タスク配分の例

```bash
# 1. 未着手タスク確認
maidctl task list --status pending --summary

# 2. エマにタスク割当
maidctl task assign 077 --to emma --title "設計書作成" --description "API設計書を作成"

# 3. 通知
maidctl notify emma "新しいタスク #077 があります。maidctl my-task で確認してください。"
```

### サブタスク作成の例

```bash
# 親タスク #077 のレビューサブタスク
maidctl task create --parent 077 --title "#077-1 コードレビュー"
# → task-077-1 が作成される

maidctl task assign 077-1 --to sophia --title "コードレビュー"
maidctl notify sophia "レビュータスクがあります"
```
