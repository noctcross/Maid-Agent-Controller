# resources ディレクトリ記述ガイドライン

## 概要

スキルの `resources/` ディレクトリは、SKILL.md から参照される補助ファイルを格納する場所。
プログレッシブディスクロージャー設計により、必要な時だけロードされ、コンテキストを節約できる。

---

## 公式ベストプラクティス

### プログレッシブディスクロージャー

Claude Code のスキルシステムは3段階でコンテンツをロードする:

| 段階 | タイミング | ロード内容 | トークン消費 |
|------|-----------|-----------|-------------|
| 1. Metadata | 起動時 | name, description のみ | ~100トークン/スキル |
| 2. SKILL.md | スキル使用時 | SKILL.md body | 変動（500行以下推奨） |
| 3. Resources | 必要時のみ | 参照ファイル | オンデマンド |

**設計原則**: 参照ファイルは「使われるまでトークン消費ゼロ」

---

## ディレクトリ構造

### 推奨構造

```
skill-name/
├── SKILL.md              # メイン（500行以下）
└── resources/
    ├── patterns/         # 運用パターン集
    │   ├── pattern-a.md
    │   └── pattern-b.md
    ├── reference/        # API/CLI リファレンス
    │   └── api.md
    └── examples/         # 使用例
        └── examples.md
```

### ドメイン別構成（大規模スキル向け）

```
bigquery-skill/
├── SKILL.md
└── resources/
    └── reference/
        ├── finance.md    # 財務系メトリクス
        ├── sales.md      # 営業系データ
        └── product.md    # プロダクト分析
```

**利点**: ユーザーが財務について質問した場合、`finance.md` のみロードされる。

---

## ファイルサイズ上限

| ファイル種別 | 推奨上限 | 理由 |
|-------------|---------|------|
| SKILL.md body | 500行以下 | 公式推奨。超える場合は分割必須 |
| 単一パターン/リファレンス | 200行以下 | 読みやすさ、部分ロード効率 |
| 全 resources 合計 | 制限なし | オンデマンドなので無制限可 |

**100行超えの場合**: ファイル先頭に目次を含めること（Claude が部分読みする際に全体像を把握できる）。

---

## 参照の深さルール

### 1レベル深さまで（MUST）

Claude は SKILL.md から1レベルの参照のみ完全に読む。
2レベル以上の参照は `head -100` で部分読みされる可能性がある。

```markdown
# 良い例: 1レベル

## SKILL.md
See [patterns/task-workflow.md](resources/patterns/task-workflow.md)

## patterns/task-workflow.md
（詳細な内容）
```

```markdown
# 悪い例: 2レベル以上

## SKILL.md
See [advanced.md](resources/advanced.md)

## resources/advanced.md
See [details.md](details.md)  # ← ここでネスト

## resources/details.md
（実際の情報）  # ← Claude が部分読みする可能性
```

---

## SKILL.md からの参照方法

### パターン1: テーブルによる一覧

```markdown
## Patterns

| パターン | 用途 |
|---------|------|
| [task-workflow](resources/patterns/task-workflow.md) | タスク受領〜完了の基本フロー |
| [report-format](resources/patterns/report-format.md) | 報告書テンプレート・記載ルール |
| [blocked-handling](resources/patterns/blocked-handling.md) | ブロック時の対応フロー |
```

### パターン2: セクション内リンク

```markdown
## Advanced Features

**Form filling**: See [FORMS.md](resources/FORMS.md) for complete guide
**API reference**: See [REFERENCE.md](resources/reference/api.md) for all methods
```

### パターン3: 条件付きリンク

```markdown
## Document Editing

For simple edits, modify the XML directly.

**For tracked changes**: See [REDLINING.md](resources/REDLINING.md)
**For OOXML details**: See [OOXML.md](resources/OOXML.md)
```

---

## 命名規則

### ファイル名

| パターン | 例 | 用途 |
|---------|-----|------|
| `{機能名}.md` | `task-workflow.md` | 一般的なパターン |
| `{動詞}-{名詞}.md` | `blocked-handling.md` | 動作を示すパターン |
| `{カテゴリ}.md` | `security.md` | リファレンス系 |

### 禁止

- `doc1.md`, `file2.md` など意味のない名前
- 日本語ファイル名（環境依存）
- スペースを含む名前

---

## パターンファイル構造

詳細は [pattern-template.md](pattern-template.md) を参照。

### 基本セクション構成

1. **概要** - パターンの目的（1-2文）
2. **適用条件** - いつこのパターンを使うか
3. **手順/テンプレート** - 具体的な内容
4. **注意点** - 守るべきルール
5. **事例** - 実際の使用例

---

## チェックリスト

resources ファイルを作成したら確認:

- [ ] ファイル名が機能を表しているか
- [ ] 200行以下か（超える場合は分割検討）
- [ ] 100行超えの場合、目次があるか
- [ ] SKILL.md から1レベルで参照されているか
- [ ] 適用条件が明記されているか
- [ ] 事例が含まれているか

---

## 参考

- [Skill authoring best practices - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Skills overview - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [GitHub - anthropics/skills](https://github.com/anthropics/skills)
