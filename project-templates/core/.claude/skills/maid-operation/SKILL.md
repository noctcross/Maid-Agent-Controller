---
name: maid-operation
description: "[maidOnly] メイドの運用手順。タスク受領時・作業開始時・完了報告時・ブロック発生時に参照。推測で行動せずパターンを確認すること。"
version: 2.1
patterns: ["task-workflow", "report-format", "blocked-handling", "checkpoint-vs-waiting", "skill-candidate", "improvement-proposal", "autonomous-progress"]
---

# Maid Operation - メイド運用スキル（V2.1）

## Overview

メイドがタスクを受領してから完了報告するまでの標準的な運用手順をまとめたスキル。
ブロック時の対応、スキル化候補の発見、改善提案の記載方法も含む。

**V2.1 変更点**:
- タスク種別: goal/phase/action/investigation
- 状態: mainStatus(open/closed/cancelled) + v2Substatus(pending/assigned/working/waiting/checkpoint/completed)
- archived: closed後の独立フラグ（v2Substatusではない）
- checkpoint vs waiting の使い分け
- Investigation 昇格推奨（promotion）
- 自律進行パターン（メイドが自己判断できる範囲の定義）

## Quick Start

### 基本フロー

```
1. maidctl my-task でタスク確認
   ※ 報告書テンプレートはタスク割り当て時に自動生成済み
2. maidctl my-status working で開始
3. タスクを実行
4. 報告書を作成
   - 場所: .maid-agent/system/data/reports/current_{自分のID}.md
   - 形式: patterns/report-format.md 参照
5. maidctl my-status completed で完了（報告書は自動アーカイブ）
6. maidctl notify chief で通知
```

**注意**: 報告書を master/reports/ に直接作成しないこと。current_{ID}.md に書き、completed で自動アーカイブされる。

### ブロック時（V2.1: checkpoint / waiting を使い分け）

#### checkpoint（ご主人様/上位者の判断待ち）
```
1. 問題を報告書に記載
2. maidctl my-status blocked --substatus checkpoint --reason "判断待ち内容" で報告
3. maidctl notify chief で通知
4. 停止（回答を待つ）
```

#### waiting（他タスクの完了待ち）
```
1. 依存関係を報告書に記載
2. maidctl my-status blocked --substatus waiting --blocked-by TASK_ID で報告
3. maidctl notify chief で通知
4. 停止（依存解消で自動通知を受ける）
```

**使い分けの詳細**: [checkpoint-vs-waiting.md](resources/patterns/checkpoint-vs-waiting.md) 参照

## 自律進行パターン（V2.1新規）

メイドが**自己判断で進められる範囲**と**確認が必要な範囲**を明確化。

### 自己判断OK（checkpoint不要）

| 判断内容 | 例 |
|----------|-----|
| タスク記載の手段選択 | 「適切な方法で実装」→ ライブラリ選定 |
| 軽微なリファクタリング | コード整理、変数名改善 |
| エラーハンドリング追加 | 例外処理、バリデーション |
| テストケース追加 | 網羅性向上のためのケース |
| ドキュメント整備 | コメント追加、JSDoc |

### 確認必要（checkpoint）

| 判断内容 | 例 |
|----------|-----|
| 設計変更 | アーキテクチャ変更、IF変更 |
| スコープ外の追加作業 | タスク記載以外の機能追加 |
| 破壊的変更 | 後方互換性を壊す変更 |
| 外部依存の追加 | 新規ライブラリ導入 |
| 判断に迷う内容 | 複数の選択肢があり優劣不明 |

### 判断フロー

```
タスク実行中に判断が必要な状況が発生
       │
       ▼
┌─────────────────────────────────┐
│ タスク記載の範囲内か？          │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
   YES               NO
    │                 │
    ▼                 ▼
自己判断で進行    checkpoint で確認
```

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
| [task-workflow](resources/patterns/task-workflow.md) | タスク受領〜完了の基本フロー（V2.1対応） |
| [report-format](resources/patterns/report-format.md) | 報告書テンプレート・記載ルール（V2.1対応） |
| [blocked-handling](resources/patterns/blocked-handling.md) | ブロック時の対応フロー（旧方式、互換性維持） |
| [checkpoint-vs-waiting](resources/patterns/checkpoint-vs-waiting.md) | **V2.1新規**: checkpoint/waiting の使い分けガイド |
| [skill-candidate](resources/patterns/skill-candidate.md) | スキル化候補の発見・報告方法 |
| [improvement-proposal](resources/patterns/improvement-proposal.md) | 改善提案の記載方法 |
| [autonomous-progress](resources/patterns/autonomous-progress.md) | **V2.1新規**: 自律進行パターン詳細 |

## V2.1 新規概念

### タスク種別

**基本は Phase を直接受領**。複雑な Phase の場合のみ Action に分割される。

| 種別 | 説明 | 実行者 |
|------|------|--------|
| goal | ご主人様指示単位の目標 | - |
| phase | Goal分解、成果物単位 | **メイド**（直接受領） |
| action | 複雑なPhaseを分割した作業単位 | メイド |
| investigation | 調査タスク（docs/昇格対象） | メイド |

### Investigation 昇格推奨

Investigation タスク完了時、成果物をdocs/に昇格すべきか判断して報告書に記載:

```yaml
## Investigation 昇格推奨
promotion:
  recommended: true
  path: "docs/research/mcp-tools-specification.md"
  reason: "他タスクでも参照される汎用的な仕様情報"
```

## Related Skills

- [maidctl-reference](../maidctl-reference/SKILL.md) - CLI詳細リファレンス
- [chief-operation](../chief-operation/SKILL.md) - メイド長の運用手順（報告先）
