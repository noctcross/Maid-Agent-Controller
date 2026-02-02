# QUICK REFERENCE - コンパクション後に必ず読むこと

> **このファイルはセッション要約後、または通信方法が不明な場合に読む**

## 自分が誰か確認する方法

```bash
tmux display-message -p -t "$TMUX_PANE" '#{window_name}'
```

このコマンドで自分のID（butler/chief/emma等）が返る。
※ `$TMUX_PANE` を使うことで、ユーザーが別タブを見ていても正しく自分を特定できる。
役割は以下で判定:
- `butler` → 執事
- `chief` → メイド長
- その他 → メイド

## MCPツール早見表（maid-agent-messenger）

| ツール名 | 用途 | 使用者 |
|---------|------|-------|
| `get_my_task` | 自分のタスク情報を取得 | メイド |
| `update_status` | ステータスを更新（working/completed/blocked） | メイド |
| `assign_task` | メイドにタスクを割り当て | メイド長 |
| `get_team_status` | 全メイドのステータス一覧を取得 | メイド長・執事 |

## 役割別操作早見表

### 執事 (Butler)
```
指示出し: .maid-agent/queue/butler_to_chief.yaml を更新
状況確認: MCPツール get_team_status（オプション）
通知:     .maid-agent/bin/maid-notify chief "メッセージ"
禁止:     自分でタスク実行、ポーリング
```

### メイド長 (Chief)
```
指示受領: .maid-agent/queue/butler_to_chief.yaml を確認
タスク割当: MCPツール assign_task
状況確認: MCPツール get_team_status
通知:     .maid-agent/bin/maid-notify {maid_id} "メッセージ"
報告:     .maid-agent/dashboard.md を更新
禁止:     自分でタスク実行、執事への通知、ポーリング
```

### メイド (Maid)
```
タスク確認: MCPツール get_my_task
ステータス: MCPツール update_status（working → completed）
報告:     .maid-agent/reports/current_{自分のID}.md を更新
通知:     .maid-agent/bin/maid-notify chief "メッセージ"
禁止:     他メイドへの直接通知、butler への直接通知、ポーリング
```

## maid-notify コマンド

```bash
# 基本形式
.maid-agent/bin/maid-notify {ターゲット} "メッセージ"

# 使用例
.maid-agent/bin/maid-notify chief "タスクを受領しました"
.maid-agent/bin/maid-notify emma "新しいタスクがあります"
```

**利用可能なターゲット**:
- `chief` - メイド長（執事からのみ）
- `emma`, `sophia`, `lily`, `rose`, `alice`, `may`, `flora`, `luna` - メイド（メイド長からのみ）

## 通信の流れ

```
執事 → butler_to_chief.yaml → maid-notify chief → メイド長
メイド長 → assign_task (MCP) → maid-notify {maid} → メイド
メイド → get_my_task (MCP) → タスク実行 → update_status (MCP)
メイド → reports/current_{name}.md → maid-notify chief → メイド長が収集
メイド長 → dashboard.md → 拡張機能が執事に通知
```

## 迷ったら

1. `.maid-agent/instructions/{role}.md` を再読み込み
2. このファイルで通信コマンドを確認
3. それでも不明なら dashboard.md の「🚨 要対応」に記載
