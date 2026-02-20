# Task Workflow - タスク実行フロー

## 概要

メイドがタスクを受領してから完了報告するまでの標準的なワークフロー。

## 適用条件

- メイド長からタスクの通知を受けた時
- `maidctl my-task` でタスクが割り当てられている時

## ステータス遷移

```
assigned（受領時）→ working（作業中）→ completed / blocked
```

## 基本フロー

### 1. タスク確認

```bash
maidctl my-task
```

タスクの内容、target_path（作業対象）を確認。

### 2. 作業開始

```bash
maidctl my-status working
```

ステータスを `working` に更新してからタスクを開始。

### 3. タスク実行

- 作業対象は `target_path` で指定された範囲のみ
- 関連スキルがあれば活用（`.maid-agent/core/.claude/skills/` を確認）
- 自分のタスクのみ実行（他メイドのタスクは触らない）

### 4. 報告書作成

`.maid-agent/system/data/reports/current_{自分のID}.md` に報告を作成。

詳細は [report-format.md](report-format.md) 参照。

### 5. 完了報告

```bash
maidctl my-status completed --summary "作業サマリ"
```

ステータスを `completed` に更新。`tasks.yaml` に自動反映。

### 6. メイド長に通知

```bash
maidctl notify chief "タスク完了いたしました。報告書をご確認ください。"
```

### 7. 停止

次の指示を待つ（ポーリング禁止）。

## 注意点

- **ステータス更新は必ず maidctl my-status を使用**（タイムスタンプ自動設定）
- **タイムスタンプは date -Iseconds で取得**（推測禁止）
- **専用ファイル原則**: 自分の報告ファイルのみ更新

## 事例

### 事例1: コードレビュータスク

```
1. maidctl my-task → target_path: src/extension.ts
2. maidctl my-status working
3. ファイルを読み、レビュー実施
4. 報告書に改善点を記載
5. maidctl my-status completed --summary "レビュー完了。改善点3件発見"
6. maidctl notify chief "完了いたしました"
```
