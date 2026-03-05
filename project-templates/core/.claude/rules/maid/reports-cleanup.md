---
name: reports-cleanup
description: タスク完了時の reports クリーンアップ手順
auto_select: true
target_roles: [maid]
---

# Reports クリーンアップルール

## 概要

タスク完了時、reports/{name}.md の内容を確認し、永続的な価値のある成果物を docs/ に切り出す。
これにより、reports/ を軽量に保ち、トークン消費を最適化する。

## ルール内容

### 必須事項

1. **タスク完了時に切り出し判断を行う**
   - 報告作成後、ステータス更新前に判断
   - 切り出し対象があれば docs/ にコピー

2. **報告形式に extraction_check を含める**
   ```yaml
   ## 切り出し確認
   extraction_check:
     required: false  # true/false
     extracted_to: ""  # required: true の場合: docs/maid-agent/research/xxx.md
   ```

3. **切り出し対象の判断基準**

   | 切り出し対象 | 保存先 | 例 |
   |-------------|--------|-----|
   | 技術調査結果（1000文字以上） | `docs/maid-agent/research/` | MCP仕様調査、API調査 |
   | 手順・ガイド | `docs/maid-agent/guides/` | セットアップ手順 |
   | 設計・決定事項 | `docs/maid-agent/decisions/` | アーキテクチャ決定 |
   | インシデント・問題記録 | `docs/maid-agent/issues/` | エラー事例と対処 |
   | 改善提案（承認済み） | `docs/maid-agent/proposals/` | ルール追加提案 |
   | 過去タスク履歴 | `docs/archive/` | 完了タスクの記録 |

4. **切り出し後の reports/ 処理**
   - 切り出した内容は参照リンクに置換
   - 例: `詳細は docs/maid-agent/research/mcp-specification.md を参照`

### 推奨事項

1. **報告書サイズの目安**
   - 2KB 以下を目安に保つ
   - 大きい場合は切り出しを検討

2. **命名規則**

   | 保存先 | 命名パターン | 例 |
   |--------|-------------|-----|
   | `docs/maid-agent/research/` | `{内容}.md` | `mcp-specification.md` |
   | `docs/maid-agent/guides/` | `{内容}.md` | `gmail-integration.md` |
   | `docs/maid-agent/decisions/` | `{内容}.md` | `improvement-proposal-system.md` |
   | `docs/maid-agent/issues/` | `{日付}-{内容}.md` | `2026-01-30-file-conflict.md` |
   | `docs/maid-agent/proposals/` | `{内容}.md` | `reports-cleanup-rule.md` |
   | `docs/archive/dashboard/` | `archive-task-{範囲}.md` | `archive-task-001-013.md` |

3. **メイド長への報告時に切り出し先を含める**
   ```
   タスク完了しました。詳細は reports/alice.md をご確認ください。
   調査結果は docs/maid-agent/research/xxx.md に切り出しました。
   ```

### 禁止事項

1. **切り出し判断をスキップしない**
   - 必ず判断を行い、extraction_check に記録する

2. **reports/ に過去タスクを蓄積しない**
   - 1タスク分の報告のみ保持
   - 次タスク開始時に上書き

3. **同一内容を複数箇所に保持しない**
   - 切り出し後は reports/ から詳細を削除
   - 参照リンクのみ残す

---

## 切り出しフロー

```
┌────────────────────────────────────────────────────────────┐
│                  タスク完了時の手順                          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  1. タスクを完了                                            │
│       │                                                     │
│       ▼                                                     │
│  2. reports/{name}.md に報告作成                            │
│       │                                                     │
│       ▼                                                     │
│  3. 【切り出し判断】★このルールの対象★                      │
│       │                                                     │
│       ├─▶ 切り出し対象あり?                                │
│       │      │                                              │
│       │      ├─ YES → docs/ にコピー                       │
│       │      │        → reports/ は参照リンクに置換        │
│       │      │        → extraction_check: required: true   │
│       │      │                                              │
│       │      └─ NO  → extraction_check: required: false    │
│       │                                                     │
│       ▼                                                     │
│  4. ステータスを completed に更新                           │
│       │                                                     │
│       ▼                                                     │
│  5. メイド長に maidctl notify で通知                        │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## 判断フローチャート

```
reports/ の内容を確認
       │
       ▼
┌─────────────────────────────────────┐
│ 技術調査・設計・手順を含むか？      │
│ （1000文字以上の詳細な内容）        │
└────────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
   YES               NO
    │                 │
    ▼                 ▼
docs/maid-agent/  ┌────────────────────┐
research/guides/  │ インシデント記録か？│
decisions/へ      └─────────┬──────────┘
へ切り出し               │
              ┌──────────┴──────────┐
              │                     │
             YES                   NO
              │                     │
              ▼                     ▼
         docs/maid-agent/issues/      切り出し不要
         へ切り出し           (extraction_check:
                               required: false)
```

---

## 切り出し不要な内容

以下は切り出し不要（reports/ に残すか、次タスクで上書き）:

| 内容 | 理由 |
|------|------|
| 一時的なタスク報告 | 永続的な価値がない（例: 「愛の言葉」） |
| 重複情報 | 既に docs/ に存在する |
| コンテキスト依存情報 | 特定セッションでのみ有効 |
| 短い報告（1000文字未満） | 切り出すほどの内容がない |

---

## docs/ フォルダ構造

```
docs/
├── archive/              # 過去タスク・ダッシュボード履歴
│   ├── dashboard/        # ダッシュボード履歴
│   └── reports/          # 切り出した報告書
│
├── guides/               # 手順書・ガイド
│   ├── setup/            # セットアップ手順
│   └── usage/            # 使用方法
│
├── decisions/            # 技術的決定・合議結果
│
├── incidents/            # インシデント記録
│
├── proposals/            # 改善提案（承認済み）
│
├── research/             # 調査レポート
│
└── skills/               # スキル関連ドキュメント
```

---

## 報告形式（extraction_check セクション）

reports/{name}.md に以下のセクションを追加:

```markdown
## 切り出し確認
extraction_check:
  required: false  # true: 切り出しを行った / false: 切り出し不要
  extracted_to: ""  # required: true の場合、切り出し先パス
```

### 記入例

**切り出しを行った場合**:
```yaml
extraction_check:
  required: true
  extracted_to: "docs/maid-agent/research/mcp-memory-specification.md"
```

**切り出し不要の場合**:
```yaml
extraction_check:
  required: false
  extracted_to: ""
```

---

## 参考

- task-020-A, task-020-B: 切り出し基準とdocs構造案
- task-021-A, task-021-B: 記載場所・形式と呼び出しやすさの検討
