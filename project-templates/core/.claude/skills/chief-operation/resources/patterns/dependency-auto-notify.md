# Dependency Auto-Notify - 依存解消自動通知

## 概要

V2.1で導入された waiting 依存解消時の自動通知フロー。
依存タスク完了時に、システムが自動で waiting タスクの担当者に通知し、状態を更新する。

## 自動通知フロー

```
┌─────────────────────────────────────────────────────────────┐
│  waiting 依存解消自動通知                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  【メイドA】#100-3 完了                                      │
│      │                                                       │
│      └── maidctl my-status completed                        │
│            │                                                 │
│            ▼                                                 │
│  【システム】                                                │
│      │                                                       │
│      ├── blockedBy 検索                                     │
│      │    → #100-4 が blockedBy: ["100-3"] を持つ           │
│      │                                                       │
│      ├── 自動通知送信                                        │
│      │    → メイドB に "依存タスク #100-3 完了"              │
│      │                                                       │
│      ├── v2Substatus 更新                                    │
│      │    → #100-4: waiting → working                       │
│      │                                                       │
│      └── blockedBy 更新                                      │
│           → #100-4: blockedBy: [] に更新                    │
│            │                                                 │
│            ▼                                                 │
│  【メイドB】通知受領、作業再開                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## メイド長の役割

### 基本: 監視のみ

waiting 依存解消はシステムが自動処理するため、メイド長は通常介入不要。

```bash
# 状況確認のみ
maidctl team status
maidctl task list --substatus waiting --summary
```

### 介入が必要なケース

| ケース | 症状 | 対応 |
|--------|------|------|
| 自動通知失敗 | waiting のまま変化なし | 手動で notify |
| 依存タスクがキャンセル | 永続 waiting | 方針判断して手動解除 |
| blockedBy 設定漏れ | waiting だが blockedBy が空 | 手動で更新 |
| 複数依存の部分解消 | blockedBy に残りあり | 待機継続を確認 |

## 手動介入手順

### ケース1: 自動通知が動作しなかった場合

```bash
# 1. 状態確認
maidctl task get WAITING_TASK_ID
# → substatus: waiting, blockedBy: ["COMPLETED_ID"]

# 2. 手動で状態更新
maidctl task update WAITING_TASK_ID --substatus working

# 3. 手動で通知
maidctl notify {メイド} "依存タスク #COMPLETED_ID が完了しました。#WAITING_TASK_ID を再開してください。"
```

### ケース2: 依存タスクがキャンセルされた場合

```bash
# 1. 方針を判断
# - 依存なしで続行可能か？
# - 代替タスクを待つか？
# - タスク自体をキャンセルするか？

# 2. 判断に応じて対応
# 続行可能な場合:
maidctl task update WAITING_TASK_ID --substatus working
maidctl notify {メイド} "依存タスク #CANCELLED_ID はキャンセルされました。依存なしで #WAITING_TASK_ID を続行してください。"

# キャンセルする場合:
maidctl task update WAITING_TASK_ID --status closed
```

### ケース3: 複数依存がある場合

```bash
# blockedBy に複数タスクが設定されている場合
maidctl task get WAITING_TASK_ID
# → blockedBy: ["100-3", "100-5"]

# 一部完了時は待機継続
# 100-3 完了 → blockedBy: ["100-5"] に自動更新
# 100-5 完了 → blockedBy: [] になり active へ
```

## シーケンス図

```
メイドA          maidctl/System        メイドB          メイド長
  │                   │                   │                │
  │ my-status         │                   │                │
  │ completed         │                   │                │
  ├──────────────────>│                   │                │
  │                   │                   │                │
  │                   │ blockedBy検索     │                │
  │                   │ #100-4 発見       │                │
  │                   │                   │                │
  │                   │ 自動通知          │                │
  │                   ├──────────────────>│                │
  │                   │                   │                │
  │                   │ v2Substatus更新   │                │
  │                   │ waiting→working  │                │
  │                   │                   │                │
  │                   │ 状態変更通知      │                │
  │                   ├─────────────────────────────────>│
  │                   │                   │                │
  │                   │                   │ 作業再開       │
  │                   │                   │────────>      │
  │                   │                   │                │
```

## 判断ポイント

| 状況 | システム動作 | メイド長アクション |
|------|-------------|-------------------|
| 正常な依存解消 | 自動通知・状態更新 | 監視のみ |
| 自動処理失敗 | 変化なし | 手動で notify と更新 |
| 依存キャンセル | 対応なし | 方針判断・手動対応 |
| 複数依存の部分解消 | blockedBy 更新 | 待機継続を確認 |

## 注意点

- 【重要】waiting 解消はシステム自動、メイド長は監視役
- 【禁止】正常動作時の二重通知（システム通知と重複する）
- 【推奨】長期 waiting は依存先の進捗を確認
- 【推奨】自動処理失敗時は原因調査（ログ確認）

## waiting タスクの設定方法

メイドが waiting を設定する際のコマンド:
```bash
maidctl my-status waiting --blocked-by "100-3"
```

これにより:
- substatus: waiting
- blockedBy: ["100-3"]
が設定され、#100-3 完了時に自動通知される。

## 関連パターン

- [substatus-handling](substatus-handling.md) - 各 substatus の対応方法
- [dependency-progression](dependency-progression.md) - 依存関係の手動進行
