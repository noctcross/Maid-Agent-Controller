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

## CLIツール早見表（maidctl）

| コマンド | 用途 | 主要オプション | 使用者 |
|----------|------|---------------|-------|
| `maidctl task create` | 新規タスク作成 | --title(必須), --description | 執事・メイド長（※） |
| `maidctl task list` | タスク一覧取得 | --status, --assignee, --summary | 執事・メイド長 |
| `maidctl task get TASK_ID` | タスク詳細取得 | --summary | 全員 |
| `maidctl team report TASK_ID` | レポート内容取得 | --limit | 執事・メイド長 |
| `maidctl report rearchive TASK_ID` | 報告書を再アーカイブ | --agent | 全員 |
| `maidctl task update TASK_ID` | タスク状態更新 | --status, --category, --summary | メイド長 |
| `maidctl my-task` | 自分のタスク取得 | - | メイド |
| `maidctl my-status STATUS` | ステータス更新 | --summary, --escalation | メイド |
| `maidctl task assign TASK_ID` | タスク割り当て | --to, --title(必須) | メイド長 |
| `maidctl team status` | チーム状況一覧 | - | メイド長・執事 |
| `maidctl notify TARGET "MSG"` | 通知送信 | - | 全員 |

※ メイド長のtask create使用は🔄フォローアップ/🚨要対応/📚スキル候補/💡改善提案/エスカレーション派生のみ

## 共通運用ルール

- 【必須】--status, --assignee, --summary で絞り込んでから取得
- 【禁止】フィルタなしで全件取得（トークン浪費）
- 【禁止】ポーリング（通知駆動で待機）

詳細は `/skill maidctl-reference` 参照。

## 役割別操作早見表

### 執事 (Butler)
```
タスク作成: maidctl task create --title "タイトル"
状況確認: maidctl task list --status pending --summary
         maidctl team status
通知:     maidctl notify chief "メッセージ"
禁止:     自分でタスク実行、ポーリング
```

### メイド長 (Chief)
```
タスク確認: maidctl task list --status pending --summary
タスク割当: maidctl task assign TASK_ID --to emma
タスク作成: maidctl task create（※ご主人様向けのみ）
状況確認: maidctl team status
状態更新: maidctl task update TASK_ID --status completed
カテゴリ変更: maidctl task update TASK_ID --category action_required
通知:     maidctl notify emma "メッセージ"
禁止:     自分でタスク実行、執事への通知、ポーリング
```
※ task create対象: 🔄フォローアップ/🚨要対応/📚スキル候補/💡改善提案/エスカレーション派生

### メイド (Maid)
```
タスク確認: maidctl my-task
ステータス: maidctl my-status working
         maidctl my-status completed --summary "完了"
報告:     .maid-agent/system/data/reports/current_{自分のID}.md を更新
通知:     maidctl notify chief "メッセージ"
禁止:     他メイドへの直接通知、butler への直接通知、ポーリング
```

## maidctl notify コマンド

```bash
# 基本形式
maidctl notify {ターゲット} "メッセージ"

# 使用例
maidctl notify chief "タスクを受領しました"
maidctl notify emma "新しいタスクがあります"
```

**利用可能なターゲット**:
- `chief` - メイド長ビオラ（執事・メイドから）
- `emma`, `sophia`, `lily`, `rose`, `alice`, `may`, `flora`, `luna` - メイド（メイド長からのみ）

## 通信の流れ

```
執事 → maidctl task create → maidctl notify chief → メイド長
メイド長 → maidctl task list → maidctl task assign → maidctl notify {maid} → メイド
メイド → maidctl my-task → タスク実行 → maidctl my-status completed
メイド → .maid-agent/system/data/reports/current_{name}.md → maidctl notify chief → メイド長が収集
メイド長 → maidctl task update → ダッシュボードに反映
```

## 迷ったら

1. `.maid-agent/.claude/instructions/{role}.md` を再読み込み
2. このファイルで通信コマンドを確認
3. それでも不明なら🚨 要対応としてタスクを blocked にし、ご主人様の判断を待つ
