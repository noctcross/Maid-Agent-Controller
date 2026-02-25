---
name: maidctl-reference
description: "maidctl CLIリファレンス。maidctlコマンド実行前・エラー発生時は必ず参照。推測で再試行せずこのスキルを確認すること。"
version: "2.1.0"
---

# maidctl-reference

## 目次

- [Overview](#overview)
- [When to Use](#when-to-use)
- [Quick Reference](#quick-reference)
  - [前提条件](#前提条件)
  - [コマンド一覧](#コマンド一覧)
  - [運用ルール](#運用ルール)
  - [ステータス一覧](#ステータス一覧)
  - [V2.1 タスク種別](#v21-タスク種別)
  - [V2.1 サブステータス](#v21-サブステータス)
  - [カテゴリ一覧](#カテゴリ一覧)
  - [優先度一覧](#優先度一覧)
- [詳細リファレンス](#詳細リファレンス)
  - [オプション詳細](resources/reference/options.md)
  - [使用例・jq連携](resources/reference/examples.md)
  - [トラブルシューティング](resources/reference/troubleshooting.md)

## Overview

maidctl CLI v2.1.0 の詳細リファレンス。コマンド一覧、オプション詳細、jq連携例、エラー対処法を提供。

## When to Use

- maidctl コマンドの構文を確認したい時
- オプションの使い方を調べたい時
- エラーが発生して対処法を知りたい時
- jq との連携方法を確認したい時
- V2.1 タスク種別・サブステータスを確認したい時

## Quick Reference

### 前提条件

- プロジェクトルート配下で実行（`.maid-agent/` が見つかる場所）
- PATH設定済み: `export PATH="$HOME/.maid-agent/bin:$PATH"`

---

### コマンド一覧

#### タスク操作

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl task list` | タスク一覧取得 | 執事・メイド長 |
| `maidctl task get TASK_ID` | タスク詳細取得 | 全員 |
| `maidctl task create` | タスク作成（V2.1対応） | 執事・メイド長（※） |
| `maidctl task update TASK_ID` | タスク更新（V2.1対応） | メイド長 |
| `maidctl task assign TASK_ID` | タスク割り当て | メイド長 |

※ メイド長のcreate使用は🚨要対応/📚スキル候補/💡改善提案のみ

#### メイド専用

| コマンド | 用途 |
|----------|------|
| `maidctl my-task` | 自分のタスク取得 |
| `maidctl my-status STATUS` | ステータス更新（V2.1対応） |

#### チーム状態

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl team status` | チーム状況一覧 | メイド長・執事 |
| `maidctl team report TASK_ID` | レポート取得 | 執事・メイド長 |
| `maidctl report rearchive TASK_ID` | 報告書を再アーカイブ | 全員 |

#### V2.1 マイグレーション

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl migrate status` | マイグレーション状況確認 | 執事・メイド長 |
| `maidctl migrate run` | マイグレーション実行 | 執事・メイド長 |

#### 通知

| コマンド | 用途 |
|----------|------|
| `maidctl notify TARGET "MSG"` | エージェントに通知 |

---

### 運用ルール

#### 必須事項

- `--status`, `--assignee`, `--summary` で絞り込んでから取得
- プロジェクトルート配下で実行

#### 禁止事項

- フィルタなしで全件取得（トークン浪費）
- ポーリング（通知駆動で待機）

#### 推奨事項

- 複雑な条件のみjq併用
- `--summary` で軽量版を優先使用

---

### ステータス一覧

| ステータス | 説明 | 設定者 |
|-----------|------|--------|
| `pending` | 未着手 | 執事（作成時） |
| `assigned` | 割り当て済み | メイド長 |
| `working` | 作業中 | メイド |
| `completed` | 完了 | メイド |
| `blocked` | 問題発生・判断待ち | メイド |

---

### V2.1 タスク種別

| 種別 | 説明 | 作成者 |
|------|------|--------|
| `goal` | ご主人様の指示単位。Phase/Actionの親 | 執事 |
| `phase` | Goal内の成果物単位。2-4個目安 | 執事・メイド長 |
| `action` | メイドが実行する作業単位 | メイド長 |
| `investigation` | 調査・分析タスク（docs/昇格対象） | メイド長 |

#### タスク作成例

```bash
# Goal作成
maidctl task create --title "新機能実装" --type goal --size standard

# 暫定Goal（調査後に再定義）
maidctl task create --title "MCP調査" --type goal --tentative

# Phase作成
maidctl task create --title "設計" --type phase --parent 310

# Action作成
maidctl task create --title "API実装" --type action --parent 310-1

# Investigation作成
maidctl task create --title "ライブラリ調査" --type investigation --parent 310

# 依存関係付き
maidctl task create --title "テスト作成" --type action --parent 310-1 --blocked-by 310-1-1,310-1-2
```

#### Goalサイズ

| サイズ | Phase数 | 報告書 | ユースケース |
|--------|---------|--------|-------------|
| `simple` | 0-1 | Goal直下 | typo修正、設定変更、調査のみ |
| `standard` | 2-4 | Phase単位 | 機能追加、バグ修正 |
| `complex` | 5+ | Phase単位 | 大規模リファクタリング |

---

### V2.1 サブステータス

| サブステータス | 説明 | 使用場面 |
|---------------|------|----------|
| `working` | アクティブに作業中 | 通常の作業中 |
| `pending` | 一時停止中 | 他タスク優先時 |
| `checkpoint` | チェックポイント到達・確認待ち | メイド長の確認が必要な時 |
| `waiting` | 依存タスク完了待ち | ブロッカー解消待ち |
| `completed` | 完了 | タスク完了時 |
| `archived` | アーカイブ済み | 長期保存時 |

#### ステータス更新例

```bash
# 作業開始
maidctl my-status working

# 作業開始（サブステータス指定）
maidctl my-status working --substatus working

# チェックポイント到達（確認待ち）
maidctl my-status blocked --substatus checkpoint --reason "設計確認待ち"

# 依存タスク待ち
maidctl my-status blocked --substatus waiting --blocked-by 310-1-1

# 完了
maidctl my-status completed
```

---

### カテゴリ一覧

| カテゴリ | 用途 | 絵文字 |
|---------|------|--------|
| `task` | 通常タスク（デフォルト） | - |
| `action_required`（非推奨） | 要対応 → `--action-required` を使用 | 🚨 |
| `skill_candidate` | スキル化候補 | 📚 |
| `improvement` | 改善提案 | 💡 |

### 優先度一覧

| 優先度 | 説明 |
|--------|------|
| `high` | 高優先度（即時対応） |
| `medium` | 中優先度（通常） |
| `low` | 低優先度（余裕があれば） |

---

### V2.1 マイグレーション

既存タスクをV2.1形式に移行するコマンド。

```bash
# マイグレーション状況確認
maidctl migrate status

# ドライラン（変更内容のみ表示）
maidctl migrate run --dry-run

# マイグレーション実行
maidctl migrate run
```

---

## 詳細リファレンス

各コマンドの詳細オプション、使用例、トラブルシューティングは以下を参照:

| リソース | 内容 |
|---------|------|
| [options.md](resources/reference/options.md) | 各コマンドのオプション詳細・短縮形 |
| [examples.md](resources/reference/examples.md) | 役割別の使用例・jq連携パターン |
| [troubleshooting.md](resources/reference/troubleshooting.md) | エラー対処法・PATH設定 |
