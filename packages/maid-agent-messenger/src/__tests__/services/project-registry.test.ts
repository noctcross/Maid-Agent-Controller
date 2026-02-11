/**
 * プロジェクトレジストリ テスト
 */
import { jest, describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import os from "os";

// テスト用の一時ディレクトリ
const TEST_HOME = path.join(os.tmpdir(), `maid-test-registry-${Date.now()}`);
const TEST_REGISTRY_PATH = path.join(TEST_HOME, ".maid-agent", "system", "data", "projects.json");

// 環境変数をモック
jest.unstable_mockModule("../../utils/path-helpers.js", () => ({
  getGlobalDataPath: () => path.join(TEST_HOME, ".maid-agent", "system", "data"),
  getProjectRegistryPath: () => TEST_REGISTRY_PATH,
  getQueueMaidPath: (p: string) => `${p}/.maid-agent/system/data/maid`,
  getCurrentReportsPath: (p: string) => `${p}/.maid-agent/system/data/reports`,
  getArchiveReportsPath: (p: string) => `${p}/.maid-agent/master/reports`,
}));

const {
  loadProjectRegistry,
  saveProjectRegistry,
  recordProjectAccess,
  listProjects,
  togglePin,
  toggleHide,
} = await import("../../services/project-registry.js");

describe("project-registry", () => {
  beforeEach(() => {
    // テスト用ディレクトリを作成/再作成
    const dir = path.dirname(TEST_REGISTRY_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    // 空のレジストリで初期化（前のテストのデータをクリア）
    writeFileSync(TEST_REGISTRY_PATH, JSON.stringify({ version: 1, projects: [] }), "utf-8");
  });

  afterAll(() => {
    // クリーンアップ
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe("loadProjectRegistry", () => {
    it("ファイルが存在しない場合は空のレジストリを返す", async () => {
      // ファイルを削除して「存在しない」状態をシミュレート
      if (existsSync(TEST_REGISTRY_PATH)) {
        rmSync(TEST_REGISTRY_PATH);
      }
      const registry = await loadProjectRegistry();
      expect(registry.version).toBe(1);
      expect(registry.projects).toEqual([]);
    });

    it("既存のファイルを読み込む", async () => {
      const testData = { version: 1, projects: [{ path: "/test", name: "test", pinned: false, hidden: false, lastAccessedAt: "2026-01-01", firstAccessedAt: "2026-01-01", accessCount: 1 }] };
      await saveProjectRegistry(testData as any);
      const registry = await loadProjectRegistry();
      expect(registry.projects).toHaveLength(1);
      expect(registry.projects[0].path).toBe("/test");
    });
  });

  describe("recordProjectAccess", () => {
    it("新規プロジェクトを追加する", async () => {
      await recordProjectAccess("/new/project");
      const registry = await loadProjectRegistry();
      expect(registry.projects).toHaveLength(1);
      expect(registry.projects[0].name).toBe("project");
      expect(registry.projects[0].accessCount).toBe(1);
    });

    it("既存プロジェクトのアクセス回数を更新する", async () => {
      await recordProjectAccess("/existing/project");
      await recordProjectAccess("/existing/project");
      const registry = await loadProjectRegistry();
      expect(registry.projects).toHaveLength(1);
      expect(registry.projects[0].accessCount).toBe(2);
    });
  });

  describe("listProjects", () => {
    it("hidden: true のプロジェクトを除外する", async () => {
      await recordProjectAccess("/visible");
      await recordProjectAccess("/hidden");
      await toggleHide("/hidden");
      const projects = await listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe("/visible");
    });

    it("ピン留め優先、その後 lastAccessedAt 降順でソートする", async () => {
      await recordProjectAccess("/old");
      await new Promise((r) => setTimeout(r, 10));
      await recordProjectAccess("/new");
      await togglePin("/old");
      const projects = await listProjects();
      expect(projects[0].path).toBe("/old"); // ピン留め優先
      expect(projects[1].path).toBe("/new");
    });
  });

  describe("togglePin", () => {
    it("ピン留め状態をトグルする", async () => {
      await recordProjectAccess("/test");
      let result = await togglePin("/test");
      expect(result).toBe(true);
      let registry = await loadProjectRegistry();
      expect(registry.projects[0].pinned).toBe(true);

      result = await togglePin("/test");
      registry = await loadProjectRegistry();
      expect(registry.projects[0].pinned).toBe(false);
    });

    it("存在しないプロジェクトにはfalseを返す", async () => {
      const result = await togglePin("/nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("toggleHide", () => {
    it("非表示状態をトグルする", async () => {
      await recordProjectAccess("/test");
      await toggleHide("/test");
      const registry = await loadProjectRegistry();
      expect(registry.projects[0].hidden).toBe(true);
    });
  });
});
