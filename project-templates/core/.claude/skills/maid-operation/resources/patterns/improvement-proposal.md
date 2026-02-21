# Improvement Proposal - 改善提案の記載方法

## 目次

- [概要](#概要)
- [適用条件](#適用条件)
- [カテゴリ（category）](#カテゴリcategory)
- [対象（target）](#対象target)
- [報告形式](#報告形式)
- [フロー](#フロー)
- [注意点](#注意点)
- [良い提案の書き方](#良い提案の書き方)
- [事例](#事例)

## 概要

作業中にルールやフローの問題点に気づいた場合、改善提案として報告する方法。
メイドは提案を**報告のみ**し、自分で改善を実施してはいけない。

## 適用条件

- 作業フローに非効率な点を発見した
- ルールや指示に曖昧な点を見つけた
- ツールやコマンドに改善の余地がある
- ドキュメントの不足や誤りを発見した

## カテゴリ（category）

| カテゴリ | 説明 | 例 |
|---------|------|-----|
| process | 作業フローの改善 | 報告タイミングの見直し |
| rule | ルール・指示の改善 | 曖昧な指示の明確化 |
| tool | ツール・コマンドの改善 | maidctl notify の機能追加 |
| other | その他の改善 | ドキュメントの追加 |

## 対象（target）

| 値 | 適用先 |
|----|-------|
| common | 全員（CLAUDE.md、共通ルール） |
| butler | 執事のみ |
| chief | メイド長のみ |
| maid | メイドのみ |

## 報告形式

### 改善提案ありの場合

```yaml
improvement_proposal:
  found: true
  category: "rule"
  target: "maid"
  title: "タスク完了条件の明確化"
  problem: "完了の判断基準が曖昧でメイド長への報告タイミングが分かりにくい"
  proposal: "報告すべき完了基準をチェックリスト化する"
  benefit: "報告漏れの削減、品質の安定化"
```

### 改善提案なしの場合

```yaml
improvement_proposal:
  found: false
```

**found は必須**（false でも明示的に記載）

## フロー

```
1. メイドが改善点を発見
    ↓
2. 報告書の improvement_proposal セクションに記載
    ↓
3. maidctl my-status completed で完了報告
    ↓
4. メイド長が集約
    ↓
5. 💡 改善提案タスクとしてご主人様向けに作成
    ↓
6. ご主人様が承認
    ↓
7. 改善を実施
```

## 注意点

- **改善を自分で実施してはいけない**
- 提案を発見したらメイド長に報告のみ
- メイド長がご主人様向けタスク（💡改善提案）を作成 → 承認を経て実施

## 良い提案の書き方

### problem（現状の問題点）

- 具体的に何が問題か
- いつ、どのような状況で発生するか
- 影響範囲はどの程度か

### proposal（改善案）

- 具体的な改善方法
- 実現可能な提案
- 必要なリソース（あれば）

### benefit（期待される効果）

- 改善後に得られるメリット
- 定量的な効果（あれば）

## 事例

### 事例1: プロセス改善

```yaml
improvement_proposal:
  found: true
  category: "process"
  target: "maid"
  title: "スキル一覧の自動確認"
  problem: "タスク開始時にスキル一覧を確認し忘れることがある"
  proposal: "maidctl my-task の出力に関連スキルを表示する機能を追加"
  benefit: "スキル活用率の向上、作業効率の改善"
```

### 事例2: ルール改善

```yaml
improvement_proposal:
  found: true
  category: "rule"
  target: "common"
  title: "コミットメッセージ規約の明確化"
  problem: "コミットメッセージの形式がメイドによってバラバラ"
  proposal: "Conventional Commits形式を採用し、テンプレートを提供"
  benefit: "変更履歴の可読性向上、自動リリースノート生成の可能性"
```

### 事例3: ツール改善

```yaml
improvement_proposal:
  found: true
  category: "tool"
  target: "maid"
  title: "maidctl my-status の --dry-run オプション"
  problem: "ステータス更新前に影響範囲を確認したい場合がある"
  proposal: "maidctl my-status completed --dry-run で事前確認可能に"
  benefit: "誤操作の防止、安心感のある操作"
```
