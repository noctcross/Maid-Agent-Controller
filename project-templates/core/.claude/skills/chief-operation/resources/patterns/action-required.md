# Action Required - ご主人様向けタスク作成

## 目次

- [概要](#概要)
- [適用条件](#適用条件)
- [手順](#手順)
- [改善提案フロー](#改善提案フロー)
- [完了タスクの確認待ち設定](#完了タスクの確認待ち設定)
- [注意点](#注意点)
- [事例](#事例)

## 概要

ご主人様の判断・承認が必要な事項をタスクとして作成する手順。

## 適用条件

メイド長が `maidctl task create` を使用できるケース:

| カテゴリ | 説明 | オプション |
|---------|------|----------|
| 🚨 要対応 | ご主人様の判断が必要 | `--action-required` |
| 📚 スキル化候補 | メイドから集約した候補 | `--category skill_candidate` |
| 💡 改善提案 | メイドから集約した提案 | `--category improvement` |
| エスカレーション派生 | 相談で新規タスクが必要 | `--category task` |

## 手順

### 🚨 要対応タスクの作成

技術的判断、方針決定、ブロッキングイシュー:

```bash
maidctl task create \
  --title "API設計のアプローチについて判断が必要" \
  --description "詳細は current_emma.md を参照。REST vs GraphQL の選択。" \
  --priority high \
  --action-required
```

### 📚 スキル化候補の作成

→ 詳細は [skill-aggregation.md](skill-aggregation.md) 参照

```bash
maidctl task create \
  --title "[スキル名] - スキル化候補" \
  --description "詳細説明..." \
  --priority low \
  --category skill_candidate
```

### 💡 改善提案の作成

メイドの報告書から `improvement_proposal` を確認・集約:

```yaml
improvement_proposal:
  found: true
  description: "タスク配分時にメイドの得意分野を自動提案する機能"
  benefit: "配分の効率化"
```

```bash
maidctl task create \
  --title "[提案名] - 改善提案" \
  --description "詳細説明..." \
  --priority low \
  --category improvement
```

## 改善提案フロー

```
メイドが提案発見
    ↓ .maid-agent/system/data/reports/current_{name}.md に記載
メイド長が集約（このパターン）
    ↓ task create でご主人様向けタスク作成
ご主人様が承認
    ↓
該当の agents/instructions/ を更新
または agents/rules/ にモジュール追加
```

## 完了タスクの確認待ち設定

メイドの完了報告を確認し、ご主人様の確認が必要と判断した場合:

```bash
maidctl task update TASK_ID --action-required
# ※ status は completed のまま
# → ダッシュボードの「⚠️ 対応待ち → 確認待ち」に表示
```

## 注意点

- **重要**: 改善の実施はご主人様の承認後のみ
- メイド長が自分で判断・実施してはいけない（CF001）
- 提案の見落とし防止のため、報告収集時に必ずチェック

## 事例

### 技術的判断が必要なケース

```bash
# エマがblocked、REST vs GraphQL の選択で止まっている

maidctl task create \
  --title "API設計: REST vs GraphQL の選択" \
  --description "エマの設計タスク(#077)がブロック中。current_emma.md に比較表あり。判断をお願いします。" \
  --priority high \
  --action-required

# 元タスクも要対応に更新
maidctl task update 077 --action-required --substatus "ご主人様判断待ち"
```

### 改善提案の集約

```bash
# 複数メイドから同様の提案
# エマ: コードレビューチェックリストの標準化
# ソフィア: レビュー観点のドキュメント化
# → 統合して1つの提案に

maidctl task create \
  --title "コードレビュープロセスの標準化 - 改善提案" \
  --description "複数メイドから提案あり。チェックリスト作成とドキュメント化を実施。提案者: エマ、ソフィア" \
  --priority low \
  --category improvement
```

### エスカレーション派生タスク

```bash
# アリスの相談から新規調査タスクが必要に

maidctl task create \
  --title "認証方式の調査" \
  --description "アリスのタスク(#080)派生。OAuth vs JWT の比較調査。" \
  --priority medium

maidctl task assign {ID} --to sophia --title "認証方式調査"
maidctl notify sophia "新しい調査タスクがあります"
```
