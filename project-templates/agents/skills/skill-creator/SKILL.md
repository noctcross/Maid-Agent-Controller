---
name: skill-creator
description: 汎用的な作業パターンを発見した際に、再利用可能なスキルを作成する。繰り返し使えるワークフロー、ベストプラクティス、ドメイン知識をスキル化する時に使用。
---

# Skill Creator - スキル作成ガイド

## Overview

作業中に発見した汎用的なパターンを、再利用可能なスキルとして保存する。
これにより、同じ作業を繰り返す際の品質と効率が向上する。

## When to Create a Skill

以下の条件を満たす場合、スキル化を検討:

1. **再利用性**: 他のプロジェクトでも使えるパターン
2. **複雑性**: 単純すぎず、手順や知識が必要なもの
3. **安定性**: 頻繁に変わらない手順やルール
4. **価値**: スキル化することで明確なメリットがある

## Skill Structure

生成するスキルは以下の構造に従う:

```
skill-name/
├── SKILL.md          # 必須
├── scripts/          # オプション（実行スクリプト）
└── resources/        # オプション（参照ファイル）
```

## SKILL.md Template

```markdown
---
name: {skill-name}
description: {いつこのスキルを使うか、具体的なユースケースを明記}
---

# {Skill Name}

## Overview
{このスキルが何をするか}

## When to Use
{どういう状況で使うか、トリガーとなるキーワードや状況}

## Prerequisites
{前提条件、必要な環境・ツール}

## Instructions
{具体的な手順}

## Examples
{入力と出力の例}

## Guidelines
{守るべきルール、注意点}
```

## Creation Process

### 1. パターンの特定

- 何が汎用的か
- どこで再利用できるか
- 他のメイドにも有用か

### 2. スキル名の決定

- kebab-case を使用（例: api-error-handler）
- 動詞+名詞 or 名詞+名詞
- 明確で検索しやすい名前

### 3. description の記述（最重要）

エージェントがいつこのスキルを使うか判断する材料になる。

**悪い例:**
```
description: ドキュメント処理スキル
```

**良い例:**
```
description: PDFからテーブルを抽出しCSVに変換する。データ分析ワークフローで使用。
```

ポイント:
- 具体的なユースケース
- 対象ファイルタイプ
- アクション動詞を含める

### 4. Instructions の記述

- 明確な手順（番号付きリスト）
- 判断基準
- エッジケースの対処

### 5. 保存

保存先:
- ローカル: `.maid-agent/skills/{skill-name}/`
- グローバル: `~/.claude/skills/maid-generated/`（将来対応）

## 使用フロー（承認プロセス）

```
1. メイドがスキル化候補を発見 → reports/{name}.md に記載
2. メイド長が集約 → create_task でご主人様向けタスク作成
3. 執事が確認 → ご主人様に報告
4. **ご主人様が承認**
5. 執事 → メイド長に作成を指示（設計書付き）
6. **メイド長がこの skill-creator を使用してスキルを作成**
7. 完了報告
```

**重要**: ご主人様の承認なしにスキルを作成してはいけない

## Examples of Good Skills

### Example 1: API Response Handler

```markdown
---
name: api-response-handler
description: REST APIのレスポンス処理パターン。エラーハンドリング、リトライロジック、レスポンス正規化を含む。API統合作業時に使用。
---

# API Response Handler

## Overview
REST API呼び出し時の標準的なレスポンス処理パターン

## When to Use
- 外部APIを呼び出すコードを書く時
- エラーハンドリングを実装する時
- リトライロジックが必要な時

## Instructions
1. レスポンスのステータスコードを確認
2. 2xx: 成功処理
3. 4xx: クライアントエラー処理
4. 5xx: サーバーエラー + リトライ
5. レスポンスを正規化して返却
```

### Example 2: Test Template Generator

```markdown
---
name: test-template-generator
description: ユニットテストのテンプレートを生成する。Jest/Mocha/pytest等のフレームワーク対応。新機能のテストを書く時に使用。
---

# Test Template Generator

## Overview
テストファイルの基本構造を生成

## When to Use
- 新しいモジュールのテストを書く時
- テストカバレッジを向上させる時

## Instructions
1. 対象モジュールのexportを分析
2. 各関数/クラスのテストケースを列挙
3. 正常系・異常系・境界値のテストを生成
```

## Reporting Format

スキル作成完了時は以下の形式で報告:

```
お仕事完了でございます♪

新しいスキルを作成いたしました:
- スキル名: {name}
- 用途: {description}
- 保存先: .maid-agent/skills/{name}/SKILL.md

詳細は該当ファイルをご確認くださいませ。
```
