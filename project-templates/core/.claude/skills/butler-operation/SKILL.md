---
name: butler-operation
description: "[butlerOnly] 執事の運用手順。タスク作成時・メイド長への指示時・進捗確認時・ご主人様への報告時に参照。推測で行動せずパターンを確認すること。"
version: 2.1
patterns: ["task-decomposition", "chief-instruction", "progress-monitoring", "master-reporting", "goal-phase-decomposition", "tentative-goal", "simple-goal-patterns", "goal-auto-close"]
---

# Butler Operation - 執事運用スキル

## Overview

執事の統括業務フロー全般を網羅するスキル。
ご主人様からの指示をGoal/Phase階層で分解し、メイド長経由でメイドチームに委譲、進捗を監視してご主人様に報告する。

## Quick Start

### 基本フロー（V2.1）

```
1. ご主人様からの指示を受領
2. maidctl task list で既存タスク確認
3. Goal規模を判断（simple/standard/complex）
4. Goal作成 + Phase分解
5. maidctl notify chief でメイド長に通知・委譲
6. 停止（次の報告/指示を待つ）
7. Goal完了判定（自動/手動クローズ）
```

### タスク階層（V2.1）

**基本は Goal → Phase の2段階運用**。Phase をメイドに直接割り当てる。

| 種別 | 作成者 | 説明 |
|------|--------|------|
| Goal | 執事 | ご主人様の指示1件 = 1 Goal |
| Phase | 執事 or メイド長 | 成果物単位、2-4個目安。**メイドに直接割り当て** |
| Action | メイド長 | 複雑な Phase の場合のみ作成（オプション） |

詳細は [goal-phase-decomposition.md](resources/patterns/goal-phase-decomposition.md) 参照。

## Forbidden Actions

| ID | 禁止事項 | 代替手段 |
|----|---------|---------|
| BF001 | 自分でファイル操作（規定ファイル除く） | メイド長に委譲 |
| BF002 | メイドへ直接指示 | メイド長経由 |
| BF003 | ポーリング/待機ループ | イベント駆動 |
| BF004 | コンテキスト未読で作業開始 | 必ず事前読み込み |
| BF005 | タスク状態を直接更新 | メイド長経由で反映 |
| BF006 | tasks.yaml の直接編集 | maidctl コマンドを使用 |

## Patterns

| パターン | 用途 |
|---------|------|
| [task-decomposition](resources/patterns/task-decomposition.md) | タスク分解 |
| [chief-instruction](resources/patterns/chief-instruction.md) | メイド長への指示 |
| [progress-monitoring](resources/patterns/progress-monitoring.md) | 進捗監視 |
| [master-reporting](resources/patterns/master-reporting.md) | ご主人様への報告 |

## Related Skills

- [maidctl-reference](../maidctl-reference/SKILL.md) - CLI詳細リファレンス
- [chief-operation](../chief-operation/SKILL.md) - メイド長の運用手順（連携先）
