/**
 * quality-service worktree パス対応テスト
 *
 * task-1641-1: maidctl set my-status completed 実行時のLLM品質チェックが
 * worktreeパスを考慮せずメインリポジトリを参照している問題の修正を検証する。
 *
 * readFileContentsForReview に worktreePath オプションを渡した場合、
 * 「リポジトリ名prefix付きの相対パス（例: codelodis/packages/foo.ts）」を
 * worktreeルート配下（prefixを除去した上で）から優先的に解決できることを確認する。
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ESMモード: fs/promises をモック化
const mockReadFile = jest.fn<(path: string, encoding: string) => Promise<string>>();

jest.unstable_mockModule("fs/promises", () => ({
  readFile: mockReadFile,
}));

// dynamic import（モック設定後に読み込み）
const { readFileContentsForReview } = await import("../quality-service.js");

const PROJECT_PATH = "/project";
const WORKTREE_PATH = "/worktrees/task-1641-1";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("readFileContentsForReview - worktreePath 対応", () => {
  it("worktreePath未指定時は従来通りprojectPath基準で解決する（後方互換）", async () => {
    mockReadFile.mockImplementation(async (p: string) => {
      if (p === "/project/packages/foo.ts") return "content-from-project";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const results = await readFileContentsForReview(PROJECT_PATH, [
      "packages/foo.ts",
    ]);

    expect(results[0].content).toBe("content-from-project");
    expect(results[0].error).toBeUndefined();
  });

  it("リポジトリ名prefix付きパスは、prefixを除去してworktreeルート配下から読み込む", async () => {
    mockReadFile.mockImplementation(async (p: string) => {
      // worktree側にのみ実装済み、メインリポジトリ側は未変更(devのまま)という状況を再現
      if (p === "/worktrees/task-1641-1/packages/manager/foo.ts") {
        return "content-from-worktree";
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const results = await readFileContentsForReview(
      PROJECT_PATH,
      ["codelodis/packages/manager/foo.ts"],
      { worktreePath: WORKTREE_PATH }
    );

    expect(results[0].content).toBe("content-from-worktree");
    expect(results[0].error).toBeUndefined();
    // メインリポジトリ側（未変更のdev）は参照されていないことを確認
    expect(mockReadFile).not.toHaveBeenCalledWith(
      "/project/codelodis/packages/manager/foo.ts",
      expect.anything()
    );
  });

  it("prefix無しパスもworktreeルート直下からまず試みる", async () => {
    mockReadFile.mockImplementation(async (p: string) => {
      if (p === "/worktrees/task-1641-1/src/foo.ts") return "content-from-worktree-root";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const results = await readFileContentsForReview(
      PROJECT_PATH,
      ["src/foo.ts"],
      { worktreePath: WORKTREE_PATH }
    );

    expect(results[0].content).toBe("content-from-worktree-root");
  });

  it("worktree側に存在しないファイルはprojectPath側にフォールバックする", async () => {
    mockReadFile.mockImplementation(async (p: string) => {
      if (p === "/project/docs/readme.md") return "content-from-project-docs";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const results = await readFileContentsForReview(
      PROJECT_PATH,
      ["docs/readme.md"],
      { worktreePath: WORKTREE_PATH }
    );

    expect(results[0].content).toBe("content-from-project-docs");
    expect(results[0].error).toBeUndefined();
  });

  it("worktree側・projectPath側どちらにも存在しない場合はエラーを記録する", async () => {
    mockReadFile.mockImplementation(async () => {
      throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    });

    const results = await readFileContentsForReview(
      PROJECT_PATH,
      ["codelodis/missing.ts"],
      { worktreePath: WORKTREE_PATH }
    );

    expect(results[0].content).toBe("");
    expect(results[0].error).toBeDefined();
  });

  it("プロジェクト外への絶対パスアクセスは引き続き拒否される（セキュリティ regression）", async () => {
    const results = await readFileContentsForReview(
      PROJECT_PATH,
      ["/etc/passwd"],
      { worktreePath: WORKTREE_PATH }
    );

    expect(results[0].error).toContain("Security");
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("worktreePath外へのパストラバーサルは拒否され、他候補のみ試行される", async () => {
    mockReadFile.mockImplementation(async (p: string) => {
      if (p === "/project/foo.ts") return "content-from-project";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const results = await readFileContentsForReview(
      PROJECT_PATH,
      ["foo.ts"],
      { worktreePath: WORKTREE_PATH }
    );

    // "foo.ts" は segments.length === 1 のため prefix除去候補は生成されず、
    // worktreeルート直下 → projectPath の順で試行され、projectPath側で解決される
    expect(results[0].content).toBe("content-from-project");
  });
});
