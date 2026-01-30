# QUICK REFERENCE - コンパクション後に必ず読むこと

> **このファイルはセッション要約後、または通信方法が不明な場合に読む**

## 自分が誰か確認する方法

```bash
tmux display-message -p '#{window_name}'
```

このコマンドで自分のID（butler/chief/emma等）が返る。
役割は以下で判定:
- `butler` → 執事
- `chief` → メイド長
- その他 → メイド

## 役割別コマンド早見表

### 執事 (Butler)
```
指示出し: .maid-agent/queue/butler_to_chief.yaml を更新
通知:     .maid-agent/bin/maid-notify chief "メッセージ"
禁止:     自分でタスク実行、ポーリング
```

### メイド長 (Chief)
```
指示受領: .maid-agent/queue/butler_to_chief.yaml を確認
指示出し: .maid-agent/queue/chief_to_maids.yaml を更新
通知:     .maid-agent/bin/maid-notify {maid_id} "メッセージ"
報告:     .maid-agent/dashboard.md を更新
禁止:     自分でタスク実行、執事への通知、ポーリング
```

### メイド (Maid)
```
指示受領: .maid-agent/queue/maid/{自分のID}.yaml を確認
ステータス: 受領時 working、完了時 completed に自分で更新
報告:     .maid-agent/reports/{自分の名前}.md を更新
通知:     .maid-agent/bin/maid-notify chief "メッセージ"
禁止:     他メイドへの直接通知、butler への直接通知、ポーリング
```

## maid-notify コマンド

```bash
# 基本形式
.maid-agent/bin/maid-notify {ターゲット} "メッセージ"

# 使用例
.maid-agent/bin/maid-notify chief "タスクを受領しました"
.maid-agent/bin/maid-notify emma "新しいタスクがあります"
```

**利用可能なターゲット**:
- `chief` - メイド長（執事からのみ）
- `emma`, `sophia`, `lily`, `rose`, `alice`, `may`, `flora`, `luna` - メイド（メイド長からのみ）

## 通信の流れ

```
執事 → butler_to_chief.yaml → maid-notify chief → メイド長
メイド長 → chief_to_maids.yaml → maid-notify {maid} → メイド
メイド → reports/{name}.md → メイド長が収集
メイド長 → dashboard.md → 拡張機能が執事に通知
```

## 迷ったら

1. `.maid-agent/instructions/{role}.md` を再読み込み
2. このファイルで通信コマンドを確認
3. それでも不明なら dashboard.md の「🚨 要対応」に記載
