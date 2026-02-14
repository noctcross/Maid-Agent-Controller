# Report Format - 報告書テンプレート

## 概要

タスク完了時に作成する報告書のテンプレートと記載ルール。

## 適用条件

- タスク完了時の報告書作成
- ブロック時の状況報告
- エスカレーション時の詳細記載

## 報告ファイル

```
.maid-agent/system/data/reports/current_{自分のID}.md
```

例: `current_emma.md`, `current_flora.md`

## テンプレート

```markdown
# 作業報告 - {メイド名}

## タスク情報
- task_id: {タスクID}
- title: {タスクタイトル}
- description: {タスク説明}
- status: completed / blocked
- completed_at: {date -Iseconds で取得}

## 作業内容
{実行した作業の説明}

## 変更ファイル
- {変更したファイルのパス}

## 問題・注意点
{あれば記載、なければ「特になし」}

## 切り出し確認
extraction_check:
  required: false  # 200行超のファイルを作成した場合は true
  extracted_to: ""  # 切り出し先のパス

## スキル化候補
skill_candidate:
  found: false  # 必須
  # type: ""           # "new_skill" または "pattern_add"
  # target_skill: ""   # pattern_add の場合: 親スキル名
  # name: ""
  # description: ""
  # reason: ""

## 改善提案
improvement_proposal:
  found: false  # 必須
  # category: ""  # process | rule | tool | other
  # target: ""    # common | butler | chief | maid
  # title: ""
  # problem: ""
  # proposal: ""
  # benefit: ""
```

## 記載ルール

### タスク情報

- **task_id**: `maidctl my-task` で確認した ID
- **completed_at**: `date -Iseconds` で取得（推測禁止）

### 作業内容

- 何を実行したか具体的に記載
- 判断した理由があれば記載
- コード変更の場合は概要を説明

### 変更ファイル

- 変更したファイルのパスを列挙
- 読み取りのみの場合は「なし（読み取りのみ）」

### スキル化候補・改善提案

- **found は必須**（false でも記載）
- 詳細は [skill-candidate.md](skill-candidate.md)、[improvement-proposal.md](improvement-proposal.md) 参照

## 注意点

- **専用ファイル原則**: 自分の報告ファイルのみ更新
- **タイムスタンプ**: 必ず `date -Iseconds` で取得
- **ステータス更新後**: 報告書は自動で `.maid-agent/master/reports/` にアーカイブされる

## 事例

### 事例1: コードレビュー完了

```markdown
# 作業報告 - エマ

## タスク情報
- task_id: task-001-1
- title: src/extension.ts レビュー
- description: 拡張機能のエントリポイントをレビュー
- status: completed
- completed_at: 2026-02-14T10:30:00+09:00

## 作業内容
- src/extension.ts を読み、コード品質を確認
- 改善点を3件発見（エラーハンドリング、命名規則、コメント不足）

## 変更ファイル
- なし（レビューのみ）

## 問題・注意点
特になし

## 切り出し確認
extraction_check:
  required: false
  extracted_to: ""

## スキル化候補
skill_candidate:
  found: false

## 改善提案
improvement_proposal:
  found: false
```
