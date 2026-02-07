/**
 * markdown-utils テスト
 * linkifyProjectPaths() と resolveToWindowsPath() のユニットテスト
 */
import { describe, it, expect } from "@jest/globals";
import { linkifyProjectPaths, resolveToWindowsPath, DEFAULT_PATH_PREFIXES, } from "../markdown-utils.js";
// テスト用のプロジェクトパス（WSL形式）
const PROJECT_PATH = "/mnt/c/Users/noct/Development/TestProject";
describe("resolveToWindowsPath", () => {
    it("WSLプロジェクトパスで相対パスをWindowsパスに変換する", () => {
        const result = resolveToWindowsPath("docs/a.md", "/mnt/c/Users/noct/Project");
        expect(result).toBe("C:/Users/noct/Project/docs/a.md");
    });
    it("Windowsプロジェクトパスでも正しく動作する", () => {
        const result = resolveToWindowsPath("docs/a.md", "C:/Users/noct/Project");
        expect(result).toBe("C:/Users/noct/Project/docs/a.md");
    });
    it("小文字ドライブレターを大文字に正規化する", () => {
        const result = resolveToWindowsPath("src/index.ts", "c:/Users/noct/Project");
        expect(result).toBe("C:/Users/noct/Project/src/index.ts");
    });
    it("ネストの深いパスを正しく変換する", () => {
        const result = resolveToWindowsPath(".maid-agent/master/reports/task-061-lily.md", "/mnt/c/Users/noct/Project");
        expect(result).toBe("C:/Users/noct/Project/.maid-agent/master/reports/task-061-lily.md");
    });
});
describe("linkifyProjectPaths", () => {
    // --- 基本パス検出 ---
    it("docs/ パスをリンク化する", () => {
        const input = "<p>docs/plans/xxx.md を参照</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toContain('<a href="/file?path=');
        expect(result).toContain('class="path-link"');
        expect(result).toContain(">docs/plans/xxx.md</a>");
        expect(result).toContain("を参照</p>");
    });
    it(".maid-agent/ パスをリンク化する", () => {
        const input = "<p>.maid-agent/master/reports/xxx.md</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toContain('<a href="/file?path=');
        expect(result).toContain(">.maid-agent/master/reports/xxx.md</a>");
    });
    it("src/ パスをリンク化する", () => {
        const input = "<p>src/views/dashboard-html.ts を変更</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toContain(">src/views/dashboard-html.ts</a>");
    });
    it("拡張子なしのディレクトリパスをリンク化する", () => {
        const input = "<p>src/routes/ を確認</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        // 正規表現は末尾スラッシュを含まないため src/routes までマッチ
        expect(result).toContain(">src/routes</a>");
    });
    it("複数パスを同時にリンク化する", () => {
        const input = "<p>docs/a.md と src/b.ts を参照</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toContain(">docs/a.md</a>");
        expect(result).toContain(">src/b.ts</a>");
    });
    it("存在しないパスもリンク化する（存在チェックはしない）", () => {
        const input = "<p>docs/nonexistent.md</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toContain(">docs/nonexistent.md</a>");
    });
    // --- リンクにprojectパラメータが付与される ---
    it("リンクにprojectクエリパラメータが含まれる", () => {
        const input = "<p>docs/a.md</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toContain(`&project=${encodeURIComponent(PROJECT_PATH)}`);
    });
    it("リンクにopenFile onclickハンドラが含まれる", () => {
        const input = "<p>docs/a.md</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toContain('onclick="return openFile(this,');
    });
    // --- 除外条件 ---
    it("<pre><code>内のパスはリンク化しない", () => {
        const input = "<pre><code>src/index.ts</code></pre>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toBe(input);
    });
    it("<code>内のパスはリンク化しない（インラインコード）", () => {
        const input = "<code>src/index.ts</code>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toBe(input);
    });
    it("属性付き<code>内のパスはリンク化しない（061-L2対応）", () => {
        const input = '<code class="language-typescript">src/index.ts</code>';
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toBe(input);
    });
    it("属性付き<pre>内のパスはリンク化しない", () => {
        const input = '<pre class="highlight"><code>docs/plans/xxx.md</code></pre>';
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toBe(input);
    });
    it("<a>タグ内のパスは二重リンク化しない", () => {
        const input = '<a href="/file?path=xxx">docs/xxx.md</a>';
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toBe(input);
    });
    it("属性付き<a>タグ内のパスは二重リンク化しない", () => {
        const input = '<a href="/file?path=xxx" class="report-link">docs/xxx.md</a>';
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toBe(input);
    });
    // --- 混在ケース ---
    it("保護タグと非保護テキストが混在する場合、非保護部分のみリンク化する", () => {
        const input = "<p><code>src/a.ts</code> と docs/b.md を参照</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        // <code>内はリンク化しない
        expect(result).toContain("<code>src/a.ts</code>");
        // テキスト部分はリンク化する
        expect(result).toContain(">docs/b.md</a>");
    });
    // --- カスタムプレフィクス ---
    it("第3引数でカスタムプレフィクスを指定できる", () => {
        const input = "<p>custom/path/file.md</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH, ["custom"]);
        expect(result).toContain(">custom/path/file.md</a>");
    });
    it("デフォルトプレフィクスにない文字列はリンク化しない", () => {
        const input = "<p>unknown/path/file.md</p>";
        const result = linkifyProjectPaths(input, PROJECT_PATH);
        expect(result).toBe(input);
    });
    // --- DEFAULT_PATH_PREFIXES ---
    it("DEFAULT_PATH_PREFIXES がエクスポートされている", () => {
        expect(Array.isArray(DEFAULT_PATH_PREFIXES)).toBe(true);
        expect(DEFAULT_PATH_PREFIXES.length).toBeGreaterThan(0);
    });
});
