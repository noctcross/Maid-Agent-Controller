# Tentative Task 運用パターン

## 概要

目標が不明確な「とりあえず調べて」型の指示に対応するためのパターン。
調査結果に基づき、Taskを再定義またはクローズする。

## 適用条件

- ご主人様から曖昧な調査指示を受けた時
- 「とりあえず調べて」「可能性を探って」等の指示
- 実装するかどうかが調査結果次第の時

## Tentative Task とは

目標が不明確な状態で開始するTask。調査結果に基づき再定義またはクローズする。

```yaml
- id: "310"
  title: "MCPの新機能を調査"
  type: "task"
  tentative: true       # ★暫定Task
  size: "simple"        # 初期はsimple
```

## 運用フロー

```
┌─────────────────────────────────────────────────────────────┐
│  Tentative Task フロー                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 執事: Tentative Task 作成                                 │
│      maidctl task create --type task --tentative --title "..."│
│      │                                                       │
│      ▼                                                       │
│  2. Investigation Work 作成・実行                             │
│      maidctl task create --parent {id} --type investigation  │
│      │                                                       │
│      ▼                                                       │
│  3. メイドが調査実行、報告書作成                              │
│      │                                                       │
│      ▼                                                       │
│  4. 執事が調査結果をレビュー、判断                            │
│      │                                                       │
│      ├── 実装価値あり → Task再定義（tentative: false）        │
│      │   └── 追加Workを作成して続行                          │
│      │                                                       │
│      ├── 実装不要 → Taskクローズ（size: simple維持）          │
│      │   └── 調査結果をdocs/昇格して完了                     │
│      │                                                       │
│      └── 別Taskに統合 → 現Taskクローズ                       │
│          └── 調査結果を別Taskに引き継ぎ                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## CLI例

### Tentative Task 作成

```bash
# Tentative Taskを作成
maidctl task create --type task --tentative --title "MCPの新機能調査"
→ #310 作成
```

### Investigation作成

```bash
# 調査タスクを作成（メイド長に委譲）
maidctl task create --parent 310 --type investigation --title "MCP新機能の仕様調査"
→ #310-1 作成
```

### 調査結果に基づく判断

```bash
# パターンA: 実装価値あり → Task再定義、Work追加
maidctl task update 310 --tentative false
maidctl task create --parent 310 --type work --title "設計"
maidctl task create --parent 310 --type work --title "実装"

# パターンB: 調査のみで完了 → Taskクローズ
maidctl task update 310 --status closed
# 調査結果は docs/research/ に昇格

# パターンC: 別Taskに統合 → 現Taskクローズ
maidctl task update 310 --status closed
# 調査結果を別Task（例: #305）に引き継ぎ
```

## 実例

### ケース1: 実装に進む場合

```
【ご主人様】「MCPの新しいツール機能について調べて」

【執事】
$ maidctl task create --type task --tentative --title "MCP新機能調査"
→ #310 作成
$ maidctl notify chief "Tentative Task #310 を作成しました。調査をお願いします。"

【メイド長】→ Investigation作成、メイドに割当
【メイド】調査実行、docs/research/mcp-tools.md 作成

【執事】調査結果レビュー → 実装価値あり
$ maidctl task update 310 --tentative false
$ maidctl task create --parent 310 --type work --title "設計"
$ maidctl task create --parent 310 --type work --title "実装"
$ maidctl notify chief "#310 を通常Taskに昇格しました。設計・実装Workを追加。"
```

### ケース2: 調査のみで完了

```
【ご主人様】「競合サービスを調べて」

【執事】
$ maidctl task create --type task --tentative --title "競合調査"
→ #315 作成

【メイド】調査実行、報告書作成

【執事】調査結果レビュー → 現時点では対応不要
$ maidctl task update 315 --status closed
「調査結果は docs/research/competitors.md に保存しました。」
```

## 判断基準

| 調査結果 | 判断 | アクション |
|----------|------|-----------|
| 明確な実装価値あり | Task再定義 | tentative: false、Work追加 |
| 判断保留（情報不足） | 追加調査 | Investigation追加 |
| 実装不要 | Taskクローズ | docs/昇格して完了 |
| 別Taskで対応すべき | 統合 | 現Taskクローズ、結果を引き継ぎ |

## 注意事項

- Tentative Taskは自動クローズ対象外（手動判断が必要）
- 調査結果のdocs/昇格はメイド長に依頼
- 再定義後は通常のTask運用に移行

## 関連パターン

- [task-work-decomposition.md](task-work-decomposition.md) - 通常Task分解
- [simple-task-patterns.md](simple-task-patterns.md) - 調査のみで完了するケース
