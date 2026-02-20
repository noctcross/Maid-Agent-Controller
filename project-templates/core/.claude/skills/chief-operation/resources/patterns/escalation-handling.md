# Escalation Handling - エスカレーション対応

## 概要

メイドからblocked/エスカレーションを受けた際の対応フロー。

## 適用条件

- メイドから「blocked」状態の通知を受けた時
- メイドから相談・判断依頼を受けた時
- `maidctl team status` でblocked状態を検知した時

## 判断基準

| 状況 | 対応 |
|-----|------|
| 他メイドの意見で解決 | 追加タスクとして該当メイドに割り振り |
| 複数メイドの協議が必要 | 順番に意見収集タスクを割り振り |
| 技術的判断が必要（escalation: true） | ご主人様判断待ちに設定 |
| 作業方針の決定が必要（escalation: true） | ご主人様判断待ちに設定 |
| 完了タスクの確認が必要 | action_required（status: completedのまま） |

## 手順

### 1. blocked検知

```bash
# チーム状況確認
maidctl team status

# 報告書で詳細確認
cat .maid-agent/system/data/reports/current_{メイドID}.md
```

### 2. escalation フラグ確認

tasks.yaml の `escalation: true` を確認（主要シグナル）

### フロー1: escalation: true の場合

ご主人様の判断が必要。

```bash
# 1. 報告書のescalationセクションで詳細確認
# 2. ご主人様判断待ちに設定
maidctl task update TASK_ID --category action_required --substatus "ご主人様判断待ち"

# ※ status: blocked は maidctl my-status で自動同期済み
# ※ ダッシュボードの「⚠️ 対応待ち → アクティブ」に表示
```

### フロー2: escalation: false/未設定 の場合

自身で対応を試みる。

```bash
# 解決可能な場合
# 例: 依存タスク調整、別メイドへの指示等
maidctl notify {メイド} "解消しました。再開してください。"

# 解決不可の場合 → フロー1に移行
maidctl task update TASK_ID --category action_required --substatus "ご主人様判断待ち"
```

### フロー3: 他メイドへの相談

```bash
# 追加タスク作成
maidctl task create --title "APIの設計について意見を提供" \
  --description "エマからの相談: [内容]" \
  --priority medium

# 相談先メイドに割当・通知
maidctl task assign {ID} --to sophia --title "設計相談"
maidctl notify sophia "エマさんからの相談依頼があります"
```

## ご主人様のアクション後（フロー4）

ご主人様が判断を下した後の処理:

```bash
# 1. 判断内容をメイドに伝達
maidctl notify {メイド} "判断結果: {内容}"

# 2. エスカレーション解除
maidctl task update TASK_ID --category task --substatus ""
# ※ action_required → task に戻す
```

## 完了タスクの確認待ち設定（フロー2）

メイドの完了報告を確認し、ご主人様の確認が必要と判断した場合:

```bash
maidctl task update TASK_ID --category action_required
# ※ status は completed のまま
# → ダッシュボードの「⚠️ 対応待ち → 確認待ち」に表示
```

## 注意点

- escalation: true は最優先で対応
- 自己判断で技術的決定をしない（CF001）
- 解決の見込みがない場合は早めにエスカレーション

## 事例

### 技術的判断が必要なケース

```bash
# エマからblocked報告、escalation: true
# 報告書: 「REST vs GraphQL どちらを採用すべきか判断が必要」

# ご主人様判断待ちに設定
maidctl task update 077 --category action_required \
  --substatus "REST/GraphQL選択判断待ち"

# → ご主人様の判断を待つ

# 判断後
maidctl notify emma "REST APIを採用します。再開してください。"
maidctl task update 077 --category task --substatus ""
```

### 他メイドへの相談で解決するケース

```bash
# アリスからblocked報告、escalation: false
# 報告書: 「設計パターンについてソフィアの意見がほしい」

# 相談タスク作成
maidctl task create --parent 077 --title "設計パターン相談"
maidctl task assign 077-1 --to sophia --title "設計パターン相談"
maidctl notify sophia "アリスさんから相談依頼があります"

# ソフィア完了後、アリスに結果伝達
maidctl notify alice "ソフィアさんの意見: [内容]。再開してください。"
```
