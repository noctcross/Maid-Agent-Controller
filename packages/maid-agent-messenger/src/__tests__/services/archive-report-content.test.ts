/**
 * archiveReport --content オプションテスト
 *
 * task-307-1: --content オプションで直接内容を指定してアーカイブできることを検証
 */

import { jest, describe, it, expect, beforeEach, afterAll } from "@jest/globals";

// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  fileExists: jest.fn(),
  copyFile: jest.fn(),
  writeTextFile: jest.fn(),
  sanitizeDescription: jest.fn((s: string | null) => s || "untitled"),
  getTimestamp: jest.fn(),
  stringifyYaml: jest.fn((data: unknown) => JSON.stringify(data)),
}));

jest.unstable_mockModule("../../utils/file-lock.js", () => ({
  withFileLock: jest.fn(),
}));

jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(),
  stat: jest.fn(),
  default: { readFile: jest.fn(), stat: jest.fn() },
}));

// dynamic import
const {
  fileExists,
  copyFile,
  writeTextFile,
  sanitizeDescription,
} = await import("../../utils/yaml-helper.js");
const fsPromises = await import("fs/promises");
const { archiveReport } = await import("../../services/task-side-effects.js");

// 型付きモック
const mockedFileExists = fileExists as jest.MockedFunction<typeof fileExists>;
const mockedCopyFile = copyFile as jest.MockedFunction<typeof copyFile>;
const mockedWriteTextFile = writeTextFile as jest.MockedFunction<typeof writeTextFile>;
const mockedSanitizeDescription = sanitizeDescription as jest.MockedFunction<typeof sanitizeDescription>;
const mockedReadFile = fsPromises.readFile as jest.MockedFunction<typeof fsPromises.readFile>;
const mockedStat = fsPromises.stat as jest.MockedFunction<typeof fsPromises.stat>;

const PROJECT_PATH = "/project";

// テスト用ヘルパー: Task オブジェクト生成
function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "072",
    parentId: null,
    title: "テストタスク",
    description: "テスト説明",
    priority: "medium" as const,
    status: "completed" as const,
    substatus: null,
    category: "task" as const,
    assignees: [{ agentId: "emma", role: null, subTaskId: null }],
    targetPath: null,
    createdAt: "2026-02-06T00:00:00Z",
    updatedAt: "2026-02-06T00:00:00Z",
    assignedAt: "2026-02-06T00:00:00Z",
    startedAt: "2026-02-06T01:00:00Z",
    completedAt: "2026-02-06T02:00:00Z",
    reportPaths: [],
    summary: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockedFileExists.mockResolvedValue(false);
  mockedCopyFile.mockResolvedValue(true);
  mockedWriteTextFile.mockResolvedValue(true);
  mockedSanitizeDescription.mockImplementation((s: string | null) => s || "untitled");
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("archiveReport with content option", () => {
  describe("content が指定された場合", () => {
    it("ファイルコピーではなく直接書き込みでアーカイブされる", async () => {
      mockedSanitizeDescription.mockReturnValue("テストタスク");
      const content = "# 作業報告 - エマ\n\n## タスク情報\n- task_id: task-072\n\n## 作業内容\nテスト作業完了";

      const task = createTask();
      const result = await archiveReport(
        PROJECT_PATH,
        task,
        "emma",
        true,  // skipTimestampCheck
        content  // 直接内容を指定
      );

      // copyFile ではなく writeTextFile が呼ばれる
      expect(mockedCopyFile).not.toHaveBeenCalled();
      expect(mockedWriteTextFile).toHaveBeenCalledWith(
        expect.stringContaining("task-072-emma-テストタスク.md"),
        content
      );
      expect(result.archived).toBe(true);
      expect(result.archivePath).toContain("task-072-emma-テストタスク.md");
    });

    it("current ファイルのタスクID不一致でも content 指定があればアーカイブできる", async () => {
      // current ファイルは別タスクの報告書
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue("# 作業報告\n\n- task_id: task-999\n");  // 別タスク
      mockedSanitizeDescription.mockReturnValue("テストタスク");

      const content = "# 作業報告\n\n- task_id: task-072\n\n正しい内容";
      const task = createTask();

      const result = await archiveReport(
        PROJECT_PATH,
        task,
        "emma",
        true,
        content  // 直接内容を指定
      );

      // content 指定があるので、current ファイルのIDチェックは関係なくアーカイブ成功
      expect(result.archived).toBe(true);
      expect(mockedWriteTextFile).toHaveBeenCalledWith(
        expect.stringContaining("task-072-emma-テストタスク.md"),
        content
      );
    });

    it("current ファイルが存在しなくても content 指定があればアーカイブできる", async () => {
      // current ファイルは存在しない
      mockedFileExists.mockResolvedValue(false);
      mockedSanitizeDescription.mockReturnValue("テストタスク");

      const content = "# 手動で指定した報告内容";
      const task = createTask();

      const result = await archiveReport(
        PROJECT_PATH,
        task,
        "emma",
        true,
        content
      );

      expect(result.archived).toBe(true);
      expect(mockedWriteTextFile).toHaveBeenCalledWith(
        expect.stringContaining("task-072-emma-テストタスク.md"),
        content
      );
    });
  });

  describe("content が指定されていない場合（従来動作）", () => {
    it("current ファイルのタスクIDが一致する場合、ファイルコピーでアーカイブされる", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue("# 作業報告\n\n- task_id: task-072\n");
      mockedSanitizeDescription.mockReturnValue("テストタスク");

      const task = createTask();
      const result = await archiveReport(PROJECT_PATH, task, "emma", true);

      expect(mockedCopyFile).toHaveBeenCalled();
      expect(mockedWriteTextFile).not.toHaveBeenCalled();
      expect(result.archived).toBe(true);
    });

    it("current ファイルのタスクIDが不一致の場合、アーカイブされない", async () => {
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue("# 作業報告\n\n- task_id: task-999\n");  // 別タスク
      mockedSanitizeDescription.mockReturnValue("テストタスク");

      const task = createTask();
      const result = await archiveReport(PROJECT_PATH, task, "emma", true);

      expect(result.archived).toBe(false);
      expect(result.reason).toBe("task_id_mismatch");
    });
  });
});
