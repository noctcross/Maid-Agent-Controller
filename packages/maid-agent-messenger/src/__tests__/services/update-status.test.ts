/**
 * update-status テスト
 *
 * blocked/working 時の tasks.yaml 同期を検証
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  getTimestamp: jest.fn(),
  fileExists: jest.fn(),
  copyFile: jest.fn(),
  sanitizeDescription: jest.fn((s: string) => s),
}));

jest.unstable_mockModule("../../utils/file-lock.js", () => ({
  withFileLock: jest.fn(),
}));

jest.unstable_mockModule("../../services/task-manager.js", () => ({
  executeUpdateTask: jest.fn(),
}));

// dynamic import（モック設定後に読み込み）
const { executeUpdateStatus } = await import("../../services/update-status.js");
const {
  readYamlFile,
  writeYamlFile,
  getTimestamp,
  fileExists,
  copyFile,
} = await import("../../utils/yaml-helper.js");
const { withFileLock } = await import("../../utils/file-lock.js");
const { executeUpdateTask } = await import("../../services/task-manager.js");

// 型付きモック参照
const mockedReadYamlFile = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockedWriteYamlFile = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;
const mockedGetTimestamp = getTimestamp as jest.MockedFunction<typeof getTimestamp>;
const mockedFileExists = fileExists as jest.MockedFunction<typeof fileExists>;
const mockedCopyFile = copyFile as jest.MockedFunction<typeof copyFile>;
const mockedWithFileLock = withFileLock as jest.MockedFunction<typeof withFileLock>;
const mockedExecuteUpdateTask = executeUpdateTask as jest.MockedFunction<typeof executeUpdateTask>;

const FIXED_TIMESTAMP = "2026-02-05T20:00:00+09:00";

beforeEach(() => {
  jest.clearAllMocks();

  mockedGetTimestamp.mockReturnValue(FIXED_TIMESTAMP);
  mockedWriteYamlFile.mockResolvedValue(undefined);
  mockedFileExists.mockResolvedValue(false);
  mockedCopyFile.mockResolvedValue(true);
  mockedExecuteUpdateTask.mockResolvedValue({ success: true, task: null });

  // withFileLock: コールバックをそのまま実行
  mockedWithFileLock.mockImplementation(
    (async (_path: string, callback: () => Promise<unknown>) => {
      return await callback();
    }) as typeof withFileLock
  );
});

const baseParams = {
  queueMaidPath: "/project/.maid-agent/system/data/maid",
  currentReportsPath: "/project/.maid-agent/system/data/reports",
  archiveReportsPath: "/project/.maid-agent/master/reports",
  agentId: "emma",
};

describe("executeUpdateStatus - blocked/working 時の tasks.yaml 同期", () => {
  describe("blocked 時", () => {
    it("task_id がある場合、executeUpdateTask が呼ばれる", async () => {
      mockedReadYamlFile.mockResolvedValue({
        task_id: "task-037",
        status: "working",
        description: "テストタスク",
      });

      const result = await executeUpdateStatus({
        ...baseParams,
        status: "blocked",
        summary: "依存タスク待ち",
      });

      expect(result.success).toBe(true);
      expect(mockedExecuteUpdateTask).toHaveBeenCalledWith(
        "/project",
        expect.objectContaining({
          taskId: "037",
          status: "blocked",
          summary: "依存タスク待ち",
        })
      );
      expect(result.updated_fields).toContain("tasks_yaml_synced");
    });

    it("task_id がない場合、executeUpdateTask は呼ばれない", async () => {
      mockedReadYamlFile.mockResolvedValue({
        status: "working",
        description: "task_idなしのタスク",
      });

      const result = await executeUpdateStatus({
        ...baseParams,
        status: "blocked",
      });

      expect(result.success).toBe(true);
      expect(mockedExecuteUpdateTask).not.toHaveBeenCalled();
      expect(result.updated_fields).not.toContain("tasks_yaml_synced");
    });

    it("executeUpdateTask が失敗しても全体は成功する（後方互換性）", async () => {
      mockedReadYamlFile.mockResolvedValue({
        task_id: "task-037",
        status: "working",
        description: "テストタスク",
      });
      mockedExecuteUpdateTask.mockRejectedValue(new Error("tasks.yaml not found"));

      const result = await executeUpdateStatus({
        ...baseParams,
        status: "blocked",
        summary: "問題発生",
      });

      expect(result.success).toBe(true);
      expect(result.updated_fields).not.toContain("tasks_yaml_synced");
    });
  });

  describe("working 時", () => {
    it("task_id がある場合、executeUpdateTask が呼ばれる", async () => {
      mockedReadYamlFile.mockResolvedValue({
        task_id: "task-037",
        status: "assigned",
        description: "テストタスク",
      });

      const result = await executeUpdateStatus({
        ...baseParams,
        status: "working",
        summary: "作業開始",
      });

      expect(result.success).toBe(true);
      expect(mockedExecuteUpdateTask).toHaveBeenCalledWith(
        "/project",
        expect.objectContaining({
          taskId: "037",
          status: "working",
          summary: "作業開始",
        })
      );
      expect(result.updated_fields).toContain("tasks_yaml_synced");
    });

    it("task_id がない場合、executeUpdateTask は呼ばれない", async () => {
      mockedReadYamlFile.mockResolvedValue({
        status: "assigned",
        description: "task_idなしのタスク",
      });

      const result = await executeUpdateStatus({
        ...baseParams,
        status: "working",
      });

      expect(result.success).toBe(true);
      expect(mockedExecuteUpdateTask).not.toHaveBeenCalled();
    });
  });

  describe("completed 時（既存動作の回帰テスト）", () => {
    it("task_id がある場合、executeUpdateTask が completed で呼ばれる", async () => {
      mockedReadYamlFile.mockResolvedValue({
        task_id: "task-037",
        title: "テストタスク",
        description: "テストタスク説明",
        status: "working",
      });
      mockedFileExists.mockResolvedValue(true);

      const result = await executeUpdateStatus({
        ...baseParams,
        status: "completed",
        summary: "完了",
      });

      expect(result.success).toBe(true);
      expect(mockedExecuteUpdateTask).toHaveBeenCalledWith(
        "/project",
        expect.objectContaining({
          taskId: "037",
          status: "completed",
        })
      );
      expect(result.updated_fields).toContain("tasks_yaml_synced");
    });
  });
});
