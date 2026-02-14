# Skill Candidate - スキル化候補の発見・報告方法

## 概要

作業中に発見した汎用的なパターンをスキル化候補として報告する方法。
メイドは候補を**報告のみ**し、自分でスキルを作成してはいけない。

## 適用条件

- 繰り返し使える作業パターンを発見した
- 他のプロジェクトでも使えそうな手順がある
- 他のメイドにも有用な知見を得た

## 判断基準

以下の条件を **1つ以上** 満たす場合、スキル化候補として報告:

| 基準 | 説明 | 例 |
|------|------|-----|
| **再利用性** | 他プロジェクトでも使えそう | 汎用的なバリデーション処理 |
| **反復性** | 同じパターンを2回以上実行した | API エンドポイント追加の手順 |
| **チーム価値** | 他のメイドにも有用 | テスト記述のテンプレート |
| **複雑性** | 手順や知識が必要 | 環境構築の手順書 |

## 新規スキル vs パターン追加

### 新規スキル（new_skill）

- 既存のドメインスキルに該当しない
- 複数のパターンや事例を含む予定がある
- 継続的に育てていく想定

### パターン追加（pattern_add）

- 上位スキル（debugging, code-review等）が既に存在
- 個別の手順・事例である
- 例: 「MCPサーバー診断手順」→ debugging/patterns/mcp-server.md

## 報告形式

### 新規スキルの場合

```yaml
skill_candidate:
  found: true
  type: "new_skill"
  name: "api-endpoint-creator"
  description: "REST APIエンドポイントを追加する手順"
  reason: "同じパターンを3回実行、他メイドにも有用"
```

### 既存スキルへのパターン追加の場合

```yaml
skill_candidate:
  found: true
  type: "pattern_add"
  target_skill: "debugging"  # 親スキル名
  name: "mcp-server-diagnostics"
  description: "MCPサーバー診断パターン"
  reason: "トラブルシューティングで確立した手順"
```

### 候補なしの場合

```yaml
skill_candidate:
  found: false
```

**found は必須**（false でも明示的に記載）

## フロー

```
1. メイドがスキル化候補を発見
    ↓
2. 報告書の skill_candidate セクションに記載
    ↓
3. maidctl my-status completed で完了報告
    ↓
4. メイド長が集約
    ↓
5. 📚 スキル化候補タスクとしてご主人様向けに作成
    ↓
6. ご主人様が承認
    ↓
7. スキル作成（skill-creator を使用）
```

## 重要

- **スキルを自分で作成してはいけない**
- 候補を発見したらメイド長に報告のみ
- メイド長がご主人様向けタスク（📚スキル化候補）を作成 → 承認を経てスキル化

## 事例

### 事例1: 新規スキル候補

作業中に「VSCode Webviewの開発時に毎回同じ問題に遭遇する」ことに気づいた場合:

```yaml
skill_candidate:
  found: true
  type: "new_skill"
  name: "vscode-webview-development"
  description: "VSCode Webview開発時のCSP対応、パス変換等のベストプラクティス"
  reason: "3回同じパターンで問題解決。他のVSCode拡張開発でも使える"
```

### 事例2: パターン追加候補

デバッグスキルに追加できそうなパターンを発見した場合:

```yaml
skill_candidate:
  found: true
  type: "pattern_add"
  target_skill: "debugging"
  name: "typescript-type-error-diagnosis"
  description: "TypeScriptの型エラー診断パターン"
  reason: "複雑な型エラーの解決手順を確立した"
```
