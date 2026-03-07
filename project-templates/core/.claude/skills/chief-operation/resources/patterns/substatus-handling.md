# Substatus Handling - サブステータス対応

## 概要

V2.1で導入されたsubstatus（checkpoint/waiting等）に対するメイド長の対応手順。
各substatusの意味を理解し、適切なアクションを取る。

## substatus 一覧

> **V2.1正式定義**: `paused` は非推奨。`archived` は subStatus ではなく独立フラグ。

| status | substatus | 意味 | メイド長アクション |
|--------|-----------|------|-------------------|
| open | pending | 作成済み、未割当 | assign して通知 |
| open | assigned | 割当済み、未着手 | 着手確認、必要に応じ再通知 |
| open | working | 作業中 | 待機（進捗監視） |
| open | **checkpoint** | 確認待ち | **判断して応答** |
| open | **waiting** | 依存待ち | **自動解消（システム）** |
| closed | completed | 完了 | レビュー、親タスク進捗確認 |

**archived フラグ**:
`closed` 後に `--archived` フラグで設定。subStatus とは別管理。

## checkpoint と waiting の違い

```
┌─────────────────────────────────────────────────────────────┐
│  checkpoint vs waiting                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  【checkpoint】人間の判断待ち                                │
│    ├── メイド長/ご主人様の回答が必要                         │
│    ├── 例: 「この設計でよいですか？」                        │
│    ├── 解除: メイド長が maidctl notify で回答               │
│    └── 解除後: subStatus → working                        │
│                                                              │
│  【waiting】他タスク完了待ち                                 │
│    ├── 別タスクの完了が必要                                  │
│    ├── 例: 「#100-3 の結果が必要」                           │
│    ├── 解除: 依存タスク完了で自動通知・状態更新             │
│    └── 解除後: subStatus → working（自動）                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 使い分けガイド

| シナリオ | substatus | 理由 |
|----------|-----------|------|
| 「この設計でよいですか？」 | checkpoint | 人間の判断が必要 |
| 「APIの仕様を教えてください」 | checkpoint | 情報提供が必要 |
| 「#100-3 の結果が必要」 | waiting | 他タスク依存 |
| 「外部ライブラリ待ち」 | waiting | 疑似タスク作成して待機 |
| 「ご主人様の承認待ち」 | checkpoint | 人間の判断が必要 |

## checkpoint 対応手順

### Step 1: checkpoint タスクの確認

```bash
# checkpoint 状態のタスク一覧
maidctl task list --substatus checkpoint --summary
```

### Step 2: 確認内容の把握

```bash
# タスク詳細を確認
maidctl task get TASK_ID

# 報告書を確認（確認事項の詳細）
# reports/current_{メイド}.md 参照
```

### Step 3: 判断と回答

**自分で判断できる場合:**
```bash
# メイドに回答を通知
maidctl notify {メイド} "確認しました。[回答内容]。作業を続行してください。"
```

**ご主人様の判断が必要な場合:**
```bash
# action_required タスクを作成
maidctl task create --title "判断が必要: [内容]" --action-required

# 元タスクは checkpoint のまま待機
```

### Step 4: メイドの再開確認

回答後、メイドがworkingに戻ったか確認:
```bash
maidctl team status
```

## waiting 対応手順

### 基本: システム自動対応

waiting はシステムが自動で解消するため、メイド長は基本的に待機。

```
依存タスク完了
    ↓
システムが blockedBy を検索
    ↓
該当タスクの担当者に自動通知
    ↓
subStatus: waiting → working に自動更新
```

### 確認のみ

```bash
# waiting タスクの確認
maidctl task list --substatus waiting --summary

# blockedBy の確認（依存先タスク）
maidctl task get WAITING_TASK_ID
```

### 手動介入が必要なケース

| 状況 | 対応 |
|------|------|
| 依存タスクがキャンセルされた | 方針を判断して通知 |
| 依存関係が変更になった | blockedBy を更新 |
| 長期間 waiting のまま | 依存先の進捗を確認 |

## paused 対応手順（V2.0互換・非推奨）

> **注意**: V2.1では `paused` は非推奨です。新規タスクでは使用しないでください。
> 既存の `paused` タスクがある場合のみ、以下の手順で対応してください。

### Step 1: 停止理由の確認

```bash
maidctl task get TASK_ID
# → reason フィールドで停止理由を確認
```

### Step 2: 再開可否の判断

| 停止理由 | 対応 |
|----------|------|
| 他作業優先のため | 優先度再評価後、再開通知 |
| 外部要因待ち | 要因解消を確認してから再開通知 |
| 問題発生 | 問題解決後に再開通知 |

### Step 3: 再開通知

```bash
maidctl notify {メイド} "[停止理由]が解消しました。#TASK_ID の作業を再開してください。"
```

## 判断ポイント

| substatus | 確認事項 | 対応期限目安 |
|-----------|----------|-------------|
| checkpoint | 何を確認待ちか | 即時〜数時間 |
| waiting | 何のタスクを待っているか | 依存先次第 |
| working | 進捗は順調か | 定期確認 |

## 注意点

- 【重要】checkpoint は人間対応、waiting はシステム対応
- 【禁止】waiting タスクに手動で notify しない（システム通知と重複）
- 【推奨】checkpoint 滞留は早期エスカレーション
- 【推奨】長期 waiting は依存先の進捗を確認

## 関連パターン

- [dependency-auto-notify](dependency-auto-notify.md) - waiting 自動通知の詳細
- [escalation-handling](escalation-handling.md) - checkpoint でのエスカレーション
