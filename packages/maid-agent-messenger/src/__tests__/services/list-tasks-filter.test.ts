/**
 * executeListTasks フィルタテスト
 *
 * category + status の複合フィルタが正しく動作することを検証
 * （ダッシュボードのスキル候補・改善提案セクション向け）
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
  stringifyYaml: jest.fn((data: unknown) => stringify(data)),
}));

jest.unstable_mockModule("../../utils/file-lock.js", () => ({
  withFileLock: jest.fn(),
}));

// dynamic import（モック設定後に読み込み）
const { executeListTasks } = await import("../../services/task-manager.js");
const fs = await import("fs/promises");
const { fileExists } = await import("../../utils/yaml-helper.js");

const mockedReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockedFileExists = fileExists as jest.MockedFunction<typeof fileExists>;

const PROJECT_PATH = "/test/project";

// テスト用タスクデータ
const createTestTasksYaml = () => {
  const data = {
    lastTaskNumber: 5,
    tasks: [
      {
        id: "001",
        parentId: null,
        title: "通常タスク（pending）",
        description: "",
        priority: "medium",
        status: "pending",
        substatus: null,
        category: "task",
        assignees: [],
        createdAt: "2026-02-05T10:00:00+09:00",
        updatedAt: "2026-02-05T10:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: null,
        reportPaths: [],
        summary: null,
      },
      {
        id: "002",
        parentId: null,
        title: "スキル候補（pending）",
        description: "",
        priority: "low",
        status: "pending",
        substatus: null,
        category: "skill_candidate",
        assignees: [],
        createdAt: "2026-02-05T11:00:00+09:00",
        updatedAt: "2026-02-05T11:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: null,
        reportPaths: [],
        summary: null,
      },
      {
        id: "003",
        parentId: null,
        title: "スキル候補（completed）",
        description: "",
        priority: "low",
        status: "completed",
        substatus: null,
        category: "skill_candidate",
        assignees: [],
        createdAt: "2026-02-05T12:00:00+09:00",
        updatedAt: "2026-02-05T13:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: "2026-02-05T13:00:00+09:00",
        reportPaths: [],
        summary: "完了済み",
      },
      {
        id: "004",
        parentId: null,
        title: "改善提案（working）",
        description: "",
        priority: "medium",
        status: "working",
        substatus: null,
        category: "improvement",
        assignees: [],
        createdAt: "2026-02-05T14:00:00+09:00",
        updatedAt: "2026-02-05T14:30:00+09:00",
        assignedAt: null,
        startedAt: "2026-02-05T14:30:00+09:00",
        completedAt: null,
        reportPaths: [],
        summary: null,
      },
      {
        id: "005",
        parentId: null,
        title: "改善提案（completed）",
        description: "",
        priority: "medium",
        status: "completed",
        substatus: null,
        category: "improvement",
        assignees: [],
        createdAt: "2026-02-05T15:00:00+09:00",
        updatedAt: "2026-02-05T16:00:00+09:00",
        assignedAt: null,
        startedAt: null,
        completedAt: "2026-02-05T16:00:00+09:00",
        reportPaths: [],
        summary: "完了済み",
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

describe("executeListTasks - category + status 複合フィルタ", () => {
  describe("skill_candidate カテゴリ", () => {
    it("statusフィルタなしの場合、completedを含む全件が返る（現在のバグ動作）", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        category: ["skill_candidate"],
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.map((t) => t.id)).toEqual(["002", "003"]);
    });

    it("activeステータスでフィルタすると、completedが除外される（期待動作）", async () => {
      const ACTIVE_STATUSES = ["pending", "assigned", "working", "blocked"] as const;

      const result = await executeListTasks(PROJECT_PATH, {
        category: ["skill_candidate"],
        status: [...ACTIVE_STATUSES],
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe("002");
      expect(result.tasks[0].status).toBe("pending");
    });
  });

  describe("improvement カテゴリ", () => {
    it("statusフィルタなしの場合、completedを含む全件が返る（現在のバグ動作）", async () => {
      const result = await executeListTasks(PROJECT_PATH, {
        category: ["improvement"],
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.map((t) => t.id)).toEqual(["004", "005"]);
    });

    it("activeステータスでフィルタすると、completedが除外される（期待動作）", async () => {
      const ACTIVE_STATUSES = ["pending", "assigned", "working", "blocked"] as const;

      const result = await executeListTasks(PROJECT_PATH, {
        category: ["improvement"],
        status: [...ACTIVE_STATUSES],
      });

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe("004");
      expect(result.tasks[0].status).toBe("working");
    });
  });

  describe("actionRequired フラグフィルタ（既に正しく実装済みの参考例）", () => {
    it("activeステータスでフィルタすると、completedが除外される", async () => {
      const ACTIVE_STATUSES = ["pending", "assigned", "working", "blocked"] as const;

      const result = await executeListTasks(PROJECT_PATH, {
        actionRequired: true,
        status: [...ACTIVE_STATUSES],
      });

      // テストデータにactionRequired=trueのタスクはないので0件
      expect(result.tasks).toHaveLength(0);
    });
  });
});
