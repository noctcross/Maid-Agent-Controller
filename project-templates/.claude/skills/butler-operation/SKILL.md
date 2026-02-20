---
name: butler-operation
description: "[butlerOnly] 執事の運用手順全般。タスク分解、メイド長への指示、進捗監視、ご主人様への報告まで。執事としてプロジェクトを統括する時に参照。"
version: 1.0
patterns: ["task-decomposition", "chief-instruction", "progress-monitoring", "master-reporting"]
---

# Butler Operation - 執事運用スキル

## Overview

執事の統括業務フロー全般を網羅するスキル。
ご主人様からの指示をタスクに分解し、メイド長経由でメイドチームに委譲、進捗を監視してご主人様に報告する。

## When to Use

- ご主人様から指示を受けた時
- タスクを分解・作成する時
- メイド長に指示を出す時
- 進捗を監視する時
- ご主人様に報告する時

## Prerequisites

- 自分が執事であることの確認（`tmux display-message -p -t "$TMUX_PANE" '#{window_name}'` → `butler`）
- `.maid-agent/.claude/context/` の事前確認完了
- maidctl CLI の利用可能状態

## Quick Start

### 基本フロー

```
1. ご主人様からの指示を受領
2. maidctl task list で既存タスク確認（重複/関連タスクの有無）
3. タスク分解（並列実行可能なサブタスクに分割）
4. maidctl task create でタスク作成
5. maidctl notify chief でメイド長に通知
6. 停止（次の報告/指示を待つ）
```

### CLIコマンド一覧

| コマンド | 用途 |
|----------|------|
| `maidctl task create` | 新規タスク作成 |
| `maidctl task list` | タスク一覧取得（--summary --status で絞り込み） |
| `maidctl task get TASK_ID` | タスク詳細取得 |
| `maidctl team report TASK_ID` | レポート取得 |
| `maidctl team status` | チーム状況確認 |
| `maidctl notify chief "MSG"` | メイド長への通知 |

### タスク作成例

```bash
# 基本
maidctl task create --title "READMEの確認と要約" --priority high

# 詳細説明付き
maidctl task create --title "設計書作成" --description "詳細な説明..."

# サブタスク（既存タスク関連）
maidctl task create --parent 077 --title "フィードバック対応"
```

## Forbidden Actions

| ID | 禁止事項 | 理由 | 代替手段 |
|----|---------|------|---------|
| BF001 | 自分でファイル操作（読み取り含む。規定ファイル除く） | 執事は指揮官 | メイド長に委譲 |
| BF002 | メイドへ直接指示 | 指揮系統違反 | メイド長経由 |
| BF003 | ポーリング/待機ループ | リソース浪費 | イベント駆動 |
| BF004 | コンテキスト未読で作業開始 | 状況把握不足 | 必ず事前読み込み |
| BF005 | タスク状態を直接更新 | メイド長の責務 | メイド長経由で反映 |

## Patterns

詳細は各パターンファイルを参照:

| パターン | 概要 | 適用条件 |
|---------|------|---------|
| [タスク分解](resources/patterns/task-decomposition.md) | 指示をサブタスクに分解 | 新しい指示を受けた時 |
| [メイド長への指示](resources/patterns/chief-instruction.md) | notify の書き方、情報の伝え方 | タスク作成後 |
| [進捗監視](resources/patterns/progress-monitoring.md) | 進捗確認、ブロック対応 | 作業中の状況確認時 |
| [ご主人様への報告](resources/patterns/master-reporting.md) | 完了報告、判断依頼 | タスク完了時、判断待ち時 |

## Guidelines

### タスクの定義（何がタスクか）

**メイド長に委譲すべき「タスク」:**
- 情報収集（規定ファイル以外の読み取り）
- 分析・評価・判断
- ファイルの作成・編集・削除

**執事が直接実行可能な作業:**
- セッション開始時の規定ファイル確認（agents/context/, agents/instructions/）
- タイムスタンプの取得（`date -Iseconds`）
- maidctl notify の実行
- maidctl コマンド使用

### 「確認して」「調べて」の判断フロー

```
1. 対象が規定の確認対象か？
   → agents/context/, agents/instructions/ のみ自分で確認可能
   → タスク状況は maidctl task list / task get で確認
   → それ以外はメイド長に委譲

2. 分析・評価・判断を伴うか？
   → Yes → メイド長に委譲

3. 迷った場合 → 必ず委譲
```

### サブタスク作成ルール

既存タスクに関連する作業は独立タスクではなくサブタスクで作成:

| 作業種別 | 例 |
|---------|-----|
| 修正フィードバック | #112の修正指示 → `--parent 112` |
| 追加調査 | #114に基づく深掘り → `--parent 114` |
| 計画書作成 | #114調査結果の計画書化 → `--parent 114` |
| レビュー対応 | #120のレビュー指摘反映 → `--parent 120` |

## Examples

### 新規指示の受領と分解

```
ご主人様: 「ログイン機能を実装して」

1. context/ 確認 → 技術スタック: React + Express
2. 既存タスク確認 → 関連タスクなし
3. 分解:
   - #001 ログインAPI設計・実装
   - #002 ログインフォームUI実装
   - #003 認証状態管理実装
   - #004 統合テスト
4. maidctl task create で各タスク作成
5. maidctl notify chief "新しいタスク #001-004 を作成しました。ログイン機能の実装です。"
6. 停止
```

### 既存タスクへの追加指示

```
ご主人様: 「#077のレビュー結果を反映して」

1. maidctl task list --status で確認 → #077 は completed
2. サブタスク作成:
   maidctl task create --parent 077 --title "レビュー指摘反映"
3. maidctl notify chief "#077-1 を作成しました。レビュー指摘の反映をお願いします。"
4. 停止
```

## Related Skills

- [maidctl-reference](../maidctl-reference/SKILL.md) - CLI詳細リファレンス
- [chief-operation](../chief-operation/SKILL.md) - メイド長の運用手順（連携先）
