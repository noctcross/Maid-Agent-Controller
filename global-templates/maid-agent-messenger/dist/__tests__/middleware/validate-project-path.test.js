/**
 * validateProjectPath テスト
 *
 * プロジェクトパスのバリデーションロジックを検証
 * - 空/falsy値、未展開変数、存在しないパス、有効なパス
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
// fs モック（ESMパターン: jest.unstable_mockModule + dynamic import）
const mockExistsSync = jest.fn();
jest.unstable_mockModule("fs", () => ({
    existsSync: mockExistsSync,
}));
// dynamic import（モック設定後に読み込み）
const { validateProjectPath } = await import("../../middleware/project-path.js");
describe("validateProjectPath", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it("空文字列でエラーを返す", () => {
        const error = validateProjectPath("");
        expect(error).toBe("X-Maid-Project-Path header is required");
    });
    it("falsy 値でエラーを返す", () => {
        const error = validateProjectPath(undefined);
        expect(error).toBe("X-Maid-Project-Path header is required");
    });
    it("未展開の ${CLAUDE_PROJECT_DIR} を検出する", () => {
        const error = validateProjectPath("${CLAUDE_PROJECT_DIR}");
        expect(error).toContain("unexpanded variable");
        expect(error).toContain("Claude Code v1.0.48+");
    });
    it("${...} 形式の未展開変数を検出する", () => {
        const error = validateProjectPath("${SOME_OTHER_VAR}/path");
        expect(error).toContain("unexpanded variable");
    });
    it("$CLAUDE で始まる未展開変数を検出する", () => {
        const error = validateProjectPath("$CLAUDE_PROJECT_DIR");
        expect(error).toContain("unexpanded variable");
    });
    it(".maid-agent/ が存在しないパスでエラーを返す", () => {
        mockExistsSync.mockReturnValue(false);
        const error = validateProjectPath("/nonexistent/path");
        expect(error).toContain("does not contain .maid-agent/ directory");
        expect(error).toContain("re-run Init command");
        expect(mockExistsSync).toHaveBeenCalledWith("/nonexistent/path/.maid-agent");
    });
    it(".maid-agent/ が存在する有効なパスで null を返す", () => {
        mockExistsSync.mockReturnValue(true);
        const error = validateProjectPath("/valid/project/path");
        expect(error).toBeNull();
        expect(mockExistsSync).toHaveBeenCalledWith("/valid/project/path/.maid-agent");
    });
});
