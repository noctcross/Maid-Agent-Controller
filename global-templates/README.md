# Maid Agent グローバル設定

このフォルダには、プロジェクト間で共有するルール、スキル、MCPサーバーを保存します。

## フォルダ構造

```
~/.maid-agent/
├── rules/                  # ルールモジュール
│   ├── common/             # 全員に適用
│   ├── butler/             # 執事のみ
│   ├── chief/              # メイド長のみ
│   └── maid/               # メイドのみ
├── skills/                 # 共有スキル
└── maid-agent-messenger/   # MCP サーバー（全プロジェクト共通）
```

## maid-agent-messenger

`maid-agent-messenger/` フォルダには、エージェント間メッセージング用のMCPサーバーを配置します。
サーバーはpm2などで起動し、各プロジェクトの `.mcp.json` から接続します。

## ルールモジュールの形式

```markdown
---
name: rule-name
description: ルールの説明
auto_select: true/false
target_roles: [common] or [butler, chief, maid]
---

（ルール内容）
```

## スキルの形式

```markdown
---
name: skill-name
description: スキルの説明
auto_select: true/false
---

（スキル内容）
```
