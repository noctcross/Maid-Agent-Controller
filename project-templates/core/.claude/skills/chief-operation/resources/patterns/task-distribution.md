# Task Distribution - タスク配分フロー

## 目次

- [概要](#概要)
- [適用条件](#適用条件)
- [手順](#手順)
- [フィルタオプション](#フィルタオプション)
- [注意点](#注意点)
- [事例](#事例)

## 概要

執事から受けたタスクをメイドに適切に配分する手順。

## 適用条件

- 執事から新しいタスクの通知を受けた時
- `maidctl task list --status pending` に未着手タスクがある時

## 手順

### 1. タスク確認

```bash
# 未着手タスク一覧（軽量版）
maidctl task list --status pending --summary

# 詳細が必要な場合
maidctl task get TASK_ID
```

### 2. メイド状況確認

```bash
maidctl team status
```

**ステータス一覧**:
| ステータス | 意味 |
|-----------|------|
| idle | 待機中（タスク割当可能） |
| assigned | 割り当て済み（受領前） |
| working | 作業中 |
| blocked | ブロック中 |
| completed | 完了 |

### 3. タスク割当

```bash
# 基本形
maidctl task assign TASK_ID --to AGENT --title "タイトル"

# 詳細指定
maidctl task assign TASK_ID --to AGENT \
  --title "タイトル" \
  --description "詳細説明" \
  --target-path "対象パス"
```

### --description テンプレート（タスク作成時必須）

`maidctl create task` 実行時は `--description` 必須。以下のテンプレートを使用:

```
【目的】何を達成するか
【成果物】期待される成果物（ファイル名、機能名等）
【完了条件】どうなれば完了か
【備考】制約・注意点（任意）
```

**サブタスク作成例**:
```bash
maidctl create task --parent 077 \
  --title "#077-1 コードレビュー" \
  --description "【目的】#077の実装コードをレビュー
【成果物】レビューコメント・指摘事項リスト
【完了条件】コード品質・設計妥当性の確認完了"
```

**レビュー指摘対応の例**:
```bash
maidctl create task --parent 077 \
  --title "#077-2 レビュー指摘対応" \
  --description "【目的】#077-1のレビュー指摘を修正
【成果物】修正済みコード
【完了条件】全指摘事項の対応完了"
```

**メイド選定基準**（参考）:
| メイド | ID | 得意分野 |
|--------|-----|----------|
| エマ | emma | コードレビュー |
| ソフィア | sophia | ドキュメント作成 |
| リリー | lily | テスト実行 |
| ローズ | rose | リファクタリング |
| アリス | alice | 調査・分析 |
| メイ | may | バグ修正 |
| フローラ | flora | 新機能実装 |
| ルナ | luna | 設定・環境構築 |

### 4. メイドへ通知

```bash
maidctl notify {メイド} "新しいタスク #{TASK_ID} があります。maidctl my-task で確認してください。"
```

### 5. 停止

完了報告を待つ。ポーリング禁止（CF003）。

## フィルタオプション

| オプション | 説明 | 例 |
|-----------|------|-----|
| `--status STATUS` | ステータスフィルタ | `--status pending` |
| `--assignee NAME` | 担当者フィルタ | `--assignee emma` |
| `--parent ID` | 親タスクフィルタ | `--parent 077` |
| `--summary` | 軽量出力 | トークン削減 |

## 注意点

- 【必須】`--summary` でトークン削減
- 【禁止】フィルタなしで全件取得
- 【重要】同じファイルを複数メイドに割り当てない（Race Condition）

## 事例

### 事例1: 単一タスクの配分

```bash
# 1. 未着手タスク確認
maidctl task list --status pending --summary

# 2. エマにタスク割当
maidctl task assign 077 --to emma --title "設計書作成" --description "API設計書を作成"

# 3. 通知
maidctl notify emma "新しいタスク #077 があります。maidctl my-task で確認してください。"
```

### 事例2: レビュー・追加作業のサブタスク発行

**重要**: CF006 違反を避けるため、必ず create → assign の順で実行

```bash
# 1. 親タスク #077 のレビューサブタスク作成
maidctl task create --parent 077 --title "#077-1 コードレビュー"
# → task-077-1 が作成される

# 2. 作成されたサブタスクを割当
maidctl task assign 077-1 --to sophia --title "コードレビュー"

# 3. 通知
maidctl notify sophia "レビュータスク #077-1 があります"
```

### 事例3: 複数サブタスクの並列配分

```bash
# 親タスク #100 を3つのサブタスクに分割
maidctl task create --parent 100 --title "フロントエンド実装"
maidctl task create --parent 100 --title "バックエンド実装"
maidctl task create --parent 100 --title "テスト作成"

# 異なるメイドに並列配分
maidctl task assign 100-1 --to flora --title "フロントエンド実装"
maidctl task assign 100-2 --to emma --title "バックエンド実装"
maidctl task assign 100-3 --to lily --title "テスト作成"

# 一斉通知
maidctl notify flora "タスク #100-1 があります"
maidctl notify emma "タスク #100-2 があります"
maidctl notify lily "タスク #100-3 があります"
```
