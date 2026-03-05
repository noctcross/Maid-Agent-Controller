# 作業報告 - {{MAID_NAME}}

## タスク情報
<!-- 自動生成: 編集禁止 -->
- task_id: {{TASK_ID}}
- title: {{TITLE}}
- description: {{DESCRIPTION}}
<!-- /自動生成 -->
- status: (作業中)
- completed_at:

## 作業内容
<!-- ここから編集してください -->


## 変更ファイル


## 問題・注意点


## エスカレーション
escalation:
  required: false
  # required: true の場合は以下を記載
  # title: ""         # エスカレーション件名
  # detail: ""        # 詳細・背景（「問題・注意点」と重複する場合は参照でも可）

## 切り出し確認
extraction_check:
  required: false
  extracted_to: ""

## スキル化候補
skill_candidate:
  found: false
  # found: true の場合は以下を記載
  # type: ""           # "new_skill" または "pattern_add"
  # target_skill: ""   # pattern_add の場合: 親スキル名（例: debugging, code-review）
  # name: ""           # スキル/パターン名（例: api-endpoint-creator, memory-leak-detector）
  # description: ""    # スキル/パターンの説明
  # reason: ""         # なぜスキル化/パターン追加すべきか

## 改善提案
improvement_proposal:
  found: false
  # found: true の場合は以下を記載
  # category: ""       # process | rule | tool | other
  # target: ""         # common | butler | chief | maid
  # title: ""          # 提案タイトル
  # problem: ""        # 現状の問題点
  # proposal: ""       # 改善案
  # benefit: ""        # 期待される効果
