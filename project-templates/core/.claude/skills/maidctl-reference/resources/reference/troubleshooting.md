# maidctl トラブルシューティング

## 概要

maidctl 使用時によく発生するエラーと対処法。

## 適用条件

- maidctl コマンドでエラーが発生した時
- コマンドが見つからない時
- サーバー接続に問題がある時

---

## エラー対処一覧

| エラーメッセージ | 原因 | 対処 |
|------------------|------|------|
| `.maid-agent が見つかりません` | プロジェクト外で実行 | プロジェクトルートに移動 |
| `サーバーに接続できません` | maid-agent-messenger停止 | `pm2 restart maid-agent-messenger` |
| `コマンドが見つかりません` | PATH未設定 | `~/.bashrc` に PATH追加 |
| `タスクが見つかりません` | 無効なタスクID | `maidctl task list` で確認 |
| `権限がありません` | 役割外の操作 | 自分の役割で許可されたコマンドを使用 |

---

## PATH 設定方法

```bash
# ~/.bashrc または ~/.zshrc に追加
echo 'export PATH="$HOME/.maid-agent/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

---

## maid-agent-messenger 再起動

```bash
pm2 restart maid-agent-messenger
pm2 logs maid-agent-messenger --lines 10
```

---

## 事例

### 事例1: コマンド実行時に「プロジェクトが見つかりません」

**症状**: `maidctl task list` で `.maid-agent が見つかりません` エラー

**原因**: プロジェクトルート外のディレクトリで実行

**対処**: `cd` でプロジェクトルートに移動してから実行
