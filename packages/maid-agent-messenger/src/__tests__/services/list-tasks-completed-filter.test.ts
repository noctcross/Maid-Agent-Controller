/**
 * executeListTasks - reviewed/starredフィルタ + IDソート テスト
 *
 * 完了タスクセクションのサーバーサイドフィルタリングとID順ソートを検証
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { stringify } from "yaml";

// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(),
}));

jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  fileExists: jest.fn(),
  getTimestamp: jest.fn(),
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  sanitizeDescription: jest.fn((s: string) => s),
  copyFile: jest.fn(),
}));

jest.unstable_mockModule("../../utils/file-lock.js", () => ({
  withFileLock: jest.fn(),
}));

// dynamic import（モック設定後に読み込み）
const { executeListTasks, compareTaskIds } = await import(
  "../../services/task-manager.js"
);
const fs = await import("fs/promises");
const { fileExists } = await import("../../utils/yaml-helper.js");

const mockedReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockedFileExists = fileExists as jest.MockedFunction<typeof fileExists>;

const PROJECT_PATH = "/test/project";

/**
 * テスト用タスクデータ
 * A: reviewed=true,  starred=true  (id: 048)
 * B: reviewed=true,  starred=false (id: 048-1)
 * C: reviewed=false, starred=true  (id: 048-2)
 * D: reviewed=false, starred=false (id: 048-10)
 * E: reviewed未設定, starred未設定 (id: 047)
 */
const createTestTasksYaml = () => {
  const data = {
    lastTaskNumber: 48,
    tasks: [
      {
        id: "048",
        parentId: null,
        title: "タスクA（reviewed+starred）",
        description: "",
        priority: "medium",
        status: "completed",
        substatus: null,
        category: "task",
        assignees: [],
        createdAt: "2026-02-05T10:00:00+09:00",
        updatedAt: "2026-02-05T12:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: "2026-02-05T11:00:00+09:00",
        reportPaths: [],
        summary: "完了",
        reviewed: true,
        starred: true,
        reviewedAt: "2026-02-05T12:00:00+09:00",
        starredAt: "2026-02-05T12:00:00+09:00",
      },
      {
        id: "048-1",
        parentId: "048",
        title: "タスクB（reviewed, not starred）",
        description: "",
        priority: "medium",
        status: "completed",
        substatus: null,
        category: "task",
        assignees: [],
        createdAt: "2026-02-05T10:10:00+09:00",
        updatedAt: "2026-02-05T12:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: "2026-02-05T11:10:00+09:00",
        reportPaths: [],
        summary: "完了",
        reviewed: true,
        starred: false,
        reviewedAt: "2026-02-05T12:00:00+09:00",
        starredAt: null,
      },
      {
        id: "048-2",
        parentId: "048",
        title: "タスクC（not reviewed, starred）",
        description: "",
        priority: "medium",
        status: "completed",
        substatus: null,
        category: "task",
        assignees: [],
        createdAt: "2026-02-05T10:20:00+09:00",
        updatedAt: "2026-02-05T12:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: "2026-02-05T11:20:00+09:00",
        reportPaths: [],
        summary: "完了",
        reviewed: false,
        starred: true,
        reviewedAt: null,
        starredAt: "2026-02-05T12:00:00+09:00",
      },
      {
        id: "048-10",
        parentId: "048",
        title: "タスクD（not reviewed, not starred）",
        description: "",
        priority: "medium",
        status: "completed",
        substatus: null,
        category: "task",
        assignees: [],
        createdAt: "2026-02-05T10:30:00+09:00",
        updatedAt: "2026-02-05T11:30:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: "2026-02-05T11:30:00+09:00",
        reportPaths: [],
        summary: "完了",
        reviewed: false,
        starred: false,
        reviewedAt: null,
        starredAt: null,
      },
      {
        id: "047",
        parentId: null,
        title: "タスクE（reviewed/starred未設定）",
        description: "",
        priority: "medium",
        status: "completed",
        substatus: null,
        category: "task",
        assignees: [],
        createdAt: "2026-02-05T09:00:00+09:00",
        updatedAt: "2026-02-05T10:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: "2026-02-05T10:00:00+09:00",
        reportPaths: [],
        summary: "完了",
      },
    ],
  };
  return stringify(data);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedFileExists.mockResolvedValue(true);
  mockedReadFile.mockResolvedValue(createTestTasksYaml());
});

describe("executeListTasks - reviewed/starred フィルタ", () => {
  describe("reviewed フィルタ", () => {
    it("reviewed=true → reviewed済みタスクのみ返す（A, B）", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: true,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.map((t) => t.id)).toEqual(
        expect.arrayContaining(["048", "048-1"])
      );
      (result.tasks as any[]).forEach((t) => {
        expect(t.reviewed).toBe(true);
      });
    });

    it("reviewed=false → 未reviewedタスクのみ返す（C, D, E）", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: false,
      });

      expect(result.tasks).toHaveLength(3);
      expect(result.tasks.map((t) => t.id)).toEqual(
        expect.arrayContaining(["048-2", "048-10", "047"])
      );
      (result.tasks as any[]).forEach((t) => {
        expect(t.reviewed).not.toBe(true);
      });
    });

    it("reviewed未指定 → 全件返す", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
      });

      expect(result.tasks).toHaveLength(5);
    });
  });

  describe("starred フィルタ", () => {
    it("starred=true → starred済みタスクのみ返す（A, C）", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        starred: true,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.map((t) => t.id)).toEqual(
        expect.arrayContaining(["048", "048-2"])
      );
      (result.tasks as any[]).forEach((t) => {
        expect(t.starred).toBe(true);
      });
    });

    it("starred=false → 未starredタスクのみ返す（B, D, E）", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        starred: false,
      });

      expect(result.tasks).toHaveLength(3);
      expect(result.tasks.map((t) => t.id)).toEqual(
        expect.arrayContaining(["048-1", "048-10", "047"])
      );
      (result.tasks as any[]).forEach((t) => {
        expect(t.starred).not.toBe(true);
      });
    });
  });

  describe("複合フィルタ（AND条件）", () => {
    it("reviewed=true + starred=true → A のみ", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: true,
        starred: true,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe("048");
    });

    it("reviewed=true + starred=false → B のみ", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: true,
        starred: false,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe("048-1");
    });

    it("reviewed=false + starred=true → C のみ", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: false,
        starred: true,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe("048-2");
    });

    it("reviewed=false + starred=false → D, E", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: false,
        starred: false,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.map((t) => t.id)).toEqual(
        expect.arrayContaining(["048-10", "047"])
      );
    });
  });

  describe("ページネーション + フィルタ", () => {
    it("フィルタ後のtotalがフィルタ前ではなくフィルタ後の件数になる", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: true,
        limit: 1,
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.total).toBe(2); // フィルタ後の全件数（A, B）
      expect(result.hasMore).toBe(true);
    });

    it("offset + フィルタで2ページ目が取得できる", async () => {
      const firstPage = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: true,
        sortField: "id",
        sortOrder: "desc",
        limit: 1,
        offset: 0,
      });

      const secondPage = await executeListTasks(PROJECT_PATH, {
        status: ["completed"],
        reviewed: true,
        sortField: "id",
        sortOrder: "desc",
        limit: 1,
        offset: 1,
      });

      expect(firstPage.tasks).toHaveLength(1);
      expect(secondPage.tasks).toHaveLength(1);
      // ID降順: 048-1 > 048（数値比較で 1 > 0 のような扱い）
      expect(firstPage.tasks[0].id).not.toBe(secondPage.tasks[0].id);
      expect(firstPage.total).toBe(2);
      expect(secondPage.total).toBe(2);
      expect(secondPage.hasMore).toBe(false);
    });
  });
});

describe("executeListTasks - sortField='id' IDソート", () => {
  it("sortField='id', sortOrder='desc' → ID降順（数値的: 048-10 > 048-2 > 048-1 > 048 > 047）", async () => {
    const result = await executeListTasks(PROJECT_PATH, {
      status: ["completed"],
      sortField: "id",
      sortOrder: "desc",
    });

    expect(result.tasks.map((t) => t.id)).toEqual([
      "048-10",
      "048-2",
      "048-1",
      "048",
      "047",
    ]);
  });

  it("sortField='id', sortOrder='asc' → ID昇順（数値的: 047 < 048 < 048-1 < 048-2 < 048-10）", async () => {
    const result = await executeListTasks(PROJECT_PATH, {
      status: ["completed"],
      sortField: "id",
      sortOrder: "asc",
    });

    expect(result.tasks.map((t) => t.id)).toEqual([
      "047",
      "048",
      "048-1",
      "048-2",
      "048-10",
    ]);
  });

  it("サブタスクの数値比較: 048-2 < 048-10（文字列比較だと '048-10' < '048-2' になるのでNG）", async () => {
    const result = await executeListTasks(PROJECT_PATH, {
      status: ["completed"],
      sortField: "id",
      sortOrder: "asc",
    });

    const ids = result.tasks.map((t) => t.id);
    const idx2 = ids.indexOf("048-2");
    const idx10 = ids.indexOf("048-10");
    expect(idx2).toBeLessThan(idx10);
  });

  it("sortField='id' + フィルタの組み合わせ", async () => {
    const result = await executeListTasks(PROJECT_PATH, {
      status: ["completed"],
      reviewed: false,
      sortField: "id",
      sortOrder: "desc",
    });

    // reviewed=false: C(048-2), D(048-10), E(047)
    // ID降順: 048-10 > 048-2 > 047
    expect(result.tasks.map((t) => t.id)).toEqual([
      "048-10",
      "048-2",
      "047",
    ]);
  });
});

describe("compareTaskIds ヘルパー", () => {
  it("同じIDは0を返す", () => {
    expect(compareTaskIds("048", "048")).toBe(0);
    expect(compareTaskIds("048-1", "048-1")).toBe(0);
  });

  it("親タスク同士の比較: 047 < 048", () => {
    expect(compareTaskIds("047", "048")).toBeLessThan(0);
    expect(compareTaskIds("048", "047")).toBeGreaterThan(0);
  });

  it("親とサブタスクの比較: 048 < 048-1", () => {
    expect(compareTaskIds("048", "048-1")).toBeLessThan(0);
    expect(compareTaskIds("048-1", "048")).toBeGreaterThan(0);
  });

  it("サブタスク同士の数値比較: 048-2 < 048-10", () => {
    expect(compareTaskIds("048-2", "048-10")).toBeLessThan(0);
    expect(compareTaskIds("048-10", "048-2")).toBeGreaterThan(0);
  });

  it("深いサブタスク: 048-1-1 < 048-1-2", () => {
    expect(compareTaskIds("048-1-1", "048-1-2")).toBeLessThan(0);
    expect(compareTaskIds("048-1-2", "048-1-1")).toBeGreaterThan(0);
  });

  it("異なる深さ: 048-1 < 048-1-1（サブタスクの方が後）", () => {
    expect(compareTaskIds("048-1", "048-1-1")).toBeLessThan(0);
    expect(compareTaskIds("048-1-1", "048-1")).toBeGreaterThan(0);
  });
});

describe("executeListTasks - sortField='completedAt' ソート", () => {
  it("completedAt降順で最新の完了タスクが先頭に来る", async () => {
    // テストデータの completedAt:
    // 048:    2026-02-05T11:00:00+09:00
    // 048-1:  2026-02-05T11:10:00+09:00
    // 048-2:  2026-02-05T11:20:00+09:00
    // 048-10: 2026-02-05T11:30:00+09:00
    // 047:    2026-02-05T10:00:00+09:00
    const result = await executeListTasks(PROJECT_PATH, {
      status: ["completed"],
      sortField: "completedAt",
      sortOrder: "desc",
    });

    expect(result.tasks.map((t) => t.id)).toEqual([
      "048-10", // 11:30 (最新)
      "048-2",  // 11:20
      "048-1",  // 11:10
      "048",    // 11:00
      "047",    // 10:00 (最古)
    ]);
  });

  it("completedAt昇順で最古の完了タスクが先頭に来る", async () => {
    const result = await executeListTasks(PROJECT_PATH, {
      status: ["completed"],
      sortField: "completedAt",
      sortOrder: "asc",
    });

    expect(result.tasks.map((t) => t.id)).toEqual([
      "047",    // 10:00 (最古)
      "048",    // 11:00
      "048-1",  // 11:10
      "048-2",  // 11:20
      "048-10", // 11:30 (最新)
    ]);
  });

  it("completedAtがnullのタスクはdesc時に末尾に配置される", async () => {
    // completedAt=null のタスクを含むデータ
    const dataWithNull = {
      lastTaskNumber: 3,
      tasks: [
        {
          id: "001",
          parentId: null,
          title: "完了済み（古い）",
          description: "",
          priority: "medium",
          status: "completed",
          substatus: null,
          category: "task",
          assignees: [],
          createdAt: "2026-02-05T09:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: "2026-02-05T10:00:00Z",
          reportPaths: [],
          summary: null,
        },
        {
          id: "002",
          parentId: null,
          title: "完了済み（completedAt欠損）",
          description: "",
          priority: "medium",
          status: "completed",
          substatus: null,
          category: "task",
          assignees: [],
          createdAt: "2026-02-05T09:30:00Z",
          updatedAt: "2026-02-05T10:30:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [],
          summary: null,
        },
        {
          id: "003",
          parentId: null,
          title: "完了済み（新しい）",
          description: "",
          priority: "medium",
          status: "completed",
          substatus: null,
          category: "task",
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T11:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: "2026-02-05T11:00:00Z",
          reportPaths: [],
          summary: null,
        },
      ],
    };
    mockedReadFile.mockResolvedValue(stringify(dataWithNull));

    const result = await executeListTasks(PROJECT_PATH, {
      status: ["completed"],
      sortField: "completedAt",
      sortOrder: "desc",
    });

    expect(result.tasks.map((t) => t.id)).toEqual([
      "003", // 11:00 (最新)
      "001", // 10:00
      "002", // null → desc時は末尾
    ]);
  });
});
