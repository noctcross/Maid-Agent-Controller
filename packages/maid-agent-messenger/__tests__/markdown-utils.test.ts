/**
 * マークダウン→HTML変換ユーティリティ テスト
 *
 * task-036: ダッシュボード報告書HTML変換時の改行処理不具合
 *
 * 不具合:
 * - 番号付きリスト（1. 2. 3.）が1行に連結される
 * - インラインコード（`バッククォート`）の変換消失
 * - 単一改行がHTMLで消失する
 */

import { describe, it, expect } from "@jest/globals";
import { convertMarkdownToHtml, escapeHtml } from "../src/markdown-utils.js";

describe("escapeHtml", () => {
  it("HTMLの特殊文字をエスケープする", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
    expect(escapeHtml('a & "b"')).toBe("a &amp; &quot;b&quot;");
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it("特殊文字がない場合はそのまま返す", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("convertMarkdownToHtml", () => {
  describe("既存機能（回帰テスト）", () => {
    it("見出しをHTMLに変換する", () => {
      expect(convertMarkdownToHtml("# 見出し1")).toContain("<h1>見出し1</h1>");
      expect(convertMarkdownToHtml("## 見出し2")).toContain("<h2>見出し2</h2>");
      expect(convertMarkdownToHtml("### 見出し3")).toContain("<h3>見出し3</h3>");
    });

    it("太字・斜体を変換する", () => {
      expect(convertMarkdownToHtml("**太字**")).toContain("<strong>太字</strong>");
      expect(convertMarkdownToHtml("*斜体*")).toContain("<em>斜体</em>");
      expect(convertMarkdownToHtml("***両方***")).toContain("<strong><em>両方</em></strong>");
    });

    it("箇条書きリストをulに変換する", () => {
      const md = "- 項目1\n- 項目2\n- 項目3";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("<ul>");
      expect(html).toContain("<li>項目1</li>");
      expect(html).toContain("<li>項目2</li>");
      expect(html).toContain("<li>項目3</li>");
      expect(html).toContain("</ul>");
    });

    it("コードブロックをpreタグに変換する", () => {
      const md = "```js\nconsole.log('hello');\n```";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("<pre>");
      expect(html).toContain("<code");
    });

    it("インラインコードをcodeタグに変換する", () => {
      const md = "変数 `foo` を使う";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("<code>foo</code>");
    });

    it("水平線を変換する", () => {
      expect(convertMarkdownToHtml("---")).toContain("<hr>");
    });

    it("リンクをaタグに変換する", () => {
      const md = "[リンク](https://example.com)";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain('<a href="https://example.com"');
      expect(html).toContain("リンク</a>");
    });

    it("段落を分割する（空行区切り）", () => {
      const md = "段落1\n\n段落2";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("段落1</p>");
      expect(html).toContain("<p>段落2");
    });
  });

  describe("番号付きリスト（不具合修正）", () => {
    it("番号付きリストをolに変換する", () => {
      const md = "1. 項目A\n2. 項目B\n3. 項目C";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("<ol>");
      expect(html).toContain("<li>項目A</li>");
      expect(html).toContain("<li>項目B</li>");
      expect(html).toContain("<li>項目C</li>");
      expect(html).toContain("</ol>");
      // ulではなくolであること
      expect(html).not.toMatch(/<ul>.*項目A.*<\/ul>/s);
    });

    it("番号付きリスト内のインラインコードを保持する", () => {
      const md = "1. `$TMUX` 環境変数チェック\n2. `tmux display-message` でウィンドウ名取得";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("<ol>");
      expect(html).toContain("<code>$TMUX</code>");
      expect(html).toContain("<code>tmux display-message</code>");
    });

    it("テキストの後に番号付きリストが続く場合", () => {
      const md = "処理フロー:\n1. ステップ1\n2. ステップ2\n3. ステップ3";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("<ol>");
      expect(html).toContain("<li>ステップ1</li>");
      expect(html).toContain("<li>ステップ2</li>");
      expect(html).toContain("<li>ステップ3</li>");
      expect(html).toContain("</ol>");
    });

    it("実際のバグ再現: 報告書の番号付きリストが連結されない", () => {
      const md = `処理フロー:
1. \`$TMUX\` 環境変数チェック → なければ即exit 0（通常CC利用に影響なし）
2. \`tmux display-message -p '#{window_name}'\` でウィンドウ名取得
3. エージェント名一覧（butler, chief, ...）と照合
4. 一致した場合、役割判定
5. 役割別のMCPツール・通知先・指示書パスを含む \`additionalContext\` をJSON出力`;
      const html = convertMarkdownToHtml(md);

      // 各リスト項目が別々のli要素であること
      expect(html).toContain("<li>");
      const liCount = (html.match(/<li>/g) || []).length;
      expect(liCount).toBe(5);

      // olタグで囲まれていること
      expect(html).toContain("<ol>");
      expect(html).toContain("</ol>");

      // インラインコードが保持されていること
      expect(html).toContain("<code>");
    });
  });

  describe("単一改行の処理（不具合修正）", () => {
    it("ブロック要素外の単一改行をbrに変換する", () => {
      const md = "行1\n行2\n行3";
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("行1<br>");
      expect(html).toContain("行2<br>");
    });

    it("リスト内の改行はbrにしない", () => {
      const md = "- 項目1\n- 項目2";
      const html = convertMarkdownToHtml(md);
      // リスト項目間にbrが入らないこと
      expect(html).not.toMatch(/<\/li><br>/);
    });

    it("見出しの後の改行はbrにしない", () => {
      const md = "## 見出し\nテキスト";
      const html = convertMarkdownToHtml(md);
      expect(html).not.toMatch(/<\/h2><br>/);
    });
  });

  describe("混合コンテンツ", () => {
    it("見出し・テキスト・リストの混合を正しく変換する", () => {
      const md = `## タスク情報
- task_id: task-001
- description: レビュー

## 作業内容
1. ファイルを確認
2. コードをレビュー
3. 改善点を報告`;
      const html = convertMarkdownToHtml(md);
      expect(html).toContain("<h2>タスク情報</h2>");
      expect(html).toContain("<ul>");
      expect(html).toContain("<h2>作業内容</h2>");
      expect(html).toContain("<ol>");
      expect(html).toContain("<li>ファイルを確認</li>");
    });
  });
});
