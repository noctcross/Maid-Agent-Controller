# Report Collection - 報告収集・確認

## 目次

- [概要](#概要)
- [適用条件](#適用条件)
- [手順](#手順)
- [親タスククローズルール](#親タスククローズルール)
- [注意点](#注意点)
- [事例](#事例)

## 概要

メイドの完了報告を収集し、タスク状態を更新する手順。

## 適用条件

- メイドから完了通知を受けた時
- `maidctl team status` でcompleted状態のメイドを検知した時

## 手順

### 1. 報告確認

```bash
# 報告書の場所
.maid-agent/system/data/reports/current_{メイドID}.md

# 例: アリスの報告
cat .maid-agent/system/data/reports/current_alice.md
```

**確認項目**:
- 作業内容（期待通りか）
- 変更ファイル一覧
- 問題・注意点
- スキル化候補（`skill_candidate` セクション）
- 改善提案（`improvement_proposal` セクション）

### 2. 品質確認

| 確認観点 | 基準 |
|---------|------|
| 作業完了度 | 指示した内容が完了しているか |
| 品質 | 期待水準を満たしているか |
| 副作用 | 予期しない変更がないか |

### 3. タスク状態更新

```bash
# 完了の場合
maidctl task update TASK_ID --status completed --summary "完了サマリー"

# 追加作業が必要な場合
maidctl task create --parent TASK_ID --title "追加作業"
maidctl task assign {サブID} --to {メイド} --title "追加作業"
maidctl notify {メイド} "追加作業があります"
```

### 4. スキル候補・改善提案の確認

報告書内の以下のセクションを確認:

```yaml
skill_candidate:
  found: true/false
  type: "new_skill" / "pattern_add"
  target_skill: "debugging"  # pattern_addの場合
  description: "..."

improvement_proposal:
  found: true/false
  description: "..."
```

→ 詳細は [skill-aggregation.md](skill-aggregation.md)、[action-required.md](action-required.md) 参照

## 親タスククローズルール

サブタスクが完了したら、親タスクも適切にクローズする。

### 通常タスクの場合

```bash
# 全サブタスク完了を確認
maidctl task get PARENT_ID --include-subtasks

# 親タスクをクローズ
maidctl task update PARENT_ID --status completed --summary "全サブタスク完了"
```

### 提案タスク（📚/💡）の場合

category が `skill_candidate` または `improvement` のタスク:

```bash
# サブタスク完了後、親もクローズ
maidctl task update 123 --status completed --summary "サブタスク完了によりクローズ"
```

**理由**: 親タスクが pending/assigned のまま残ると、ダッシュボードで未処理として表示され続ける

## 注意点

- 執事への通知は禁止（CF002）。タスク状態を更新して待機
- スキル候補・改善提案は必ず確認（見落とし防止）
- 確認待ちの場合は `--category action_required` を設定

## 事例

### 完了報告の確認からクローズまで

```bash
# 1. 報告確認
cat .maid-agent/system/data/reports/current_emma.md

# 2. 内容が期待通りであることを確認

# 3. タスククローズ
maidctl task update 077 --status completed --summary "設計書作成完了"

# 4. 親タスクがあれば確認
maidctl task get 077  # parentId確認
maidctl task list --parent 077  # 他のサブタスク確認

# 5. 全サブタスク完了なら親もクローズ
maidctl task update 077 --status completed
```
