---
name: maidctl-reference
description: "maidctl CLIリファレンス。maidctlコマンド実行前・エラー発生時は必ず参照。推測で再試行せずこのスキルを確認すること。"
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
  - [カテゴリ一覧](#カテゴリ一覧)
  - [優先度一覧](#優先度一覧)
- [詳細リファレンス](#詳細リファレンス)
  - [オプション詳細](resources/reference/options.md)
  - [使用例・jq連携](resources/reference/examples.md)
  - [トラブルシューティング](resources/reference/troubleshooting.md)

## Overview

maidctl CLI の詳細リファレンス。コマンド一覧、オプション詳細、jq連携例、エラー対処法を提供。

## When to Use

- maidctl コマンドの構文を確認したい時
- オプションの使い方を調べたい時
- エラーが発生して対処法を知りたい時
- jq との連携方法を確認したい時

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
| `maidctl task create` | タスク作成 | 執事・メイド長（※） |
| `maidctl task update TASK_ID` | タスク更新 | メイド長 |
| `maidctl task assign TASK_ID` | タスク割り当て | メイド長 |

※ メイド長のcreate使用は🚨要対応/📚スキル候補/💡改善提案のみ

#### メイド専用

| コマンド | 用途 |
|----------|------|
| `maidctl my-task` | 自分のタスク取得 |
| `maidctl my-status STATUS` | ステータス更新（working/completed/blocked） |

#### チーム状態

| コマンド | 用途 | 使用者 |
|----------|------|--------|
| `maidctl team status` | チーム状況一覧 | メイド長・執事 |
| `maidctl team report TASK_ID` | レポート取得 | 執事・メイド長 |
| `maidctl report rearchive TASK_ID` | 報告書を再アーカイブ | 全員 |

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

### カテゴリ一覧

| カテゴリ | 用途 | 絵文字 |
|---------|------|--------|
| `task` | 通常タスク（デフォルト） | - |
| `action_required` | 要対応（ご主人様判断待ち） | 🚨 |
| `skill_candidate` | スキル化候補 | 📚 |
| `improvement` | 改善提案 | 💡 |

### 優先度一覧

| 優先度 | 説明 |
|--------|------|
| `high` | 高優先度（即時対応） |
| `medium` | 中優先度（通常） |
| `low` | 低優先度（余裕があれば） |

---

## 詳細リファレンス

各コマンドの詳細オプション、使用例、トラブルシューティングは以下を参照:

| リソース | 内容 |
|---------|------|
| [options.md](resources/reference/options.md) | 各コマンドのオプション詳細・短縮形 |
| [examples.md](resources/reference/examples.md) | 役割別の使用例・jq連携パターン |
| [troubleshooting.md](resources/reference/troubleshooting.md) | エラー対処法・PATH設定 |
