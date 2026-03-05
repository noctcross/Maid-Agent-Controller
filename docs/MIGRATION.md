# マイグレーションガイド: Ver1 → Ver2

## 対象

- Ver1（main ブランチ）を使用中のプロジェクト
- `.maid-agent/agents/` 構造を持つプロジェクト

## 移行手順（推奨）

### 1. バックアップ

```bash
cp -r .maid-agent .maid-agent.bak
```

### 2. 拡張機能を更新

[GitHub Releases](https://github.com/noctcross/Maid-Agent-Controller/releases) から vsix ファイルをダウンロードし、インストール:

```bash
code --install-extension multi-agent-controller-2.0.0.vsix
```

または VSCode の「拡張機能」→「...」→「VSIXからインストール」を選択。

### 3. initGlobal を実行（マシンごとに1回）

コマンドパレット → `Maid Agent: グローバル設定を初期化`

実行内容:
- `maidctl` CLI を `~/.maid-agent/bin/` に配置
- PATH をシェル設定に追加
- 必要なツール（jq, yq, pm2）をインストール

### 4. init を実行（プロジェクトごと）

コマンドパレット → `Maid Agent: ワークスペースを初期化`

実行内容:
- `core/` + `roles/` 構造を作成
- instructions を更新（バックアップ付き）
- スキルを `core/.claude/skills/` に配置

### 5. tasks.yaml マイグレーション（タスク履歴を引き継ぐ場合）

V1 の tasks.yaml を V2.1 形式に変換:

```bash
# まず確認（dry-run）
maidctl run migrate --dry-run

# 問題なければ実行
maidctl run migrate
```

新規プロジェクトの場合はスキップ可。

### 6. カスタマイズの復元（必要な場合）

`core/instructions/backup/` にバックアップされたファイルを確認し、手動でマージ。

### 7. 旧ディレクトリを削除

```bash
rm -rf .maid-agent/agents
```

## 破壊的変更

| 変更内容 | 移行方法 |
|----------|----------|
| `agents/` → `core/` + `roles/` | `init` で自動対応 |
| `agents/skills/` → `core/.claude/skills/` | `init` で自動対応 |
| MCP サーバー廃止 | `maidctl` CLI を使用 |
| ステータス: 1層 → 2層（`mainStatus` + `v2Substatus`） | 自動互換 |

## maidctl コマンド（v3.0.0）

| 用途 | コマンド |
|------|----------|
| タスク作成 | `maidctl create task` |
| タスク一覧 | `maidctl get tasks` |
| ステータス更新 | `maidctl set my-status` |
| 通知送信 | `maidctl notify` |

旧コマンドも後方互換で動作します。
