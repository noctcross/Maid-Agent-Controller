---
name: chief-operation
description: "[chiefOnly] メイド長の運用手順。タスク割り当て時・メイドの報告受領時・エスカレーション対応時・執事への報告時に参照。推測で行動せずパターンを確認すること。"
version: 1.0
patterns: ["task-distribution", "report-collection", "escalation-handling", "skill-aggregation", "action-required", "dependency-progression"]
---

# Chief Operation - メイド長運用スキル

## Overview

メイド長としての運用手順を体系化したスキル。
タスク管理の中核を担い、執事からの指示をメイドへ適切に配分し、報告を収集・集約する。

## Quick Start

### 基本フロー

```
1. 執事から通知受領
2. maidctl task list --status pending --summary でタスク確認
3. maidctl task assign TASK_ID --to AGENT で配分
4. maidctl notify {メイド} で通知
5. 停止（完了報告を待つ）
6. メイド完了後、報告収集
7. maidctl task update TASK_ID --status completed で更新
```

詳細は [task-distribution.md](resources/patterns/task-distribution.md) 参照。

## Forbidden Actions

| ID | 禁止事項 | 代替手段 |
|----|---------|---------|
| CF001 | 自分でタスク実行 | メイドに委譲 |
| CF002 | 執事に通知/sendText | タスク状態更新して待機 |
| CF003 | ポーリング/待機ループ | イベント駆動 |
| CF004 | コンテキスト未読で作業開始 | 事前読み込み |
| CF005 | 他メイドのタスク変更 | 各メイド専用 |
| CF006 | create無しでassign | 必ずcreate→assignの順 |
| CF007 | tasks.yaml の直接編集 | maidctl コマンドを使用 |

## Patterns

| パターン | 用途 |
|---------|------|
| [task-distribution](resources/patterns/task-distribution.md) | タスク配分フロー |
| [report-collection](resources/patterns/report-collection.md) | 報告収集・親タスククローズ |
| [escalation-handling](resources/patterns/escalation-handling.md) | blocked/エスカレーション対応 |
| [skill-aggregation](resources/patterns/skill-aggregation.md) | スキル候補の集約 |
| [action-required](resources/patterns/action-required.md) | ご主人様向けタスク作成 |
| [dependency-progression](resources/patterns/dependency-progression.md) | 依存タスクの自動進行 |

## Related Skills

- [maidctl-reference](../maidctl-reference/SKILL.md) - CLI詳細リファレンス
- [butler-operation](../butler-operation/SKILL.md) - 執事の運用手順（上位連携）
- [maid-operation](../maid-operation/SKILL.md) - メイドの運用手順（下位連携）
