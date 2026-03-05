# Investigation Promotion - Investigation 昇格判断

## 概要

V2.1で導入された Investigation タスクの docs/ 昇格判断フロー。
調査結果の永続保存（L3）が必要かを判断し、適切に昇格またはL2保持を決定する。

## 昇格フロー

```
┌─────────────────────────────────────────────────────────────┐
│  Investigation 昇格フロー                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  【メイド】Investigation 完了                                │
│      │                                                       │
│      └── 報告書に昇格推奨を記載                              │
│           promotion:                                         │
│             recommended: true                                │
│             path: "docs/research/xxx.md"                     │
│             reason: "理由"                                   │
│            │                                                 │
│            ▼                                                 │
│  【メイド長】レビュー時に判断                                │
│      │                                                       │
│      ├── 昇格承認 → docs/ にコピー、L3マーク                │
│      │                                                       │
│      └── 昇格不要 → L2のまま、Goal完了後30日で削除          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 昇格判断基準

### 昇格すべきケース

| 基準 | 説明 | 例 |
|------|------|-----|
| 汎用性 | 他タスクでも参照される | API仕様、ライブラリ調査 |
| 技術的価値 | 技術的な仕様・ノウハウ | エラー対処法、設定方法 |
| 設計根拠 | 設計決定の根拠になる | 技術選定理由、比較分析 |
| 再利用性 | 将来的に再参照する可能性が高い | セットアップ手順 |

### 昇格不要なケース

| 基準 | 説明 | 例 |
|------|------|-----|
| 一時的 | このタスクでのみ有効 | 特定バグの調査ログ |
| 重複 | 既に docs/ に類似情報がある | 既存ドキュメントと重複 |
| 陳腐化 | すぐに古くなる情報 | バージョン固有の問題 |
| 短い | 内容が少ない | 1000文字未満 |

## 手順

### Step 1: 報告書の確認

```bash
# タスク詳細確認
maidctl task get INVESTIGATION_TASK_ID

# 報告書確認
# reports/current_{メイド}.md の promotion セクション
```

報告書の promotion セクション例:
```yaml
## Investigation 昇格推奨
promotion:
  recommended: true
  path: "docs/research/mcp-tools-specification.md"
  reason: "他タスクでも参照される汎用的な仕様情報"
```

### Step 2: 昇格判断

**判断フローチャート:**
```
promotion.recommended: true ?
    │
    ├── Yes → 内容を確認
    │           │
    │           ├── 汎用的・再利用可能 → 昇格承認
    │           │
    │           └── 一時的・重複 → 昇格不要
    │
    └── No → 昇格不要（L2保持）
```

### Step 3: 昇格実行（承認時）

```bash
# 1. 調査結果ファイルを docs/ にコピー
cp .maid-agent/system/data/reports/current_{メイド}.md docs/research/xxx.md

# 2. ファイルに L3 マーク追加（ファイル冒頭）
# retention: L3

# 3. タスク更新
maidctl task update TASK_ID --summary "Investigation昇格完了: docs/research/xxx.md"

# 4. メイドに通知（任意）
maidctl notify {メイド} "調査結果を docs/research/xxx.md に昇格しました。"
```

### Step 4: 昇格不要の場合

```bash
# 特別な対応不要
# L2のまま保持され、Goal完了後30日で自動削除
```

## 昇格先ディレクトリ

| 内容 | 昇格先 | 例 |
|------|--------|-----|
| 技術調査結果 | `docs/research/` | mcp-tools-specification.md |
| 手順・ガイド | `docs/guides/` | gmail-integration.md |
| 設計・決定事項 | `docs/decisions/` | api-design-decision.md |
| 問題記録 | `docs/issues/` | 2026-02-22-file-conflict.md |

## retention レベル

| レベル | 削除タイミング | 対象 |
|--------|---------------|------|
| L1 | Phase完了後 7日 | 作業ログ、デバッグ |
| L2 | Goal完了後 30日 | Phase成果物、Investigation（未昇格） |
| L3 | 手動削除のみ | docs/ 配下、昇格済み調査結果 |

## 判断ポイント

| 状況 | 判断 | アクション |
|------|------|-----------|
| recommended: true + 汎用的 | 昇格承認 | docs/ にコピー |
| recommended: true + 一時的 | 昇格不要 | L2保持 |
| recommended: false | 昇格不要 | L2保持 |
| 判断困難 | 保留 | ご主人様に確認 |

## 注意点

- 【重要】昇格判断はレビュー時に行う（完了後に別途対応しない）
- 【禁止】無条件で全 Investigation を昇格（docs/ 肥大化を防止）
- 【推奨】昇格時はファイル冒頭に retention: L3 を記載
- 【推奨】昇格理由をコミットメッセージや報告書に記録

## 事例

### 事例1: API仕様調査 → 昇格承認

**状況**: MCP の新しい tools API を調査
**報告書**:
```yaml
promotion:
  recommended: true
  path: "docs/research/mcp-tools-api.md"
  reason: "今後の MCP 連携タスクで参照される"
```
**判断**: 汎用的な仕様情報 → 昇格承認
**対応**: docs/research/mcp-tools-api.md にコピー

### 事例2: バグ調査 → 昇格不要

**状況**: 特定バージョンでのみ発生するバグを調査
**報告書**:
```yaml
promotion:
  recommended: false
  path: ""
  reason: ""
```
**判断**: 一時的な調査 → 昇格不要
**対応**: L2のまま（Goal完了後30日で削除）

### 事例3: 比較分析 → 昇格承認

**状況**: ライブラリ A と B の比較分析
**報告書**:
```yaml
promotion:
  recommended: true
  path: "docs/decisions/library-comparison-a-vs-b.md"
  reason: "技術選定の根拠として残す"
```
**判断**: 設計決定の根拠 → 昇格承認
**対応**: docs/decisions/library-comparison-a-vs-b.md にコピー

## 関連パターン

- [report-collection](report-collection.md) - 報告収集フロー
- [review-queue-management](review-queue-management.md) - レビュー時の判断
