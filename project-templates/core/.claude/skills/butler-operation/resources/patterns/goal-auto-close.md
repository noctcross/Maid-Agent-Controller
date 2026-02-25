# Goal自動クローズ判断パターン

## 概要

Goal完了判定の基準と、自動クローズ/手動クローズの判断フロー。
V2.1で導入された自動クローズ機能により、条件を満たすGoalは自動的にクローズされる。

## 適用条件

- 全Phaseが完了した時
- Goal完了の判断が必要な時

## 自動クローズ条件

```yaml
auto_close:
  goal:
    conditions:
      - all_phases_completed: true
      - has_review_phase: true    # レビューPhaseが存在する場合
      - review_approved: true     # レビュー承認済み
    exclude_categories:
      - skill_candidate           # スキル候補あり → 手動クローズ
      - improvement               # 改善提案あり → 手動クローズ
      # --action-required フラグ付きタスクあり → 手動クローズ
```

## 自動 vs 手動の判断フロー

```
┌─────────────────────────────────────────────────────────────┐
│  Goal完了判定フロー                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  全Phase完了?                                                │
│      │                                                       │
│      ├── No → Goalは継続（未完了Phaseあり）                  │
│      │                                                       │
│      └── Yes                                                 │
│           │                                                  │
│           ▼                                                  │
│  レビューPhaseあり & 承認済み?                               │
│      │                                                       │
│      ├── No → 手動クローズ                                   │
│      │   └── 執事がレビュー後に判断                         │
│      │                                                       │
│      └── Yes                                                 │
│           │                                                  │
│           ▼                                                  │
│  除外カテゴリ/フラグあり?                                     │
│  (skill_candidate / improvement / --action-required)         │
│      │                                                       │
│      ├── Yes → 手動クローズ                                  │
│      │   └── 人間の判断が必要                               │
│      │                                                       │
│      └── No → 自動クローズ                                   │
│          └── システムが自動的にGoalをclosed                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 判断一覧

| 条件 | クローズ方法 | 理由 |
|------|-------------|------|
| 全Phase完了 + レビュー承認済み + 除外カテゴリなし | **自動** | 条件が明確 |
| 全Phase完了 + 除外カテゴリあり | **手動** | 人間の判断が必要 |
| simple Goal（Phase省略） | **手動** | レビューPhaseがないため |
| tentative Goal | **手動** | 再定義判断が必要 |

## 手動クローズが必要なケース

### 1. Simple Goal

- Phase省略のため、レビューPhaseが存在しない
- 執事が作業結果を確認してクローズ

```bash
# 作業完了確認後
maidctl task update 311 --status closed
```

### 2. Tentative Goal

- 調査結果に基づく判断が必要
- 再定義 or クローズを執事が決定

```bash
# 調査のみで完了の場合
maidctl task update 310 --status closed

# 実装に進む場合
maidctl task update 310 --tentative false
# → 通常Goalとして継続
```

### 3. 除外カテゴリあり

- skill_candidate: スキル化の検討が必要
- improvement: 改善提案の採否判断が必要
- --action-required フラグ: ご主人様対応待ち

```bash
# 除外カテゴリの対応完了後にクローズ
maidctl task update 320 --status closed
```

## レビュータイミング

| タイミング | 対象 | 実行者 |
|-----------|------|--------|
| Phase完了時 | Phase成果物 | メイド長 |
| Goal完了前 | Goal全体サマリー | 執事 or ご主人様 |
| 自動クローズ前 | 最終確認 | システム（条件チェック） |

## CLI例

### アーカイブ設定

自動/手動クローズ後、長期保存が必要な場合:
```bash
# 執事 or メイド長が設定
maidctl task update 100 --archived
```

**アーカイブ基準**:
| 基準 | アーカイブ |
|------|-----------|
| 参照価値あり | ✅ アーカイブ |
| 一時的なタスク | ❌ アーカイブ不要 |

### 自動クローズ確認

```bash
# Goal状態を確認
maidctl task get 100
→ status: open, all_phases_completed: true, review_approved: true
→ auto_close_eligible: true

# 自動クローズが実行される
# (システムが条件を満たしたGoalを自動的にclosed)
```

### 手動クローズ

```bash
# 手動でGoalをクローズ
maidctl task update 100 --status closed
```

## 除外カテゴリの処理

### skill_candidate がある場合

```
1. メイドがスキル候補を報告書に記載
2. メイド長がスキル候補を確認
3. 採用 → スキル作成タスクを別途作成
4. 不採用 → カテゴリを解除
5. 執事がGoalをクローズ
```

### improvement がある場合

```
1. メイドが改善提案を報告書に記載
2. 執事が改善提案を確認
3. 採用 → 改善タスクを別途作成
4. 不採用 → カテゴリを解除
5. 執事がGoalをクローズ
```

### action_required がある場合

```
1. メイドがご主人様判断待ちを報告
2. ご主人様が判断・対応
3. 対応完了 → カテゴリを解除
4. 執事がGoalをクローズ
```

## 注意事項

- 自動クローズは条件を満たした時点で即座に実行される
- 手動クローズ判断は執事の責務
- 除外カテゴリは対応完了後に解除すること

## 関連パターン

- [goal-phase-decomposition.md](goal-phase-decomposition.md) - Goal分解
- [simple-goal-patterns.md](simple-goal-patterns.md) - Simple Goal（手動クローズ）
- [tentative-goal.md](tentative-goal.md) - Tentative Goal（手動クローズ）
