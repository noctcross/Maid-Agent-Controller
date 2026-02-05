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

| ツール名 | 用途 | 主要パラメータ | 使用者 |
|---------|------|---------------|-------|
| `create_task` | 新規タスク作成 | title(必須), description(省略可) | 執事・メイド長（※） |
| `list_tasks` | タスク一覧取得 | status, assignee, limit | 執事・メイド長 |
| `get_task` | タスク詳細取得 | taskId | 全員 |
| `update_task` | タスク状態更新 | taskId, status | メイド長 |
| `get_my_task` | 自分のタスク取得 | agent_id | メイド |
| `update_status` | ステータス更新 | agent_id, status | メイド |
| `assign_task` | タスク割り当て | task_id, target_agent, title(必須) | メイド長 |
| `get_team_status` | チーム状況一覧 | - | メイド長・執事 |

※ メイド長のcreate_task使用は🚨要対応/📚スキル候補/💡改善提案/エスカレーション派生のみ

## 役割別操作早見表

### 執事 (Butler)
```
タスク作成: MCPツール create_task
状況確認: MCPツール list_tasks / get_team_status
通知:     .maid-agent/system/bin/maid-notify chief "メッセージ"
禁止:     自分でタスク実行、ポーリング
```

### メイド長 (Chief)
```
タスク確認: MCPツール list_tasks
タスク割当: MCPツール assign_task
タスク作成: MCPツール create_task（※ご主人様向けのみ）
状況確認: MCPツール get_team_status
状態更新: MCPツール update_task
通知:     .maid-agent/system/bin/maid-notify {maid_id} "メッセージ"
禁止:     自分でタスク実行、執事への通知、ポーリング
```
※ create_task対象: 🚨要対応/📚スキル候補/💡改善提案/エスカレーション派生

### メイド (Maid)
```
タスク確認: MCPツール get_my_task
ステータス: MCPツール update_status（working → completed）
報告:     .maid-agent/.maid-agent/system/data/reports/current_{自分のID}.md を更新
通知:     .maid-agent/system/bin/maid-notify chief "メッセージ"
禁止:     他メイドへの直接通知、butler への直接通知、ポーリング
```

## maid-notify コマンド

```bash
# 基本形式
.maid-agent/system/bin/maid-notify {ターゲット} "メッセージ"

# 使用例
.maid-agent/system/bin/maid-notify chief "タスクを受領しました"
.maid-agent/system/bin/maid-notify emma "新しいタスクがあります"
```

**利用可能なターゲット**:
- `chief` - メイド長ビオラ（執事からのみ）
- `emma`, `sophia`, `lily`, `rose`, `alice`, `may`, `flora`, `luna` - メイド（メイド長からのみ）

### MCP再接続オプション

MCPツール使用時に「Server not initialized」エラーが発生した場合:

```bash
# 自分自身のMCP接続をリセット（バックグラウンド実行必須）
.maid-agent/system/bin/maid-notify --mcp-reconnect {自分のID} &

# 例: ルナの場合
.maid-agent/system/bin/maid-notify --mcp-reconnect luna &

# 他のエージェントをリセット（メイド長用）
.maid-agent/system/bin/maid-notify --mcp-reconnect emma
```

**注意**:
- 自分自身に送る場合は `&` でバックグラウンド実行が必須
- `[MCP再接続完了]` メッセージを受信したら再試行可能

## 通信の流れ

```
執事 → create_task (MCP) → maid-notify chief → メイド長
メイド長 → list_tasks (MCP) → assign_task (MCP) → maid-notify {maid} → メイド
メイド → get_my_task (MCP) → タスク実行 → update_status (MCP)
メイド → .maid-agent/system/data/reports/current_{name}.md → maid-notify chief → メイド長が収集
メイド長 → update_task (MCP) → Webビューに反映
```

## 迷ったら

1. `.maid-agent/agents/instructions/{role}.md` を再読み込み
2. このファイルで通信コマンドを確認
3. それでも不明なら🚨 要対応としてタスクを blocked にし、ご主人様の判断を待つ
