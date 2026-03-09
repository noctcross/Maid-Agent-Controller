# Maid Agent グローバル設定

このフォルダには、プロジェクト間で共有する設定、ルール、スキル、ダッシュボードサーバーを保存します。

## フォルダ構造

```
~/.maid-agent/
├── bin/                        # CLI ツール
│   ├── maidctl                 # メインCLI
│   └── pm2-restart-log.sh      # PM2再起動ログユーティリティ
├── maid-agent-messenger/       # ダッシュボードサーバー
│   ├── bin/
│   │   └── cleanup.sh          # アンインストール用クリーンアップ
│   ├── dist/                   # サーバー実行ファイル
│   ├── logs/                   # ログ出力先
│   ├── ecosystem.config.cjs    # PM2 設定
│   ├── package.json
│   └── package-lock.json
├── rules/                      # ルールモジュール
│   ├── common/                 # 全員に適用
│   ├── butler/                 # 執事のみ
│   ├── chief/                  # メイド長のみ
│   └── maid/                   # メイドのみ
├── skills/                     # 共有スキル
└── system/
    └── config/
        └── maid-agent-messenger.yaml  # サーバー設定
```

## maid-agent-messenger

ダッシュボードサーバー。タスク管理、エージェント状態表示、WebSocket通知などを提供します。

### 起動方法

```bash
# PM2 で起動（推奨）
cd ~/.maid-agent/maid-agent-messenger
npm install
pm2 start ecosystem.config.cjs

# 状態確認
pm2 status maid-agent-messenger

# ログ確認
pm2 logs maid-agent-messenger
```

### 設定ファイル

`~/.maid-agent/system/config/maid-agent-messenger.yaml`:

```yaml
server:
  port: 3100          # サーバーポート
  host: 127.0.0.1     # バインドアドレス（0.0.0.0 で外部公開）

dashboard:
  editor: vscode      # エディタスキーム（vscode | windsurf | cursor）

keepalive:
  http_keepalive_timeout: 65000
  http_headers_timeout: 66000
  ping_interval: 30000
```

## ルールモジュール

プロジェクト初期化時に選択可能なルールを配置します。

```markdown
# ルール名

## 概要
ルールの目的を簡潔に記述

## ルール内容

### 必須事項
- ルール1
- ルール2

### 禁止事項
- 禁止1
```

## スキル

プロジェクト間で共有するスキルを配置します。

```
skills/
└── skill-name/
    ├── SKILL.md           # スキル本体
    └── resources/         # 関連リソース
```
