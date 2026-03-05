# Simple Goal 実例パターン

## 概要

Phase省略が可能な小規模タスク（Simple Goal）の運用パターン。
typo修正、設定変更、調査のみなど、1-2時間で完了する軽微な作業に適用。

## 適用条件

- 作業が1-2時間で完了する
- Phaseに分割する必要がない
- 成果物が単純（1ファイル修正、1つの調査レポートなど）

## 定義

| 規模 | Phase数 | 報告書 | ユースケース |
|------|---------|--------|-------------|
| **simple** | **0-1** | **Goal直下に記載** | **typo修正、設定変更、調査のみ** |
| standard | 2-4 | Phase単位 | 機能追加、バグ修正 |
| complex | 5+ | Phase単位 | 大規模リファクタリング |

## 運用ルール

1. **Phase省略**: Goal直下にActionを作成可能
2. **報告書**: Goal直下に作業内容を記載
3. **クローズ**: 手動クローズ（自動クローズ対象外）

## CLI例

### Simple Goal作成

```bash
# Simple Goalを作成
maidctl task create --type goal --title "README.md の typo 修正" --size simple
→ #311 作成

# 直接Actionを作成（Phaseなし）
maidctl task create --parent 311 --type action --title "typo修正"
→ #311-1 作成
```

## 実例3パターン

### パターン1: typo修正

```yaml
- id: "311"
  title: "README.md の typo 修正"
  type: "goal"
  size: "simple"
  children:
    - id: "311-1"
      type: "action"
      title: "typo修正"
```

**フロー**:
```
1. 執事: Simple Goal #311 作成
2. メイド長: Action #311-1 作成、メイドに割当
3. メイド: typo修正、完了報告
4. 執事: Goal #311 クローズ
```

**報告書**: Goal直下に作業内容を記載（Phase報告書なし）

### パターン2: 設定変更

```yaml
- id: "312"
  title: "ポート番号変更"
  type: "goal"
  size: "simple"
  children:
    - id: "312-1"
      type: "action"
      title: "config.yaml 更新"
```

**フロー**:
```
1. 執事: Simple Goal #312 作成
2. メイド長: Action #312-1 作成、メイドに割当
3. メイド: config.yaml 更新、完了報告
4. 執事: Goal #312 クローズ
```

### パターン3: 調査のみ（Tentative → クローズ）

```yaml
- id: "313"
  title: "ライブラリ調査"
  type: "goal"
  size: "simple"
  tentative: true
  children:
    - id: "313-1"
      type: "investigation"
      title: "候補ライブラリの比較調査"
```

**フロー**:
```
1. 執事: Tentative Goal #313 作成（--tentative）
2. メイド長: Investigation #313-1 作成、メイドに割当
3. メイド: 調査実行、報告書作成
4. 執事: 調査結果レビュー → 現時点では実装不要
5. メイド長: 調査結果を docs/research/xxx.md に昇格
6. 執事: Goal #313 クローズ
```

**成果物**: docs/research/xxx.md に昇格してGoalクローズ

## Simple Goal vs Standard Goal の判断

| 観点 | Simple | Standard |
|------|--------|----------|
| 作業時間 | 1-2時間 | 半日以上 |
| 成果物数 | 1つ | 複数 |
| 関与メイド | 1人 | 複数人 |
| レビュー | 軽微 | 正式レビュー必要 |

**迷った場合は Standard を選択**（後から Simple に変更可能）

## 注意事項

- Simple Goalは**自動クローズ対象外**（レビューPhaseがないため）
- 執事が手動でクローズ判断を行う
- 軽微な作業でも、関連Goalがあれば統合を検討

## 関連パターン

- [goal-phase-decomposition.md](goal-phase-decomposition.md) - Standard/Complex Goal分解
- [tentative-goal.md](tentative-goal.md) - 調査のみGoal
- [goal-auto-close.md](goal-auto-close.md) - 自動クローズ条件
