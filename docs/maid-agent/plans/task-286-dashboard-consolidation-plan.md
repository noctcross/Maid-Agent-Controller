# ダッシュボード共通化リファクタリング 実装計画書

- 作成日: 2026-02-21T14:45:00+09:00
- 担当: ソフィア (sophia)
- タスクID: task-286
- 参考: task-284-sophia-Dashboard共通化調査.md

## 1. 実装スコープ

### 目的（解決する課題）

Web版ダッシュボード（maid-agent-messenger）とIDE版ダッシュボード（VSCode拡張）で重複している以下のコードを共通化し、保守性を向上させる:

1. **Phase 1**: HTMLエスケープ関数 `escapeHtml()` の実装統一
2. **Phase 2**: CSS変数・基本スタイルの共通化、レポートビューアスタイルの統一

### 対象コンポーネント（パス・現在の行数）

| ファイル | 行数 | Phase | 役割 |
|---------|------|-------|------|
| `packages/maid-agent-messenger/src/markdown-utils.ts` | 276 | P1 | Web版escapeHtml定義元 |
| `src/utils/html-escape.ts` | 12 | P1 | IDE版escapeHtml定義（削除対象） |
| `src/ui/web-dashboard.ts` | 891 | P1 | IDE版escapeHtml利用 |
| `src/ui/controller-panel.ts` | 325 | P1 | IDE版escapeHtml利用 |
| `src/utils/__tests__/html-escape.test.ts` | - | P1 | IDE版テスト（移動対象） |
| `packages/maid-agent-messenger/src/views/dashboard-styles.ts` | 326 | P2 | Web版CSSスタイル定義 |
| `packages/maid-agent-messenger/src/views/shared-styles.ts` | (新規) | P2 | 共通CSS変数・基本スタイル |
| `packages/maid-agent-messenger/src/views/markdown-styles.ts` | (新規) | P2 | 共通Markdownスタイル |

### スコープ外（明示的に除外するもの）

- **Phase 3（Markdown変換統一）**: 機能差が大きいため今回見送り
- **タスク表示形式統一**: 目的が異なるため見送り
- **WebSocket処理**: 環境差を吸収するため分離維持

### 既存テストへの影響

- `src/utils/__tests__/html-escape.test.ts`: IDE版escapeHtml削除に伴い、Web版のテストに統合
- `packages/maid-agent-messenger/src/__tests__/markdown-utils.test.ts`: escapeHtml既存テストあり、追加テスト不要

## 2. 実装フェーズ

### フェーズ一覧

| Phase | 名称 | 難易度 | 優先度 | 目的 |
|-------|------|--------|--------|------|
| 1-1 | escapeHtml統一 | 低 | P1 | 重複関数の除去、一貫性向上 |
| 2-1 | shared-styles.ts作成 | 中 | P2 | CSS変数・基本スタイル共通化 |
| 2-2 | markdown-styles.ts作成 | 中 | P2 | レポートビューアスタイル共通化 |
| 2-3 | dashboard-styles.tsリファクタリング | 中 | P2 | 共通スタイル参照に変更 |

### 依存関係図

```
Phase 1-1 (escapeHtml統一)
     │
     ↓ 独立
Phase 2-1 (shared-styles.ts) ←──┐
     │                         │
     ↓                         │
Phase 2-2 (markdown-styles.ts) │
     │                         │
     ↓                         │
Phase 2-3 (dashboard-styles.ts)┘
```

**注意**: Phase 1とPhase 2は独立しており、並列実行可能。

---

## 3. Phase 1-1: escapeHtml統一

### 方針

IDE版の `src/utils/html-escape.ts` を削除し、Web版のescapeHtmlをIDEでも使用する形式に変更。

ただし、**IDE版とWeb版は異なるパッケージ**であり、直接importは不可。
→ **両パッケージで同一実装を維持**し、テストで一貫性を保証する方針に変更。

### 変更1: `src/utils/html-escape.ts` (IDE版)

**対応**: 実装をWeb版と完全一致させる（現状既に一致を確認済み）

```typescript
// --- 現在の4-11行目 ---
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- 置換後（ドキュメント追加のみ） ---
/**
 * HTML特殊文字をエスケープ（XSS防止）
 *
 * 注意: この実装は packages/maid-agent-messenger/src/markdown-utils.ts の
 * escapeHtml() と同一である必要があります。変更時は両方を更新してください。
 * @see packages/maid-agent-messenger/src/markdown-utils.ts
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

### 変更2: `packages/maid-agent-messenger/src/markdown-utils.ts` (Web版)

**対応**: 相互参照コメント追加（9-16行目を置換）

```typescript
// --- 現在の9-16行目 ---
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- 置換後（コメント追加） ---
/**
 * HTML特殊文字をエスケープ（XSS防止）
 *
 * 注意: この実装は src/utils/html-escape.ts の escapeHtml() と同一である必要があります。
 * 変更時は両方を更新してください。
 * @see src/utils/html-escape.ts (IDE版)
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

### テストコード

既存テスト `packages/maid-agent-messenger/src/__tests__/markdown-utils.test.ts` に escapeHtml のテストが存在するため、追加不要。

IDE版 `src/utils/__tests__/html-escape.test.ts` は既存テストを維持。

---

## 4. Phase 2-1: shared-styles.ts作成

### 変更1: 新規ファイル作成

**ファイル**: `packages/maid-agent-messenger/src/views/shared-styles.ts`

```typescript
/**
 * 共通CSSスタイル定義
 *
 * Web版/IDE版ダッシュボードで共通利用するCSS変数・基本スタイル。
 * dashboard-styles.ts, web-dashboard.ts から参照される。
 */

/**
 * ダッシュボード共通CSS変数
 */
export function getSharedCssVariables(): string {
  return `
    :root {
      --bg-color: #1e1e1e;
      --card-bg: #252526;
      --border-color: #3c3c3c;
      --text-color: #cccccc;
      --text-muted: #808080;
      --accent-color: #569cd6;
      --success-color: #4ec9b0;
      --warning-color: #dcdcaa;
      --error-color: #f14c4c;
    }
  `;
}

/**
 * 基本リセットスタイル
 */
export function getBaseResetStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      background: var(--bg-color);
      color: var(--text-color);
      padding: 20px;
      min-height: 100vh;
    }
  `;
}

/**
 * カード共通スタイル
 */
export function getCardStyles(): string {
  return `
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      overflow: hidden;
      min-width: 0;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--border-color);
    }
    .card-title { font-size: 0.95rem; font-weight: 600; }
    .card-count { background: var(--accent-color); color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.75rem; }
  `;
}
```

### テストコード

スタイル関数は文字列を返すだけなので、単体テストは不要。ビルド検証で動作確認。

---

## 5. Phase 2-2: markdown-styles.ts作成

### 変更1: 新規ファイル作成

**ファイル**: `packages/maid-agent-messenger/src/views/markdown-styles.ts`

```typescript
/**
 * Markdownレンダリング用CSSスタイル定義
 *
 * レポートビューア、レポートオーバーレイで共通利用。
 * dashboard-styles.ts, web-dashboard.ts から参照される。
 */

/**
 * Markdownコンテンツ表示用スタイル
 */
export function getMarkdownStyles(): string {
  return `
    .md-h1 { font-size: 1.4em; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; margin: 16px 0 12px 0; }
    .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
    .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
    .md-p { margin: 8px 0; }
    .md-ul { margin: 6px 0; padding-left: 25px; }
    .md-li { margin: 4px 0; list-style-type: disc; }
    .md-checkbox { padding: 4px 0; }
    .md-checkbox.checked { color: #81c784; }
    .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    .md-table th, .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
    .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
    .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
    .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
    .md-hr { border: none; border-top: 1px solid #444; margin: 16px 0; }
    .md-link { color: #4fc3f7; }
    strong { color: #ffc107; }
    em { font-style: italic; color: #aaa; }
  `;
}
```

### テストコード

スタイル関数は文字列を返すだけなので、単体テストは不要。ビルド検証で動作確認。

---

## 6. Phase 2-3: dashboard-styles.tsリファクタリング

### 変更1: `packages/maid-agent-messenger/src/views/dashboard-styles.ts`

**対応**: 共通スタイルをimportして使用（1-19行目を置換）

```typescript
// --- 現在の1-19行目 ---
/**
 * ダッシュボードCSS定義
 * dashboard-html.ts から分離
 */

export function getDashboardStyles(): string {
  return `
    :root {
      --bg-color: #1e1e1e;
      --card-bg: #252526;
      --border-color: #3c3c3c;
      --text-color: #cccccc;
      --text-muted: #808080;
      --accent-color: #569cd6;
      --success-color: #4ec9b0;
      --warning-color: #dcdcaa;
      --error-color: #f14c4c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

// --- 置換後 ---
/**
 * ダッシュボードCSS定義
 * dashboard-html.ts から分離
 *
 * 共通スタイルは shared-styles.ts, markdown-styles.ts から取得。
 */

import { getSharedCssVariables, getBaseResetStyles, getCardStyles } from "./shared-styles.js";
import { getMarkdownStyles } from "./markdown-styles.js";

export function getDashboardStyles(): string {
  return `
    ${getSharedCssVariables()}
    ${getBaseResetStyles()}
```

### 変更2: `packages/maid-agent-messenger/src/views/dashboard-styles.ts`

**対応**: 重複するカードスタイルを共通スタイル呼び出しに置換（41-58行目付近）

```typescript
// --- 現在の41-58行目 ---
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      overflow: hidden;
      min-width: 0;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--border-color);
    }
    .card-title { font-size: 0.95rem; font-weight: 600; }
    .card-count { background: var(--accent-color); color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.75rem; }

// --- 置換後 ---
    ${getCardStyles()}
```

### 変更3: `packages/maid-agent-messenger/src/views/dashboard-styles.ts`

**対応**: レポートオーバーレイのmarkdownスタイルを共通スタイル呼び出しに置換（312-323行目付近）

```typescript
// --- 現在の312-323行目 ---
    .report-overlay-content .md-h1 { font-size: 1.4em; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 6px; margin: 16px 0 12px 0; }
    .report-overlay-content .md-h2 { font-size: 1.15em; color: #ffc107; border-bottom: 1px solid #444; padding-bottom: 4px; margin: 14px 0 10px 0; }
    .report-overlay-content .md-h3 { font-size: 1.05em; color: #81c784; margin: 12px 0 6px 0; }
    .report-overlay-content .md-p { margin: 8px 0; }
    .report-overlay-content .md-ul { margin: 6px 0; padding-left: 25px; }
    .report-overlay-content .md-li { margin: 4px 0; list-style-type: disc; }
    .report-overlay-content .md-table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    .report-overlay-content .md-table th, .report-overlay-content .md-table td { border: 1px solid #444; padding: 6px 10px; text-align: left; }
    .report-overlay-content .md-table th { background: rgba(255,255,255,0.1); color: #ffc107; }
    .report-overlay-content .md-code-block { background: #0a0a0a; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 0.9em; margin: 8px 0; }
    .report-overlay-content .md-inline-code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; }
    .report-overlay-content strong { color: #ffc107; }

// --- 置換後 ---
    .report-overlay-content { ${getMarkdownStyles()} }
```

**注意**: getMarkdownStyles()の出力は`.report-overlay-content`セレクタでスコープする必要があるため、CSSの構文を考慮して調整が必要。この部分は実装時に検証。

### テストコード

```typescript
// packages/maid-agent-messenger/src/__tests__/dashboard-styles.test.ts
import { describe, it, expect } from "@jest/globals";
import { getDashboardStyles } from "../views/dashboard-styles.js";

describe("getDashboardStyles", () => {
  it("CSS変数を含む", () => {
    const css = getDashboardStyles();
    expect(css).toContain("--bg-color");
    expect(css).toContain("--accent-color");
  });

  it("カードスタイルを含む", () => {
    const css = getDashboardStyles();
    expect(css).toContain(".card");
    expect(css).toContain(".card-header");
  });

  it("markdownスタイルを含む", () => {
    const css = getDashboardStyles();
    expect(css).toContain(".md-h1");
    expect(css).toContain(".md-code-block");
  });
});
```

---

## 7. 検証手順

### Phase 1 検証

```bash
cd packages/maid-agent-messenger
npm run build
npm test
```

### Phase 2 検証

```bash
cd packages/maid-agent-messenger
npm run build
npm test

# VSCode拡張のビルド確認
cd ../..
npm run compile
```

---

## 8. リスク・注意点

| リスク | 対策 |
|--------|------|
| CSS構文エラー | ビルド時にTypeScriptエラーで検出、ブラウザで視覚確認 |
| スタイル適用漏れ | 既存テストで回帰確認、視覚的にダッシュボード確認 |
| getMarkdownStyles()のセレクタスコープ | 実装時に.report-overlay-content内で正しく動作するか検証 |

---

## 9. 成果物一覧

| ファイル | 操作 |
|---------|------|
| `src/utils/html-escape.ts` | 更新（コメント追加） |
| `packages/maid-agent-messenger/src/markdown-utils.ts` | 更新（コメント追加） |
| `packages/maid-agent-messenger/src/views/shared-styles.ts` | 新規作成 |
| `packages/maid-agent-messenger/src/views/markdown-styles.ts` | 新規作成 |
| `packages/maid-agent-messenger/src/views/dashboard-styles.ts` | 更新（共通スタイル参照） |
| `packages/maid-agent-messenger/src/__tests__/dashboard-styles.test.ts` | 新規作成 |

---

以上
