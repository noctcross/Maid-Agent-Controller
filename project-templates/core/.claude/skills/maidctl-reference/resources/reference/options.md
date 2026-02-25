# maidctl オプション詳細

## 概要

maidctl の各コマンドで使用できるオプションの詳細リファレンス。

## 適用条件

- 特定コマンドのオプションを調べたい時
- 短縮形（-s, -m 等）を確認したい時
- 必須オプションを確認したい時

---

## 共通オプション

| オプション | 説明 |
|-----------|------|
| `--summary` | 軽量版レスポンス（トークン約90%削減） |
| `--json` | JSON出力（パイプ向け） |

### --summary 返却フィールド

- id, parentId, title, status, priority, category, assignees

---

## task list オプション

| オプション | 短縮形 | 説明 | 例 |
|-----------|--------|------|-----|
| `--status STATUS` | `-s` | ステータスフィルタ | `--status pending` |
| `--assignee NAME` | | 担当者フィルタ | `--assignee emma` |
| `--parent ID` | | 親タスクIDフィルタ | `--parent 077` |
| `--category CAT` | `-c` | カテゴリフィルタ | `--category skill_candidate` |
| `--limit N` | `-l` | 取得件数上限 | `--limit 10` |
| `--summary` | `-m` | 軽量版 | - |
| `--json` | | JSON出力 | - |

---

## task get オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--subtasks` | | サブタスクを含める |
| `--summary` | `-m` | 軽量版 |
| `--json` | | JSON出力 |

---

## task create オプション

| オプション | 短縮形 | 説明 | 必須 |
|-----------|--------|------|------|
| `--title TEXT` | `-t` | タスクタイトル | ✅ |
| `--description TEXT` | `-d` | タスク詳細 | - |
| `--parent ID` | | 親タスクID（サブタスク作成時） | - |
| `--priority LEVEL` | `-p` | 優先度（high/medium/low） | - |
| `--category CAT` | `-c` | カテゴリ（task/skill_candidate/improvement） | - |
| `--action-required` | | 要対応フラグ | - |

### V2.1 追加オプション

| オプション | 説明 | 備考 |
|-----------|------|------|
| `--type TYPE` | タスク種別（goal/phase/action/investigation） | - |
| `--size SIZE` | Goalサイズ（simple/standard/complex） | goal専用 |
| `--tentative` | 暫定Goal | goal専用 |
| `--blocked-by IDS` | 依存先タスクID（カンマ区切り） | - |

---

## task update オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--status STATUS` | `-s` | ステータス変更 |
| `--priority LEVEL` | `-p` | 優先度変更 |
| `--category CAT` | `-c` | カテゴリ変更 |
| `--substatus TEXT` | | サブステータス（詳細状態） |
| `--summary TEXT` | `-m` | サマリ |

---

## task assign オプション

| オプション | 短縮形 | 説明 | 必須 |
|-----------|--------|------|------|
| `--to AGENT` | `-a` | 割り当て先メイドID | ✅ |
| `--title TEXT` | `-t` | サブタスクタイトル | - |
| `--description TEXT` | `-d` | 割り当て時の追加説明 | - |
| `--force` | `-f` | 既存の割り当てを上書き | - |

---

## my-task オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--summary` | `-m` | 軽量版 |
| `--json` | | JSON出力 |

---

## my-status オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--summary TEXT` | `-m` | 作業サマリ（100文字以内） |
| `--escalation` | | エスカレーションフラグ（blocked時、ご主人様判断が必要な場合に使用） |

### V2.1 追加オプション

| オプション | 説明 | 備考 |
|-----------|------|------|
| `--substatus SUB` | サブステータス（working/pending/checkpoint/waiting/completed） | - |
| `--blocked-by IDS` | 依存先タスクID（カンマ区切り） | waiting時 |
| `--reason TEXT` | 状態変更理由 | checkpoint/waiting時 |

---

## team report オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--limit N` | `-l` | 出力行数制限 |
| `--json` | | JSON出力 |

---

## team status オプション

| オプション | 短縮形 | 説明 | 例 |
|-----------|--------|------|-----|
| `--status STATUS` | `-s` | ステータスでフィルタ | `--status working` |
| `--agent AGENT` | `-a` | エージェントIDでフィルタ | `--agent emma` |
| `--completed N` | | 直近N件の完了タスクを含める | `--completed 5` |
| `--summary` | `-m` | 軽量版 | - |
| `--json` | | JSON出力 | - |

---

## report rearchive オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--agent AGENT` | `-a` | 対象エージェント（省略時は全assignees） |
| `--json` | | JSON出力 |

---

## V2.1 migrate コマンド

### migrate status オプション

| オプション | 説明 |
|-----------|------|
| `--json` | JSON出力 |

### migrate run オプション

| オプション | 説明 |
|-----------|------|
| `--dry-run` | 実際には変更せず、変更内容のみ表示 |
| `--json` | JSON出力 |
