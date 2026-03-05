# Goal/Phase分解パターン

## 概要

ご主人様からの指示をGoal/Phase/Action階層で分解するための手順。
V2.1で導入された階層構造により、タスクの進捗管理と成果物管理を効率化する。

## 適用条件

- ご主人様から新しい指示を受けた時
- 複数のPhaseに分割が必要な作業を依頼された時
- Goal規模の判断が必要な時

## タスク階層

### Goal階層連動（V2.1）

Goalの表示ステータスは、配下Phase/Actionの状態から**自動計算**される。
Goalのステータスを直接更新する必要はない。

| 配下の状態 | Goal表示ステータス | アイコン |
|-----------|-------------------|---------|
| 全Phase pending | 未着手 | ⏸️ |
| いずれかPhase assigned | 準備中 | 📋 |
| いずれかPhase working | 進行中 | 🔵 |
| いずれかPhase waiting/checkpoint | ブロック中 | ⚠️ |
| 全Phase completed | 完了可能 | ✅ |

**latestUpdatedAt**:
Goal配下の全タスク（Phase/Action）の中で最も新しい `updatedAt`。
ダッシュボードのソートで使用される。

```
Goal（目標）
├── Phase 1（成果物単位）
│   ├── Action 1-1（メイド担当）
│   └── Action 1-2
├── Phase 2
│   └── Action 2-1
└── Phase 3
    └── Action 3-1, 3-2, 3-3
```

### 各階層の責任者

| 階層 | 作成者 | 説明 |
|------|--------|------|
| Goal | 執事 | ご主人様の指示1件 = 1 Goal |
| Phase | 執事 or メイド長 | 成果物単位、2-4個目安 |
| Action | メイド長 | メイド1人で完結する作業 |
| Investigation | メイド長 | 調査・分析タスク |

## Goal規模の判断

| 規模 | Phase数 | 報告書 | ユースケース |
|------|---------|--------|-------------|
| simple | 0-1 | Goal直下に記載 | typo修正、設定変更、調査のみ |
| standard | 2-4 | Phase単位 | 機能追加、バグ修正 |
| complex | 5+ | Phase単位 | 大規模リファクタリング |

## 分解フロー

```
1. 指示の全体像を把握
   - 何を達成したいか（Goal）
   - どこまでやるか（スコープ）
   - いつまでか（期限、あれば）

2. Goal規模を判断
   - simple: Phaseなし、直接Actionへ
   - standard: 2-4 Phase
   - complex: 5+ Phase、中間レビューポイント設置

3. Phase分解（成果物単位）
   - 調査 → 設計 → 実装 → テスト → レビュー
   - UI / API / DB など層ごと
   - 機能A / 機能B など機能ごと

4. メイド長に委譲
   - Phase単位でAction分解を依頼
   - 並列実行可能なPhaseを明示
```

## CLI例

### Goal作成

```bash
# 通常Goal
maidctl task create --type goal --title "ユーザー認証機能実装" --description "..."

# Tentative Goal（目標未確定の調査）
maidctl task create --type goal --tentative --title "MCPの新機能調査"
```

### Phase作成

```bash
# 親Goalを指定してPhase作成
maidctl task create --parent 100 --type phase --title "調査"
maidctl task create --parent 100 --type phase --title "設計"
maidctl task create --parent 100 --type phase --title "実装"
maidctl task create --parent 100 --type phase --title "レビュー"
```

## 分解パターン例

### パターン1: 機能実装（standard）

```
Goal #100: ユーザー認証機能実装
├── Phase: 調査
│   └── Action: 認証方式の調査・選定
├── Phase: 設計
│   └── Action: API設計、DB設計
├── Phase: 実装
│   ├── Action: ログインAPI実装
│   ├── Action: ログアウトAPI実装
│   └── Action: フロントエンド実装
└── Phase: レビュー
    └── Action: コードレビュー
```

### パターン2: バグ修正（simple）

```
Goal #101: ダッシュボード表示遅延修正
└── Action: 原因調査・修正
    （Phaseなし、直接Actionを実行）
```

### パターン3: 大規模リファクタリング（complex）

```
Goal #102: アーキテクチャ刷新
├── Phase 1: 現状分析
├── Phase 2: 要件定義
├── Phase 3: 設計
├── Phase 4: 実装Phase 1
├── Phase 5: 実装Phase 2
├── Phase 6: 統合テスト
└── Phase 7: 最終レビュー
```

## チェックリスト

Goal作成前の確認:

- [ ] 既存の関連Goalを確認したか
- [ ] Goal規模を判断したか（simple/standard/complex）
- [ ] Phase分解は成果物単位か
- [ ] 並列実行可能なPhaseを特定したか
- [ ] 依存関係がある場合は明示したか

## 関連パターン

- [tentative-goal.md](tentative-goal.md) - 目標未確定の調査指示
- [simple-goal-patterns.md](simple-goal-patterns.md) - Simple Goal実例
- [goal-auto-close.md](goal-auto-close.md) - Goal完了判定
