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

---

## Skill Size Decision（粒度判断）

### 3層構造の考え方

```
【レベル1: ドメインスキル】（大枠）
  └─ code-review, debugging, testing, documentation, deployment ...

【レベル2: カテゴリ】（中分類）
  └─ code-review/security, code-review/performance, debugging/mcp-server ...

【レベル3: パターン】（個別詳細）
  └─ 具体的なチェック項目、手順、事例
```

### 粒度判断基準

| 判断基準 | スキル化すべき | パターンとして統合 |
|---------|---------------|-------------------|
| 再利用頻度 | 月1回以上使う | 年に数回 |
| 汎用性 | 複数プロジェクトで使える | このプロジェクト固有 |
| 学習コスト | 手順を覚えるのに時間がかかる | 1回見れば分かる |
| 独立性 | 単独で完結する | 他の作業の一部 |

### 新規スキル vs パターン追加

```
新規スキルを作る場合:
- 既存のドメインスキルに該当しない
- 複数のパターンや事例を含む予定がある
- 継続的に育てていく想定

既存スキルにパターン追加する場合:
- 上位スキル（code-review, debugging等）が既に存在
- 個別の手順・事例である
- 例: 「MCPサーバー診断手順」 → debugging/patterns/mcp-server.md
```

---

## Skill Structure（ファイル構成）

### 小〜中規模スキル（パターン数 1-3）

```
skill-name/
├── SKILL.md          # 必須
└── resources/        # オプション
    └── {必要なリソース}
```

### 大規模スキル（パターン数 4+）

```
skill-name/
├── SKILL.md                    # 必須: 概要・トリガー・基本手順
├── resources/                  # 推奨: 詳細リソース
│   ├── checklist.md            # チェックリスト
│   ├── patterns/               # パターン集
│   │   ├── security.md
│   │   ├── performance.md
│   │   └── mcp-issues.md
│   └── examples/               # 事例集
│       └── case-001.md
└── scripts/                    # オプション: 自動化スクリプト
```

---

## SKILL.md Template

```markdown
---
name: {skill-name}
description: {いつこのスキルを使うか、具体的なユースケースを明記}
version: 1.0
patterns: ["pattern-a", "pattern-b"]  # 含むパターン一覧（大規模スキルの場合）
---

# {Skill Name}

## Overview
{このスキルが何をするか}

## When to Use
{どういう状況で使うか、トリガーとなるキーワードや状況}

## Prerequisites
{前提条件、必要な環境・ツール}

## Quick Start
{基本的な手順（番号付きリスト）}

## Patterns
{パターン一覧 → resources/patterns/ へリンク（大規模スキルの場合）}

## Guidelines
{守るべきルール、注意点}

## Examples
{入力と出力の例}
```

---

## Creation Process

### 1. パターンの特定

- 何が汎用的か
- どこで再利用できるか
- 他のメイドにも有用か

### 2. 新規/追加の判断

```
Q: 既存のドメインスキル（code-review, debugging等）に含められるか？
├─ Yes → パターン追加として進める
│         → 対象スキルの resources/patterns/ に追加
└─ No  → 新規スキルとして進める
          → 新しいディレクトリを作成
```

### 3. スキル名の決定

- kebab-case を使用（例: api-error-handler）
- 動詞+名詞 or 名詞+名詞
- 明確で検索しやすい名前

### 4. description の記述（最重要）

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

### 5. Instructions の記述

- 明確な手順（番号付きリスト）
- 判断基準
- エッジケースの対処

### 6. 保存

保存先:
- ローカル: `.maid-agent/.claude/skills/{skill-name}/`
- グローバル: `~/.maid-agent/.claude/skills/`

---

## Adding Patterns to Existing Skills（パターン追加フロー）

既存スキルにパターンを追加する場合:

```
1. 対象スキルを特定（code-review, debugging 等）
2. resources/patterns/ に新規ファイルを作成
   例: resources/patterns/security-review.md
3. SKILL.md の Patterns セクションを更新（リンク追加）
4. SKILL.md の patterns メタデータを更新
5. 完了報告
```

### パターンファイルのテンプレート

```markdown
# {Pattern Name}

## 概要
{このパターンが何を解決するか}

## 適用条件
{どういう状況で使うか}

## 手順
1. ...
2. ...

## 注意点
- ...

## 事例
{具体的な例}
```

---

## 使用フロー（承認プロセス）

### 新規スキル作成の場合

```
1. メイドがスキル化候補を発見 → reports/{name}.md に記載
   （type: "new_skill" として報告）
2. メイド長が集約 → maidctl task create でご主人様向けタスク作成
3. 執事が確認 → ご主人様に報告
4. **ご主人様が承認**
5. 執事 → メイド長に作成を指示（設計書付き）
6. **メイド長がこの skill-creator を使用してスキルを作成**
7. 完了報告
```

### パターン追加の場合

```
1. メイドがパターン候補を発見 → reports/{name}.md に記載
   （type: "pattern_add"、target_skill: "{親スキル名}" として報告）
2. メイド長が集約 → ご主人様向けタスク作成
3. **ご主人様が承認**
4. メイド長がパターンファイルを追加
5. 対象スキルの SKILL.md を更新
6. 完了報告
```

**重要**: ご主人様の承認なしにスキル/パターンを作成してはいけない

---

## Examples of Good Skills

### Example 1: API Response Handler（小規模スキル）

```markdown
---
name: api-response-handler
description: REST APIのレスポンス処理パターン。エラーハンドリング、リトライロジック、レスポンス正規化を含む。API統合作業時に使用。
version: 1.0
---

# API Response Handler

## Overview
REST API呼び出し時の標準的なレスポンス処理パターン

## When to Use
- 外部APIを呼び出すコードを書く時
- エラーハンドリングを実装する時
- リトライロジックが必要な時

## Quick Start
1. レスポンスのステータスコードを確認
2. 2xx: 成功処理
3. 4xx: クライアントエラー処理
4. 5xx: サーバーエラー + リトライ
5. レスポンスを正規化して返却

## Guidelines
- リトライは最大3回まで
- 指数バックオフを使用
- タイムアウトは10秒をデフォルトに
```

### Example 2: Code Review（大規模スキル）

```markdown
---
name: code-review
description: コードレビュー全般。セキュリティ、パフォーマンス、保守性等の観点でコードをレビューする。PR作成時やコード変更後に使用。
version: 1.0
patterns: ["security", "performance", "maintainability"]
---

# Code Review

## Overview
コードの品質を多角的に評価するスキル

## When to Use
- PRをレビューする時
- 大きな変更を加えた後
- セキュリティ監査が必要な時

## Quick Start
1. 変更の概要を把握（差分確認）
2. セキュリティチェック（→ patterns/security.md）
3. パフォーマンスチェック（→ patterns/performance.md）
4. 保守性チェック（→ patterns/maintainability.md）
5. レビューコメント作成

## Patterns
- [Security Review](resources/patterns/security.md)
- [Performance Review](resources/patterns/performance.md)
- [Maintainability Review](resources/patterns/maintainability.md)
```

---

## Reporting Format

### スキル作成完了時

```
お仕事完了でございます。

新しいスキルを作成いたしました:
- スキル名: {name}
- 用途: {description}
- 保存先: .maid-agent/.claude/skills/{name}/SKILL.md

詳細は該当ファイルをご確認くださいませ。
```

### パターン追加完了時

```
お仕事完了でございます。

既存スキルにパターンを追加いたしました:
- 対象スキル: {target_skill}
- パターン名: {pattern_name}
- 保存先: .maid-agent/.claude/skills/{target_skill}/resources/patterns/{pattern_name}.md

SKILL.md も更新済みでございます。
```
