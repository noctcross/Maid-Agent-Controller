---
codd:
  node_id: "research:maid-agent-controller-dashboard-html-path-fix"
  modules: []
  status: active
  depends_on: []
  depended_by: []
---

# MaidAgentController + MobileSylvia 改修調査レポート

調査日: 2026-05-13  
担当: flora (task-804)  
対象バージョン: MaidAgentController v2.1.0（フリーズ中、バグ修正のみ対象）

---

## 概要

ダッシュボードおよびモバイルアプリの使い勝手改善として、以下 3 項目の実装可否・修正箇所・工数を調査した。

| 項目 | タイトル | 判定 |
|------|---------|------|
| 1 | ダッシュボード HTML ファイル text/plain 表示問題 | ◯ 修正可能（低リスク） |
| 2 | 報告書内日本語パスのリンク化 | ◯ 修正可能（低〜中リスク） |
| 3 | MobileSylvia への適用 | ◯ 修正可能（項目別差異あり） |

---

## 項目 1: HTML ファイル text/plain 表示問題

### 現状と根本原因

ダッシュボードから HTML ファイル（例: `docs/presentations/2026-05-13-hackathon-progress.html`）を開くと、HTML タグがそのまま文字列として表示される。

**処理フロー:**
1. ユーザーがダッシュボードでファイルをクリック
2. `packages/vscode/src/ui/dashboard/file-viewer.ts` の `openFileWithPreview()` 呼び出し
3. MCPサーバー `GET /file` から SPA HTML シェルを取得し WebView に設定
4. SPA クライアント JS が `GET /api/files/content` を呼び出し
5. **問題箇所**: レスポンスの `isMarkdown=false` を受け、以下の分岐に入る

**根本原因コード:**
```
ファイル: packages/maid-agent-messenger/src/routes/file-routes.ts
行番号: 149-156（generateFileViewerHtml() 内の埋め込み JS）

if (data.isMarkdown && data.htmlContent) {
    contentEl.innerHTML = data.htmlContent;    // ← Markdown のみ HTML レンダリング
} else {
    var pre = document.createElement('pre');
    pre.textContent = data.content;            // ← HTML 含む全ファイルをテキスト表示
    contentEl.innerHTML = '';
    contentEl.appendChild(pre);
}
```

`pre.textContent` への代入は自動的に HTML エスケープされるため、HTML ファイルが常にプレーンテキストとして表示される。

**API 側（file-api-routes.ts）の状況:**
```
ファイル: packages/maid-agent-messenger/src/routes/file-api-routes.ts
行番号: 265
const isMarkdown = /\.(md|markdown)$/i.test(fileName);  // .html は対象外
行番号: 268-272
if (isMarkdown) {
    htmlContent = linkifyProjectPaths(...);  // .html ファイルでは htmlContent=undefined のまま
}
```

なお `.html` 拡張子は `ALLOWED_EXTENSIONS`（行 30）に含まれており、ファイル自体は読み込める。

### 修正方法

**修正 A（推奨）: iframe srcdoc によるサンドボックス表示**

`file-api-routes.ts` に `isHtml` フラグ追加（2 行）:
```
ファイル: packages/maid-agent-messenger/src/routes/file-api-routes.ts
行番号: 265 の直後に追加

const isHtml = /\.html?$/i.test(fileName);
```
レスポンス JSON に `isHtml` を追加（行 284 付近）:
```typescript
res.json({
  ...
  isMarkdown,
  isHtml,       // 追加
  htmlContent,
  ...
});
```

`file-routes.ts` の SPA JS を更新（約 10 行）:
```
ファイル: packages/maid-agent-messenger/src/routes/file-routes.ts
行番号: 149-157 の else 分岐を変更

} else if (data.isHtml) {
    var iframe = document.createElement('iframe');
    iframe.setAttribute('srcdoc', data.content);
    iframe.setAttribute('sandbox', 'allow-same-origin');  // JS 実行をブロック
    iframe.style.cssText = 'width:100%;height:80vh;border:none;background:#fff;border-radius:6px;';
    contentEl.innerHTML = '';
    contentEl.appendChild(iframe);
} else {
    // 既存のプレーンテキスト表示（変更なし）
```

**修正 B（代替）: `/api/files/raw` エンドポイントに text/html MIME 追加**

`file-api-routes.ts` の `IMAGE_MIME_TYPES`（行 42）に HTML を追加し、外部ブラウザで開く方式。VSCode Webview 内には iframe が適切なため、A 案を推奨。

### 工数・リスク

| 項目 | 内容 |
|------|------|
| 工数 | 2h（実装 1h + テスト 1h） |
| リスク | 低: iframe sandbox 属性により JS 実行ブロック、XSS なし |
| 変更ファイル数 | 2 ファイル |
| テスト方針 | ハッカソン進捗 HTML ファイルをダッシュボードで開いてレンダリング確認 |

---

## 項目 2: 報告書内日本語パスのリンク化

### 現状と根本原因

報告書（`.maid-agent/system/data/reports/current_*.md`）内に記載した `自動運転部/ec-ops/docs/...` のような日本語ディレクトリ名で始まるパスがリンク化されず、クリックできない。

**処理フロー:**
1. `GET /api/files/content` でレポートを取得
2. `convertMarkdownToHtml()` で Markdown → HTML 変換
3. `linkifyProjectPaths()` でパスをリンク化 → **ここで日本語 prefix が検出されない**

**根本原因コード:**
```
ファイル: packages/maid-agent-messenger/src/markdown-utils.ts
行番号: 156-165

export const DEFAULT_PATH_PREFIXES: string[] = [
  "docs",
  "\\.maid-agent",
  "src",
  "packages",
  "tests?",
  "scripts",
  "\\.github",
  "config",
];
```

パス検出 regex（行 244-250）は上記 prefix のいずれかで始まるパスのみ対象:
```
(?:docs|\.maid-agent|src|packages|...)(?:/[...u3000-u9FFF]+)+\.ext
```

`自動運転部` は prefix リストにないため、`自動運転部/ec-ops/docs/xxx.md` は **先頭の `自動運転部` でマッチ失敗**。

**重要な注記**: パスの「内容部分」（prefix 後のセグメント）には既に CJK Unicode 範囲が含まれている（行 246: `　-鿿`）。問題は prefix 部分のみ。

### 修正方法

`DEFAULT_PATH_PREFIXES` に CJK 文字始まりパターンを追加（1 行）:

```
ファイル: packages/maid-agent-messenger/src/markdown-utils.ts
行番号: 164 の直後に追加（DEFAULT_PATH_PREFIXES 配列内）

"[\\u3000-\\u9FFF][\\w\\u3000-\\u9FFF]*",  // 日本語始まりディレクトリ対応
```

変更後:
```typescript
export const DEFAULT_PATH_PREFIXES: string[] = [
  "docs",
  "\\.maid-agent",
  "src",
  "packages",
  "tests?",
  "scripts",
  "\\.github",
  "config",
  "[\\u3000-\\u9FFF][\\w\\u3000-\\u9FFF]*",  // 追加: 自動運転部/ec-ops/ 等
];
```

**対応例:**
- `自動運転部/ec-ops/docs/design.md` → ◯ リンク化される
- `自動運転部/ec-ops/agents/scout/agent.py` → ◯ リンク化される
- 単独の日本語単語（`テスト` 等）はスラッシュ + 拡張子が続かないため誤検出しない

### 工数・リスク

| 項目 | 内容 |
|------|------|
| 工数 | 1h（実装 0.5h + テスト 0.5h） |
| リスク | 低〜中: CJK prefix パターンの過検出可能性。日本語ディレクトリ名 + `/` + ファイル名の構造が必要なため誤検出は限定的 |
| 変更ファイル数 | 1 ファイル |
| テスト方針 | `current_flora.md` 内の `自動運転部/ec-ops/...` パスがリンク化されることを確認 |
| 既存テスト | `packages/maid-agent-messenger` のユニットテストを実行して回帰確認 |

---

## 項目 3: MobileSylvia への適用

### アプリ構成概要

```
apps/MobileSylvia/
├── app/
│   ├── task/[id]/report.tsx   # 報告書表示（linkifyDocumentPaths 実装あり）
│   ├── document.tsx           # 汎用ドキュメントビューア
│   └── (tabs)/files.tsx       # ファイルエクスプローラー
└── src/components/files/
    ├── MarkdownViewer.tsx      # Markdown → WebView レンダリング
    └── ImageViewer.tsx         # 画像表示
```

### 3-1: HTML ファイル表示問題（MobileSylvia）

**現状調査:**
- `MarkdownViewer.tsx`（行 114-139）: `react-native-webview` の `WebView` を使用し、`source={{ html: markdownHtml }}` でレンダリング
- `report.tsx` の `USE_MARKDOWN_LIBRARY = true`（行 21）により `react-native-markdown-display` が優先使用される
- `document.tsx` はプロジェクト内ドキュメント（Markdown）の表示を担当

**HTML ファイルのプレビュー機能は MobileSylvia には未実装**。  
VSCode 拡張のダッシュボードと異なり、MobileSylvia のファイルビューア（`files.tsx`）から HTML ファイルを開いた場合、`MarkdownViewer` に通されて Markdown テンプレートでラップされ、HTML タグが文字列表示になる可能性がある。

**判定: △（要確認後修正）**  
実際の `files.tsx` の HTML ファイル開き方を確認した上で、`MarkdownViewer.tsx` の `source={{ html }}` の利用方式を HTML ファイル向けに分岐させる修正が必要。

**修正方針案:**
```
ファイル: apps/MobileSylvia/src/components/files/MarkdownViewer.tsx

拡張子判定を追加し、.html/.htm の場合は
source={{ html: rawContent }}  // マークダウンテンプレートなしで直接渡す
+ javaScriptEnabled={false} + sandbox 相当の設定を維持
```

**工数:** 2h（動作確認込み）

### 3-2: 日本語パスのリンク化（MobileSylvia）

**現状調査:**  
`app/task/[id]/report.tsx` の `linkifyDocumentPaths()` 関数（行 34-54）:

```
ファイル: apps/MobileSylvia/app/task/[id]/report.tsx
行番号: 36-38

const dirPattern = '(?:docs|\\.maid-agent|packages|src|MobileSylvia)';
const pathPattern = `${dirPattern}\\/[\\w\\-\\.\\/]+\\.md`;
//                                    ↑ ASCII のみ、Unicode 未対応
```

**2 つの問題がある:**

1. `dirPattern` が英語プレフィクスのみ（VSCode 拡張と同じ問題）
2. パス内容の regex `[\w\-\.\\/]+` が ASCII 範囲のみ（VSCode 拡張の `　-鿿` に相当する対応がない）

**修正箇所（2 点）:**

```
ファイル: apps/MobileSylvia/app/task/[id]/report.tsx
行番号: 36（dirPattern）

変更前: const dirPattern = '(?:docs|\\.maid-agent|packages|src|MobileSylvia)';
変更後: const dirPattern = '(?:docs|\\.maid-agent|packages|src|MobileSylvia|[\\u3000-\\u9FFF][\\w\\u3000-\\u9FFF]*)';
```

```
行番号: 38（pathPattern 内のパス内容部分）

変更前: const pathPattern = `${dirPattern}\\/[\\w\\-\\.\\/]+\\.md`;
変更後: const pathPattern = `${dirPattern}\\/[\\w\\-\\.\\/\\u3000-\\u9FFF]+\\.md`;
```

**対応例:**
- `自動運転部/ec-ops/docs/overview.md` → ◯ リンク化される
- `` `自動運転部/ec-ops/docs/overview.md` `` → ◯ バッククォートも処理される

**工数・リスク:**

| 項目 | 内容 |
|------|------|
| 工数 | 1h（実装 0.5h + 動作確認 0.5h） |
| リスク | 低: ASCII-only regex の拡張のみ、既存パスへの影響なし |
| 変更ファイル数 | 1 ファイル（report.tsx） |

---

## 修正箇所サマリー

| 項目 | ファイルパス | 行番号 | 変更内容 | 工数 |
|------|------------|--------|---------|------|
| 1 - API | `packages/maid-agent-messenger/src/routes/file-api-routes.ts` | 265 付近 | `isHtml` フラグ追加（2 行） | 0.5h |
| 1 - SPA JS | `packages/maid-agent-messenger/src/routes/file-routes.ts` | 149-156 | iframe srcdoc 分岐追加（10 行） | 1h |
| 2 - prefix | `packages/maid-agent-messenger/src/markdown-utils.ts` | 164 | CJK prefix パターン追加（1 行） | 0.5h |
| 3a - iOS HTML | `apps/MobileSylvia/src/components/files/MarkdownViewer.tsx` | 114-139 | HTML 拡張子分岐（要確認後） | 2h |
| 3b - iOS path | `apps/MobileSylvia/app/task/[id]/report.tsx` | 36-38 | Unicode パス対応（2 行） | 1h |

**合計工数: 約 5h**（うち 1 - 2 + 3b = 3h は確定、3a は動作確認後に詳細判断）

---

## リスク評価まとめ

| 項目 | リスク | 理由 |
|------|--------|------|
| 1（HTML iframe） | 低 | sandbox 属性により JS 実行なし。既存 Markdown 表示に無影響 |
| 2（CJK prefix） | 低〜中 | 日本語単語の誤検出可能性あり。パス構造（`/` + 拡張子）が必須なため限定的 |
| 3a（HTML MobileSylvia） | 中 | 実装確認が必要。WebView の sandbox 設定に注意 |
| 3b（CJK MobileSylvia path） | 低 | ASCII regex の Unicode 拡張のみ |

---

## 実装判断材料

### MaidAgentController v2.1.0 フリーズ方針との整合

現在 v2.1.0 でフリーズ中（バグ修正のみ）。本修正はバグ修正相当:

- **項目 1**: HTML ファイルが正しく表示されないバグの修正 → **バグ修正範囲内 ◯**
- **項目 2**: 日本語パスが検出されないバグの修正 → **バグ修正範囲内 ◯**
- **項目 3b**: MobileSylvia の同バグ修正 → **バグ修正範囲内 ◯**
- **項目 3a**: HTML プレビュー機能の追加（機能追加判断必要） → **要ご主人様判断**

### CodeLodis 連動方針

項目 1・2 の修正は `packages/maid-agent-messenger/` の実装。CodeLodis への移行時に同等ロジックを持ち込む場合、修正済みの実装を参考にできる。

### 推奨実装順序

1. 項目 2（CJK prefix、1 行変更、最小リスク）
2. 項目 3b（MobileSylvia 日本語パス、2 行変更）
3. 項目 1（HTML iframe、2 ファイル変更）
4. 項目 3a（HTML MobileSylvia、動作確認後判断）
