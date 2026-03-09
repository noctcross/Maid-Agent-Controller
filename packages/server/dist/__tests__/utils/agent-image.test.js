/**
 * agent-image ユーティリティテスト
 * エージェントID抽出・画像検索ロジックのユニットテスト
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import * as os from "os";
import * as path from "path";
// ESMモック: fs/promises をモック化
const mockReaddir = jest.fn();
jest.unstable_mockModule("fs/promises", () => ({
    readdir: mockReaddir,
}));
// モック設定後にダイナミックインポート
const { extractAgentIdFromPath, findAgentImages, generateAgentBackgroundSnippet, AGENT_IDS, IMAGE_EXTENSIONS, } = await import("../../utils/agent-image.js");
describe("extractAgentIdFromPath", () => {
    // --- current_{agentId}.md パターン ---
    it("current_lily.md からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/current_lily.md");
        expect(result).toBe("lily");
    });
    it("current_emma.md からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/current_emma.md");
        expect(result).toBe("emma");
    });
    it("current_flora.md からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath(".maid-agent/system/data/reports/current_flora.md");
        expect(result).toBe("flora");
    });
    // --- task-{number}-{agentId}.md パターン ---
    it("task-061-lily.md からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/task-061-lily.md");
        expect(result).toBe("lily");
    });
    it("task-100-alice.md からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath(".maid-agent/master/reports/task-100-alice.md");
        expect(result).toBe("alice");
    });
    // --- task-{number}-{agentId}-{description}.md パターン ---
    it("task-081-alice-説明文.md（説明付き）からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/task-081-alice-MCP接続断の継続調査 - キ.md");
        expect(result).toBe("alice");
    });
    it("task-061-lily-パスリンク化.md（説明付き）からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/task-061-lily-パスリンク化.md");
        expect(result).toBe("lily");
    });
    it("説明文に別のエージェント名が含まれていても先頭のIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/task-099-lily-今日のemmaの観察日記.md");
        expect(result).toBe("lily");
    });
    // --- task-{number}-{subtask}-{agentId}.md パターン ---
    it("task-061-1-lily.md（サブタスク）からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/task-061-1-lily.md");
        expect(result).toBe("lily");
    });
    it("task-077-2-sophia.md（サブタスク）からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/task-077-2-sophia.md");
        expect(result).toBe("sophia");
    });
    it("task-077-2-sophia-説明文.md（サブタスク+説明付き）からエージェントIDを抽出する", () => {
        const result = extractAgentIdFromPath("/reports/task-077-2-sophia-レビュー結果.md");
        expect(result).toBe("sophia");
    });
    // --- 非マッチケース ---
    it("関係ないファイル名ではnullを返す", () => {
        const result = extractAgentIdFromPath("/docs/plans/architecture.md");
        expect(result).toBeNull();
    });
    it("存在しないエージェントIDではnullを返す", () => {
        const result = extractAgentIdFromPath("/reports/current_unknown.md");
        expect(result).toBeNull();
    });
    it("拡張子なしではnullを返す", () => {
        const result = extractAgentIdFromPath("/reports/current_lily");
        expect(result).toBeNull();
    });
    it("ディレクトリパスではnullを返す", () => {
        const result = extractAgentIdFromPath("/reports/");
        expect(result).toBeNull();
    });
    // --- 全エージェントID ---
    it("全メイドIDが抽出可能である", () => {
        const maids = ["emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];
        for (const maid of maids) {
            expect(extractAgentIdFromPath(`/reports/current_${maid}.md`)).toBe(maid);
            expect(extractAgentIdFromPath(`/reports/task-001-${maid}.md`)).toBe(maid);
        }
    });
});
describe("findAgentImages", () => {
    beforeEach(() => {
        mockReaddir.mockReset();
    });
    it("エージェントのバージョン画像を検出する", async () => {
        mockReaddir.mockResolvedValue([
            "lily_1.png",
            "lily_2.png",
            "emma_1.png",
            "README.md",
        ]);
        const result = await findAgentImages("/project/.maid-agent/system/resources/images", "lily");
        expect(result).toEqual(["lily_1.png", "lily_2.png"]);
    });
    it("ベース画像も検出する", async () => {
        mockReaddir.mockResolvedValue([
            "chief.png",
            "chief_1.png",
        ]);
        const result = await findAgentImages("/images", "chief");
        expect(result).toEqual(["chief.png", "chief_1.png"]);
    });
    it("対応する画像がない場合は空配列を返す", async () => {
        mockReaddir.mockResolvedValue([
            "emma_1.png",
            "flora_1.png",
        ]);
        const result = await findAgentImages("/images", "lily");
        expect(result).toEqual([]);
    });
    it("ディレクトリ読み込みエラー時は空配列を返す", async () => {
        mockReaddir.mockRejectedValue(new Error("ENOENT"));
        const result = await findAgentImages("/nonexistent", "lily");
        expect(result).toEqual([]);
    });
    it("複数の拡張子をサポートする", async () => {
        mockReaddir.mockResolvedValue([
            "lily_1.png",
            "lily_2.jpg",
            "lily_3.webp",
        ]);
        const result = await findAgentImages("/images", "lily");
        expect(result).toEqual(["lily_1.png", "lily_2.jpg", "lily_3.webp"]);
    });
    it("ステータス画像は除外する（バージョン番号のみ）", async () => {
        mockReaddir.mockResolvedValue([
            "lily_1.png",
            "lily_working.png",
            "lily_completed.png",
        ]);
        const result = await findAgentImages("/images", "lily");
        // ステータス画像は含めない（バージョンとベースのみ）
        expect(result).toEqual(["lily_1.png"]);
    });
});
describe("AGENT_IDS", () => {
    it("全メイドIDが含まれている", () => {
        expect(AGENT_IDS).toContain("emma");
        expect(AGENT_IDS).toContain("sophia");
        expect(AGENT_IDS).toContain("lily");
        expect(AGENT_IDS).toContain("rose");
        expect(AGENT_IDS).toContain("alice");
        expect(AGENT_IDS).toContain("may");
        expect(AGENT_IDS).toContain("flora");
        expect(AGENT_IDS).toContain("luna");
    });
});
describe("IMAGE_EXTENSIONS", () => {
    it("主要な画像形式が含まれている", () => {
        expect(IMAGE_EXTENSIONS).toContain("png");
        expect(IMAGE_EXTENSIONS).toContain("jpg");
        expect(IMAGE_EXTENSIONS).toContain("webp");
    });
});
describe("generateAgentBackgroundSnippet", () => {
    it("CSSにposition:fixedが含まれる（スクロール追従）", () => {
        const { css } = generateAgentBackgroundSnippet("/agent-image?agent=lily");
        expect(css).toContain("position: fixed");
    });
    it("CSSにpointer-events:noneが含まれる（クリック透過）", () => {
        const { css } = generateAgentBackgroundSnippet("/agent-image?agent=lily");
        expect(css).toContain("pointer-events: none");
    });
    it("CSSにopacityが含まれる（半透明）", () => {
        const { css } = generateAgentBackgroundSnippet("/agent-image?agent=lily");
        expect(css).toContain("opacity");
    });
    it("bodyHtmlにimg要素が含まれる", () => {
        const { bodyHtml } = generateAgentBackgroundSnippet("/agent-image?agent=lily");
        expect(bodyHtml).toContain("<img");
        expect(bodyHtml).toContain("/agent-image?agent=lily");
    });
    it("bodyHtmlのimgにagent-background classが付いている", () => {
        const { bodyHtml } = generateAgentBackgroundSnippet("/agent-image?agent=lily");
        expect(bodyHtml).toContain('class="agent-background"');
    });
    it("画像URLが正しくsrc属性に設定される", () => {
        const testProject = path.join(os.tmpdir(), "test");
        const url = `/agent-image?agent=emma&project=${encodeURIComponent(testProject)}`;
        const { bodyHtml } = generateAgentBackgroundSnippet(url);
        expect(bodyHtml).toContain(`src="${url}"`);
    });
});
