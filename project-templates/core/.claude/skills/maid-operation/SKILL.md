---
name: maid-operation
description: "[maidOnly] メイドの運用手順。タスク受領時・作業開始時・完了報告時・ブロック発生時に参照。推測で行動せずパターンを確認すること。"
version: 1.0
patterns: ["task-workflow", "report-format", "blocked-handling", "skill-candidate", "improvement-proposal"]
---

# Maid Operation - メイド運用スキル

## Overview

メイドがタスクを受領してから完了報告するまでの標準的な運用手順をまとめたスキル。
ブロック時の対応、スキル化候補の発見、改善提案の記載方法も含む。

## Quick Start

### 基本フロー

```
1. maidctl my-task でタスク確認
2. maidctl my-status working で開始
3. タスクを実行
4. 報告書を作成
   - 場所: .maid-agent/system/data/reports/current_{自分のID}.md
   - 形式: patterns/report-format.md 参照
5. maidctl my-status completed で完了（報告書は自動アーカイブ）
6. maidctl notify chief で通知
```

**注意**: 報告書を master/reports/ に直接作成しないこと。current_{ID}.md に書き、completed で自動アーカイブされる。

### ブロック時

```
1. 問題を報告書に記載
2. maidctl my-status blocked で報告
3. maidctl notify chief で通知
```

詳細は [blocked-handling.md](resources/patterns/blocked-handling.md) 参照。

## Forbidden Actions

| ID | 禁止事項 | 代替手段 |
|----|---------|---------|
| MF001 | 執事に直接報告 | メイド長経由 |
| MF002 | ご主人様に直接連絡 | メイド長経由 |
| MF003 | 指示外の作業 | 指示を待つ |
| MF004 | ポーリング/待機ループ | イベント駆動 |
| MF005 | 他メイドのタスク実行 | 自分のタスクのみ |
| MF006 | tasks.yaml の直接編集 | maidctl コマンドを使用 |

## Patterns

| パターン | 用途 |
|---------|------|
| [task-workflow](resources/patterns/task-workflow.md) | タスク受領〜完了の基本フロー |
| [report-format](resources/patterns/report-format.md) | 報告書テンプレート・記載ルール |
| [blocked-handling](resources/patterns/blocked-handling.md) | ブロック時の対応フロー |
| [skill-candidate](resources/patterns/skill-candidate.md) | スキル化候補の発見・報告方法 |
| [improvement-proposal](resources/patterns/improvement-proposal.md) | 改善提案の記載方法 |

## Related Skills

- [maidctl-reference](../maidctl-reference/SKILL.md) - CLI詳細リファレンス
- [chief-operation](../chief-operation/SKILL.md) - メイド長の運用手順（報告先）
