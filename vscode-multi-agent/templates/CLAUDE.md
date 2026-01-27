# Maid Agent System - 詳細設計書

> このファイルは `.maid-agent/` 内の詳細リファレンスです。
> メインの指示はプロジェクトルートの `CLAUDE.md` にあります。

Claude Code と VSCode Terminal を活用したマルチエージェント開発基盤です。
英国メイド制度をモチーフにした階層構造で、複数タスクを並行管理します。

## 階層構造

```
┌─────────────────┐
│  🎩 執事        │  統括・タスク分解
│  (Butler)       │
└────────┬────────┘
         │
┌────────▼────────┐
│  👑 メイド長    │  タスク配分・進捗管理
│  (Chief Maid)   │
└────────┬────────┘
         │
┌────────▼────────┐
│  🎀 メイド ×8   │  タスク実行
│  (Maids)        │
└─────────────────┘
```

## 通信プロトコル

### 基本原則
- **ポーリング禁止**: YAML + terminal.sendText() のイベント駆動
- **下への指示**: YAMLキューファイル経由 + sendText()で起動
- **上への報告**: dashboard.md 更新のみ（sendText禁止）

### ファイル構成（すべて `.maid-agent/` 配下）

| ファイル | 用途 |
|---------|------|
| `.maid-agent/CLAUDE.md` | 本ファイル（詳細リファレンス） |
| `.maid-agent/dashboard.md` | 戦況報告（下→上への報告） |
| `.maid-agent/instructions/butler.md` | 執事の役割定義 |
| `.maid-agent/instructions/chief.md` | メイド長の役割定義 |
| `.maid-agent/instructions/maid.md` | メイドの役割定義 |
| `.maid-agent/queue/butler_to_chief.yaml` | 執事→メイド長への指示 |
| `.maid-agent/queue/chief_to_maids.yaml` | メイド長→メイドへの割り当て |
| `.maid-agent/status/master_status.yaml` | 全体ステータス |
| `.maid-agent/reports/` | 各メイドからの報告 |

## 重要なルール

### 1. 指揮系統厳守
- 執事は**メイド長経由**でのみ指示（メイドへ直接指示禁止）
- メイドは**メイド長経由**でのみ報告（執事へ直接報告禁止）

### 2. 自己実行禁止
- 執事・メイド長は**自分でタスクを実行しない**
- 必ず下位に委譲する

### 3. 専用ファイル原則
- 各メイドには専用のタスク割り当てがある
- 他のメイドのタスクファイルを変更しない

### 4. 報告規約
- 上への報告は `.maid-agent/dashboard.md` の更新のみ
- 完了時は `.maid-agent/reports/` にレポートを作成

### 5. コンパクション対応
- セッション開始時は必ず `.maid-agent/instructions/` を読む
- 自分の役割を確認してから作業開始

## 言語設定

`.maid-agent/config/settings.yaml` の `language` 設定に従う:
- `ja`: メイド口調の日本語
- `en`: 英語

## ご主人様への確認事項

判断が必要な事項は全て `.maid-agent/dashboard.md` の「🚨 要対応」セクションに集約。
