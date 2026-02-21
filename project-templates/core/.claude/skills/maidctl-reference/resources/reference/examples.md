# maidctl 使用例

## 概要

maidctl の役割別の典型的な使用フローと jq 連携パターン。

## 適用条件

- 役割に応じた使い方を確認したい時
- jq との連携方法を知りたい時
- 複雑なフィルタリングが必要な時

---

## 役割別フロー

### 執事の典型的なフロー

```bash
# 1. タスク作成
maidctl task create --title "新機能実装" --description "詳細説明"

# 2. 状況確認
maidctl task list --status pending --summary

# 3. メイド長に通知
maidctl notify chief "新しいタスクを作成しました"
```

### メイド長の典型的なフロー

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

### メイドの典型的なフロー

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

## jq 連携例

**基本原則**: まずオプションで絞り込み、追加の複雑な絞り込みのみ jq を使用

### フィルタリング

```bash
# pending + high priority のタスク
maidctl task list --status pending --json | jq '.tasks[] | select(.priority=="high")'

# 最新3件のみ
maidctl task list --json | jq '.tasks[:3]'
```

### フィールド抽出

```bash
# 特定フィールドのみ抽出
maidctl task get 173 --json | jq '{id, title, status}'

# サブタスク一覧
maidctl task list --parent 173 --json | jq '.tasks[].title'
```

### 集計

```bash
# 完了タスク数をカウント
maidctl task list --status completed --json | jq '.tasks | length'
```

---

## 注意点

- `--json` オプションを使わないと jq でパースできない
- 大量データは先に `--status` や `--limit` で絞り込む
- 複雑な条件のみ jq を使用（シンプルな条件はオプションで対応）
