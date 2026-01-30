---
name: rule-template
description: ルールモジュールのテンプレート（このファイルは参考用です）
auto_select: false
target_roles: [common]
---

# ルール名

## 概要

このルールの目的を簡潔に記述します。

## ルール内容

### 必須事項
- ルール1
- ルール2

### 推奨事項
- 推奨1
- 推奨2

### 禁止事項
- 禁止1
- 禁止2

---

## フロントマターの説明

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `name` | ルールの識別名 | `coding-style` |
| `description` | 簡潔な説明 | `コーディング規約` |
| `auto_select` | Init時に自動選択するか | `true` / `false` |
| `target_roles` | 適用対象 | `[common]`, `[butler, chief]`, `[maid]` |

## target_roles の値

- `common` - 全エージェントに適用
- `butler` - 執事のみ
- `chief` - メイド長のみ
- `maid` - メイドのみ

複数指定可能: `[butler, chief]`
