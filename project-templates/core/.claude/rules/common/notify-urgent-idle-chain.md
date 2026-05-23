---
name: notify-urgent-idle-chain
description: notify の通常（idle連鎖）と --urgent（即時割り込み）の使い分けルール
auto_select: true
target_roles: [common]
---

# notify 通常フロー vs --urgent 使い分けルール

## 概要

`maidctl notify` には2つの送信モードがある。通常は **idle連鎖**（queue + 自動flush）で十分。
送信先が停止・応答不能の場合のみ **--urgent**（queueバイパス + asyncRewake割り込み）を使う。

---

## ルール内容

### 通常フロー: idle連鎖（デフォルト）

```
送信側: maidctl notify TARGET "MSG"
  → TARGET が busy → queue に蓄積
  → TARGET が idle に遷移 → agent-status-hook が queue を検知
  → flush-notify-queue.sh が先頭1チャンクを SendKeys
  → TARGET が処理 → idle → 次チャンク flush（queue空まで連鎖）
```

- **メイドの通常報告・完了通知・ブロック通知はすべてこのフロー**
- busy中でもキューに入り、idle遷移で自動配信されるため、通常は意識不要

### --urgent フロー: queueバイパス即時割り込み

```
送信側: maid-notify --urgent TARGET "MSG"
  → busy チェックをスキップ
  → SendKeys でメッセージをTARGETのペインに直接注入 + Enter
  → exit 2（asyncRewake シグナル）
  → TARGETのClaudeセッションが割り込まれ、注入メッセージを即時処理
```

- **busy チェックなし・queue なし・即座に画面へ注入**
- `exit 2` が asyncRewake シグナルとして機能し、実行中セッションを割り込む

### 必須事項

1. **--urgent を使う条件は「停止・応答不能の緊急介入」のみ**

   | 状況 | 使用するフロー |
   |------|---------------|
   | 通常の完了報告・ブロック通知 | 通常フロー（idle連鎖） |
   | 相手がbusy中だが急ぎではない | 通常フロー（idle遷移で自動配信） |
   | 相手が無期限停止・フリーズ疑い | --urgent |
   | 緊急停止指示・即時確認が必要 | --urgent |

2. **--urgent はキュー順序を逆転させることを理解して使う**
   - 通常フローで queue に溜まっているメッセージより --urgent メッセージが先に届く
   - 順序が重要なケースでは使用前に queue の状態を考慮すること

3. **--urgent の連発禁止**
   - asyncRewake で割り込んだ直後に再度 --urgent を送ると処理が混乱する
   - 1回送ったら応答を待つ

### 推奨事項

- 通常フローで queue が溜まりすぎる場合は送信頻度を下げることを検討
- --urgent の使用は履歴ログ（`history.log`）に `[URGENT]` として記録される

### 禁止事項

1. **通常の通知に --urgent を使わない**
   - idle連鎖が正常に機能している場合、--urgent は不要
   - 「急いでほしい」程度の理由での --urgent 使用は禁止

2. **複雑な順序制御を --urgent で実現しようとしない**
   - 複数メッセージの順序制御はシステム設計の問題
   - 本格的な順序保証は CodeLodis B-4（ワークフローエンジン）で実現予定

---

## notify-as-sole-channel との整合

本ルールは `notify-as-sole-channel.md`（notify が唯一の到達手段）の補足。

| ルール | 対象 |
|--------|------|
| notify-as-sole-channel | 「必ず notify を送れ」（送信すべき場面） |
| 本ルール | 「どのモードで送るか」（通常 vs --urgent の選択） |

---

## 実装詳細

### flush-notify-queue.sh（idle連鎖の担い手）

- queue 先頭から最大 `batch_chunk_count`件 / `batch_chunk_chars`文字 を1チャンク送信
- 残りは queue に書き戻す → idle遷移で再度 flush → 連鎖
- 閾値は `settings.yaml` の `notify.batch_chunk_count` / `notify.batch_chunk_chars` で設定

### maid-notify --urgent（割り込みの担い手）

- `check_agent_busy()` をスキップし `send_message()` を直接呼び出す
- `send_message()` = `$MUX_CMD send-keys -t TARGET -l "$message"` + C-m（Enter）
- 成功したら `exit 2`（asyncRewake シグナルとして Claude Code がセッション割り込みを実行）

---

## Why（出典・経緯）

task-899（idle連鎖方式採用）と task-900（--urgent 実機検証）を経て明文化（2026-05-24）。
従来の「全チャンクをループ送信」から「1チャンク送信 + idle連鎖」に変更したことで、
通常フロー（idle連鎖）と緊急フロー（--urgent）の役割分担が明確になった。
