# Skill Aggregation - スキル候補の集約

## 概要

メイドからのスキル化候補を確認・集約し、ご主人様向けタスクを作成する手順。

## 適用条件

- メイドの報告書に `skill_candidate: found: true` がある時
- 報告収集時のルーチンとして

## 手順

### 1. スキル候補の確認

各メイドの報告書から `skill_candidate` セクションを確認:

```yaml
skill_candidate:
  found: true
  type: "new_skill"  # または "pattern_add"
  target_skill: "debugging"  # pattern_addの場合のみ
  name: "mcp-server-diagnostics"
  description: "MCPサーバーの診断手順"
  reason: "2回以上同じ手順を実行"
```

### 2. タイプ判定

| タイプ | 条件 | 例 |
|-------|------|-----|
| `new_skill` | 既存ドメインスキルに該当しない | api-endpoint-creator |
| `pattern_add` | 上位スキルが既に存在 | debugging に mcp-server-diagnostics 追加 |

### 3. 重複・有効性チェック

| 確認項目 | 基準 |
|---------|------|
| 重複 | 既存スキルや他メイドの候補と重複していないか |
| 再利用性 | 他プロジェクトでも使えるか |
| 複雑性 | 手順や知識が必要か（単純すぎないか） |
| 価値 | スキル化することで明確なメリットがあるか |

### 4. 集約

複数メイドから同様の候補があれば統合:

```
エマ: MCPサーバー診断手順
アリス: MCPエラー復旧手順
→ 統合: mcp-recovery スキル
```

### 5. ご主人様向けタスク作成

```bash
# 新規スキルの場合
maidctl task create \
  --title "[mcp-recovery] - スキル化候補" \
  --description "MCPサーバーの診断・復旧手順をスキル化。提案者: エマ、アリス" \
  --priority low \
  --category skill_candidate

# パターン追加の場合
maidctl task create \
  --title "[security-review] - パターン追加（親: code-review）" \
  --description "code-reviewスキルにセキュリティレビューパターンを追加" \
  --priority low \
  --category skill_candidate
```

## スキル化フロー全体像

```
メイドが候補発見
    ↓ .maid-agent/system/data/reports/current_{name}.md に記載
    ↓ type: "new_skill" または "pattern_add"
    ↓ pattern_add の場合は target_skill も記載
メイド長が確認・集約（このパターン）
    ↓ task create でご主人様向けタスク作成
ご主人様が承認
    ↓
【新規スキル】.maid-agent/.claude/skills/{name}/ を作成（skill-creator使用）
【パターン追加】既存スキルの resources/patterns/ に追加
```

## 注意点

- **重要**: スキル/パターンの作成はご主人様の承認後のみ
- メイド長が自分でスキルを作成してはいけない（CF001）
- 候補の見落とし防止のため、報告収集時に必ずチェック

## 事例

### 新規スキル候補の報告

```bash
# エマの報告書に以下を発見
# skill_candidate:
#   found: true
#   type: "new_skill"
#   name: "api-endpoint-creator"
#   description: "REST APIエンドポイントの作成パターン"

# ご主人様向けタスク作成
maidctl task create \
  --title "[api-endpoint-creator] - スキル化候補" \
  --description "REST APIエンドポイント作成パターン。CRUD操作、バリデーション、エラーハンドリングを含む。提案者: エマ" \
  --priority low \
  --category skill_candidate

# → ダッシュボードの「📚 スキル化候補」に表示
```

### パターン追加候補の報告

```bash
# リリーの報告書に以下を発見
# skill_candidate:
#   found: true
#   type: "pattern_add"
#   target_skill: "debugging"
#   name: "memory-leak-detection"
#   description: "メモリリーク検出手順"

# ご主人様向けタスク作成
maidctl task create \
  --title "[memory-leak-detection] - パターン追加（親: debugging）" \
  --description "debuggingスキルにメモリリーク検出パターンを追加。提案者: リリー" \
  --priority low \
  --category skill_candidate
```
