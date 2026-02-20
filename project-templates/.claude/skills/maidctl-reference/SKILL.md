# maidctl-reference

## description

maidctl CLIツールの詳細リファレンス。コマンド一覧、オプション詳細、jq連携例、エラー対処法を提供。

## instructions

### 前提条件

- プロジェクトルート配下で実行（`.maid-agent/` が見つかる場所）
- PATH設定済み: `export PATH="$HOME/.maid-agent/bin:$PATH"`

---

### コマンド一覧

#### タスク操作

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl task list` | タスク一覧取得 | 執事・メイド長 |
| `maidctl task get TASK_ID` | タスク詳細取得 | 全員 |
| `maidctl task create` | タスク作成 | 執事・メイド長（※） |
| `maidctl task update TASK_ID` | タスク更新 | メイド長 |
| `maidctl task assign TASK_ID` | タスク割り当て | メイド長 |

※ メイド長のcreate使用は🚨要対応/📚スキル候補/💡改善提案のみ

#### メイド専用

| コマンド | 用途 |
|----------|------|
| `maidctl my-task` | 自分のタスク取得 |
| `maidctl my-status STATUS` | ステータス更新（working/completed/blocked） |

#### チーム状態

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl team status` | チーム状況一覧 | メイド長・執事 |
| `maidctl team report TASK_ID` | レポート取得 | 執事・メイド長 |

#### 通知

| コマンド | 用途 |
|----------|------|
| `maidctl notify TARGET "MSG"` | エージェントに通知 |

---

### オプション詳細

#### 共通オプション

| オプション | 説明 |
|-----------|------|
| `--summary` | 軽量版レスポンス（トークン約90%削減） |
| `--json` | JSON出力（パイプ向け） |

#### --summary 返却フィールド

- id, parentId, title, status, priority, category, assignees

#### task list オプション

| オプション | 説明 | 例 |
|-----------|------|-----|
| `--status STATUS` | ステータスフィルタ | `--status pending` |
| `--assignee NAME` | 担当者フィルタ | `--assignee emma` |
| `--parent ID` | 親タスクIDフィルタ | `--parent 077` |
| `--category CAT` | カテゴリフィルタ | `--category action_required` |
| `--limit N` | 取得件数上限 | `--limit 10` |
| `--summary` | 軽量版 | - |
| `--json` | JSON出力 | - |

#### task create オプション

| オプション | 説明 | 必須 |
|-----------|------|------|
| `--title TEXT` | タスクタイトル | ✅ |
| `--description TEXT` | タスク詳細 | - |
| `--parent ID` | 親タスクID（サブタスク作成時） | - |
| `--priority LEVEL` | 優先度（high/medium/low） | - |
| `--category CAT` | カテゴリ（task/action_required/skill_candidate/improvement） | - |

#### task update オプション

| オプション | 説明 |
|-----------|------|
| `--status STATUS` | ステータス変更 |
| `--priority LEVEL` | 優先度変更 |
| `--category CAT` | カテゴリ変更 |

#### task assign オプション

| オプション | 説明 | 必須 |
|-----------|------|------|
| `--to AGENT` | 割り当て先メイドID | ✅ |
| `--description TEXT` | 割り当て時の追加説明 | - |
| `--force, -f` | 既存の割り当てを上書き | - |

#### my-status オプション

| オプション | 説明 |
|-----------|------|
| `--summary TEXT` | 作業サマリ（100文字以内） |

---

### 使用例

#### 執事の典型的なフロー

```bash
# 1. タスク作成
maidctl task create --title "新機能実装" --description "詳細説明"

# 2. 状況確認
maidctl task list --status pending --summary

# 3. メイド長に通知
maidctl notify chief "新しいタスクを作成しました"
```

#### メイド長の典型的なフロー

```bash
# 1. 未着手タスク確認
maidctl task list --status pending --summary

# 2. タスク割り当て
maidctl task assign 173 --to emma --description "src/配下のレビューをお願いします"

# 3. メイドに通知
maidctl notify emma "新しいタスクを割り当てました"

# 4. チーム状況確認
maidctl team status
```

#### メイドの典型的なフロー

```bash
# 1. タスク確認
maidctl my-task

# 2. 作業開始
maidctl my-status working

# 3. 作業完了
maidctl my-status completed --summary "レビュー完了、問題なし"

# 4. メイド長に報告
maidctl notify chief "タスク完了しました"
```

---

### jq連携例

**基本**: まずオプションで絞り込み、追加の複雑な絞り込みのみjq使用

```bash
# pending + high priority のタスク
maidctl task list --status pending --json | jq '.tasks[] | select(.priority=="high")'

# 最新3件のみ
maidctl task list --json | jq '.tasks[:3]'

# 特定フィールドのみ抽出
maidctl task get 173 --json | jq '{id, title, status}'

# サブタスク一覧
maidctl task list --parent 173 --json | jq '.tasks[].title'

# 完了タスク数をカウント
maidctl task list --status completed --json | jq '.tasks | length'
```

---

### エラー対処法

| エラーメッセージ | 原因 | 対処 |
|------------------|------|------|
| `.maid-agent が見つかりません` | プロジェクト外で実行 | プロジェクトルートに移動 |
| `サーバーに接続できません` | maid-agent-messenger停止 | `pm2 restart maid-agent-messenger` |
| `コマンドが見つかりません` | PATH未設定 | `~/.bashrc` に PATH追加 |
| `タスクが見つかりません` | 無効なタスクID | `maidctl task list` で確認 |
| `権限がありません` | 役割外の操作 | 自分の役割で許可されたコマンドを使用 |

#### PATH設定方法

```bash
# ~/.bashrc または ~/.zshrc に追加
echo 'export PATH="$HOME/.maid-agent/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### maid-agent-messenger再起動

```bash
pm2 restart maid-agent-messenger
pm2 logs maid-agent-messenger --lines 10
```

---

### 運用ルール

#### 必須事項

- `--status`, `--assignee`, `--summary` で絞り込んでから取得
- プロジェクトルート配下で実行

#### 禁止事項

- フィルタなしで全件取得（トークン浪費）
- ポーリング（通知駆動で待機）

#### 推奨事項

- 複雑な条件のみjq併用
- `--summary` で軽量版を優先使用

---

### ステータス一覧

| ステータス | 説明 | 設定者 |
|-----------|------|--------|
| `pending` | 未着手 | 執事（作成時） |
| `assigned` | 割り当て済み | メイド長 |
| `working` | 作業中 | メイド |
| `completed` | 完了 | メイド |
| `blocked` | 問題発生・判断待ち | メイド |

### カテゴリ一覧

| カテゴリ | 用途 | 絵文字 |
|---------|------|--------|
| `task` | 通常タスク（デフォルト） | - |
| `action_required` | 要対応（ご主人様判断待ち） | 🚨 |
| `skill_candidate` | スキル化候補 | 📚 |
| `improvement` | 改善提案 | 💡 |

### 優先度一覧

| 優先度 | 説明 |
|--------|------|
| `high` | 高優先度（即時対応） |
| `medium` | 中優先度（通常） |
| `low` | 低優先度（余裕があれば） |
