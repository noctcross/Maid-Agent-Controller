# Task/Work分解パターン

## 概要

ご主人様からの指示をTask/Work/Step階層で分解するための手順。
V2.1で導入された階層構造により、タスクの進捗管理と成果物管理を効率化する。

## 適用条件

- ご主人様から新しい指示を受けた時
- 複数のWorkに分割が必要な作業を依頼された時
- Task規模の判断が必要な時

## タスク階層

### Task階層連動（V2.1）

Taskの表示ステータスは、配下Work/Stepの状態から**自動計算**される。
Taskのステータスを直接更新する必要はない。

| 配下の状態 | Task表示ステータス | アイコン |
|-----------|-------------------|---------|
| 全Work pending | 未着手 | ⏸️ |
| いずれかWork assigned | 準備中 | 📋 |
| いずれかWork working | 進行中 | 🔵 |
| いずれかWork waiting/checkpoint | ブロック中 | ⚠️ |
| 全Work completed | 完了可能 | ✅ |

**latestUpdatedAt**:
Task配下の全タスク（Work/Step）の中で最も新しい `updatedAt`。
ダッシュボードのソートで使用される。

```
Task（目標）
├── Work 1（成果物単位）
│   ├── Step 1-1（メイド担当）
│   └── Step 1-2
├── Work 2
│   └── Step 2-1
└── Work 3
    └── Step 3-1, 3-2, 3-3
```

### 各階層の責任者

| 階層 | 作成者 | 説明 |
|------|--------|------|
| Task | 執事 | ご主人様の指示1件 = 1 Task |
| Work | 執事 or メイド長 | 成果物単位、2-4個目安 |
| Step | メイド長 | メイド1人で完結する作業 |
| Investigation | メイド長 | 調査・分析タスク |

## Task規模の判断

| 規模 | Work数 | 報告書 | ユースケース |
|------|--------|--------|-------------|
| simple | 0-1 | Task直下に記載 | typo修正、設定変更、調査のみ |
| standard | 2-4 | Work単位 | 機能追加、バグ修正 |
| complex | 5+ | Work単位 | 大規模リファクタリング |

## 分解フロー

```
1. 指示の全体像を把握
   - 何を達成したいか（Task）
   - どこまでやるか（スコープ）
   - いつまでか（期限、あれば）

2. Task規模を判断
   - simple: Workなし、直接Stepへ
   - standard: 2-4 Work
   - complex: 5+ Work、中間レビューポイント設置

3. Work分解（成果物単位）
   - 調査 → 設計 → 実装 → テスト → レビュー
   - UI / API / DB など層ごと
   - 機能A / 機能B など機能ごと

4. メイド長に委譲
   - Work単位でStep分解を依頼
   - 並列実行可能なWorkを明示
```

## CLI例

### Task作成

```bash
# 通常Task
maidctl task create --type task --title "ユーザー認証機能実装" --description "..."

# Tentative Task（目標未確定の調査）
maidctl task create --type task --tentative --title "MCPの新機能調査"
```

### Work作成

```bash
# 親Taskを指定してWork作成
maidctl task create --parent 100 --type work --title "調査"
maidctl task create --parent 100 --type work --title "設計"
maidctl task create --parent 100 --type work --title "実装"
maidctl task create --parent 100 --type work --title "レビュー"
```

## 分解パターン例

### パターン1: 機能実装（standard）

```
Task #100: ユーザー認証機能実装
├── Work: 調査
│   └── Step: 認証方式の調査・選定
├── Work: 設計
│   └── Step: API設計、DB設計
├── Work: 実装
│   ├── Step: ログインAPI実装
│   ├── Step: ログアウトAPI実装
│   └── Step: フロントエンド実装
└── Work: レビュー
    └── Step: コードレビュー
```

### パターン2: バグ修正（simple）

```
Task #101: ダッシュボード表示遅延修正
└── Step: 原因調査・修正
    （Workなし、直接Stepを実行）
```

### パターン3: 大規模リファクタリング（complex）

```
Task #102: アーキテクチャ刷新
├── Work 1: 現状分析
├── Work 2: 要件定義
├── Work 3: 設計
├── Work 4: 実装Work 1
├── Work 5: 実装Work 2
├── Work 6: 統合テスト
└── Work 7: 最終レビュー
```

## チェックリスト

Task作成前の確認:

- [ ] 既存の関連Taskを確認したか
- [ ] Task規模を判断したか（simple/standard/complex）
- [ ] Work分解は成果物単位か
- [ ] 並列実行可能なWorkを特定したか
- [ ] 依存関係がある場合は明示したか

## 関連パターン

- [tentative-task.md](tentative-task.md) - 目標未確定の調査指示
- [simple-task-patterns.md](simple-task-patterns.md) - Simple Task実例
- [task-auto-close.md](task-auto-close.md) - Task完了判定
