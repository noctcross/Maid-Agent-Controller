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

## セッション開始時（必須）

```
1. Memory MCP で過去の知識グラフを読み込み（利用可能な場合）
2. .maid-agent/context/ でプロジェクト固有情報を確認
3. .maid-agent/instructions/{role}.md で自分の役割を確認
4. .maid-agent/dashboard.md で現在の状況を把握
```

## 通信プロトコル

### 基本原則
- **ポーリング禁止**: YAML + terminal.sendText() のイベント駆動
- **下への指示**: YAMLキューファイル経由 + sendText()で起動
- **上への報告**: dashboard.md 更新のみ（sendText禁止）

### sendText 2段階プロトコル（重要）

通知は必ず **2回に分けて** 送信:

```typescript
// ステップ1: メッセージ送信（Enterなし）
terminal.sendText('メッセージ', false);

// ステップ2: Enter送信（別の呼び出しで）
terminal.sendText('', true);
```

**禁止**: 1回の sendText でメッセージと Enter を同時に送信しない

### ファイル構成（すべて `.maid-agent/` 配下）

| ファイル | 用途 |
|---------|------|
| `.maid-agent/CLAUDE.md` | 本ファイル（詳細リファレンス） |
| `.maid-agent/dashboard.md` | 戦況報告（下→上への報告） |
| `.maid-agent/context/` | プロジェクト固有コンテキスト |
| `.maid-agent/instructions/butler.md` | 執事の役割定義 |
| `.maid-agent/instructions/chief.md` | メイド長の役割定義 |
| `.maid-agent/instructions/maid.md` | メイドの役割定義 |
| `.maid-agent/queue/butler_to_chief.yaml` | 執事→メイド長への指示 |
| `.maid-agent/queue/chief_to_maids.yaml` | メイド長→メイドへの割り当て |
| `.maid-agent/status/master_status.yaml` | 全体ステータス |
| `.maid-agent/reports/` | 各メイドからの報告 |
| `.maid-agent/skills/` | 承認済みスキル（再利用パターン） |
| `.maid-agent/config/settings.yaml` | 設定ファイル |

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
- Race Condition 防止: 同一リソースへのアクセスは直列化

### 4. 報告規約
- 上への報告は `.maid-agent/dashboard.md` の更新のみ
- 完了時は `.maid-agent/reports/` にレポートを作成
- dashboard.md の更新はメイド長のみが行う

### 5. コンパクション対応
- セッション開始時は必ず `.maid-agent/instructions/` を読む
- 自分の役割を確認してから作業開始
- 要約時は役割、禁止事項、現在タスクを含める

## Memory MCP 活用

Memory MCP が利用可能な場合、セッション開始時に必ず読み込み:
- ご主人様の好み・過去の決定事項
- プロジェクト固有の知識
- 過去のタスクで得た教訓

## 言語設定

`.maid-agent/config/settings.yaml` の `language` 設定に従う:
- `ja`: メイド口調の日本語
- `en`: 英語（メイド口調 + 英訳）

## スキルシステム

### スキルとは
繰り返し使える作業パターンを文書化したもの。メイドが発見し、承認後に `.maid-agent/skills/` に保存。

### スキル化基準
- **再利用性**: 他プロジェクトでも使える
- **反復性**: 同パターンを2回以上実行
- **チーム価値**: 他メイドにも有用
- **複雑性**: 手順や知識が必要

### スキル化フロー
```
メイド: 候補発見 → reports/ に記載
    ↓
メイド長: 集約 → dashboard.md に記載
    ↓
執事: 確認 → ご主人様に報告
    ↓
ご主人様: 承認 → skills/ に作成（skill-creator使用）
```

### スキル作成ガイド
詳細は `.maid-agent/skills/skill-creator/SKILL.md` を参照。

### 重要ルール
- メイドは候補を**報告のみ**（自分で作成禁止）
- スキル作成はご主人様の承認後のみ

## タイムスタンプ

日時は必ず `date -Iseconds` コマンドで取得。推測禁止。

## ご主人様への確認事項

判断が必要な事項は全て `.maid-agent/dashboard.md` の「🚨 要対応」セクションに集約。
- スキル化候補の承認依頼
- 著作権・ライセンスに関する判断
- 技術的な重要決定
- ブロッキングイシュー
