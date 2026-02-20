---
name: maid-operation
description: "[maidOnly] メイドの運用手順全般。タスク受領、実行、報告、ブロック対応、スキル候補発見まで。タスク完了時や問題発生時に参照。"
version: 1.0
patterns: ["task-workflow", "report-format", "blocked-handling", "skill-candidate", "improvement-proposal"]
---

# Maid Operation - メイド運用スキル

## Overview

メイドがタスクを受領してから完了報告するまでの標準的な運用手順をまとめたスキル。
ブロック時の対応、スキル化候補の発見、改善提案の記載方法も含む。

## When to Use

- タスクを受領したとき
- タスク完了時の報告作成
- 問題が発生してブロックされたとき
- スキル化候補を発見したとき
- 改善提案を記載したいとき

## Quick Start

### 基本フロー

```
1. maidctl my-task でタスク確認
2. maidctl my-status working で開始
3. タスクを実行
4. 報告書を作成（→ patterns/report-format.md）
5. maidctl my-status completed で完了
6. maidctl notify chief で通知
```

### ブロック時

```
1. 問題を報告書に記載
2. maidctl my-status blocked で報告
3. maidctl notify chief で通知
```

詳細は [blocked-handling.md](resources/patterns/blocked-handling.md) 参照。

## Patterns

| パターン | 用途 |
|---------|------|
| [task-workflow](resources/patterns/task-workflow.md) | タスク受領〜完了の基本フロー |
| [report-format](resources/patterns/report-format.md) | 報告書テンプレート・記載ルール |
| [blocked-handling](resources/patterns/blocked-handling.md) | ブロック時の対応フロー |
| [skill-candidate](resources/patterns/skill-candidate.md) | スキル化候補の発見・報告方法 |
| [improvement-proposal](resources/patterns/improvement-proposal.md) | 改善提案の記載方法 |

## Guidelines

- **報告先**: メイド長（chief）のみ
- **報告ファイル**: `.maid-agent/system/data/reports/current_{自分のID}.md`
- **タイムスタンプ**: `date -Iseconds` で取得（推測禁止）
- **スキル化候補**: 発見したら報告のみ（自分で作成禁止）
- **改善提案**: 発見したら報告のみ（自分で実施禁止）

## CLI Commands

| コマンド | 用途 |
|---------|------|
| `maidctl my-task` | 自分のタスク確認 |
| `maidctl my-status STATUS` | ステータス更新（working/completed/blocked） |
| `maidctl notify chief "msg"` | メイド長に通知 |
