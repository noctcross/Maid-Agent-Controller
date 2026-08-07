/**
 * resume-parked-task テスト（task-1688-2 案B）
 *
 * パーク中タスクの再開ロジック。maid yaml の task_id/parked_tasks を
 * ローカルでスワップ・昇格するのみで、tasks.yaml のstatus遷移（blocked→working）は
 * 対象外（既存の maidctl set my-status が引き続き担う）。
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  getTimestamp: jest.fn(() => "2026-08-07T12:00:00Z"),
}));

jest.unstable_mockModule("../../utils/file-lock.js", () => ({
  withFileLock: jest.fn(),
}));

jest.unstable_mockModule("../../services/task-manager.js", () => ({
  executeGetTask: jest.fn(),
}));

const { executeResumeParkedTask } = await import("../../services/resume-parked-task.js");
const { readYamlFile, writeYamlFile } = await import("../../utils/yaml-helper.js");
const { withFileLock } = await import("../../utils/file-lock.js");
const { executeGetTask } = await import("../../services/task-manager.js");

const mockedReadYamlFile = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockedWriteYamlFile = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;
const mockedWithFileLock = withFileLock as jest.MockedFunction<typeof withFileLock>;
const mockedExecuteGetTask = executeGetTask as jest.MockedFunction<typeof executeGetTask>;

const baseParams = {
  queueMaidPath: "/project/.maid-agent/system/data/maid",
  projectPath: "/project",
  agentId: "emma",
  taskId: "task-199",
};

const parkedEntry = {
  task_id: "task-199",
  title: "判断待ちタスク",
  substatus: "checkpoint",
  parked_at: "2026-08-07T09:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();

  mockedWithFileLock.mockImplementation(
    (async (_path: string, callback: () => Promise<unknown>) => {
      return await callback();
    }) as typeof withFileLock
  );

  mockedExecuteGetTask.mockResolvedValue({
    task: {
      id: "199",
      parentId: null,
      title: "判断待ちタスク",
      description: "判断待ちタスクの説明",
      priority: "medium" as const,
      status: "blocked" as const,
      substatus: "checkpoint",
      category: "task" as const,
      assignees: [{ agentId: "emma", role: null, subTaskId: null }],
      targetPath: "/src/parked/",
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-07T09:00:00Z",
      assignedAt: "2026-08-01T00:00:00Z",
      startedAt: "2026-08-01T00:00:00Z",
      completedAt: null,
      reportPaths: [],
      summary: null,
    },
  });
});

describe("executeResumeParkedTask - idle分岐（task_id=null）", () => {
  it("アクティブタスクがない場合、パーク中タスクをそのまま昇格する", async () => {
    mockedReadYamlFile.mockResolvedValue({
      task_id: null,
      title: null,
      description: null,
      target_path: null,
      status: "idle",
      substatus: null,
      assigned_at: null,
      started_at: null,
      completed_at: null,
      completion_summary: null,
      parked_tasks: [parkedEntry],
    });

    const result = await executeResumeParkedTask(baseParams);

    expect(result.success).toBe(true);
    expect(mockedWriteYamlFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        task_id: "task-199",
        title: "判断待ちタスク",
        description: "判断待ちタスクの説明",
        target_path: "/src/parked/",
        parked_tasks: [],
      })
    );
  });
});

describe("executeResumeParkedTask - completed分岐", () => {
  it("アクティブタスクが完了済みの場合、パーク中タスクをそのまま昇格する", async () => {
    mockedReadYamlFile.mockResolvedValue({
      task_id: "task-200",
      title: "新タスク",
      description: "新タスク説明",
      target_path: null,
      status: "completed",
      substatus: "completed",
      assigned_at: "2026-08-05T00:00:00Z",
      started_at: "2026-08-05T00:00:00Z",
      completed_at: "2026-08-07T08:00:00Z",
      completion_summary: "完了しました",
      parked_tasks: [parkedEntry],
    });

    const result = await executeResumeParkedTask(baseParams);

    expect(result.success).toBe(true);
    expect(mockedWriteYamlFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        task_id: "task-199",
        parked_tasks: [],
      })
    );
  });
});

describe("executeResumeParkedTask - blocked分岐（スワップ）", () => {
  it("アクティブタスクがblockedの場合、現在のアクティブタスクをparked_tasksへ退避してから昇格する", async () => {
    mockedReadYamlFile.mockResolvedValue({
      task_id: "task-200",
      title: "新タスク（判断待ち中）",
      description: "新タスク説明",
      target_path: null,
      status: "blocked",
      substatus: "checkpoint",
      assigned_at: "2026-08-05T00:00:00Z",
      started_at: "2026-08-05T00:00:00Z",
      completed_at: null,
      completion_summary: null,
      parked_tasks: [parkedEntry],
    });

    const result = await executeResumeParkedTask(baseParams);

    expect(result.success).toBe(true);
    expect(mockedWriteYamlFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        task_id: "task-199",
        parked_tasks: [
          expect.objectContaining({ task_id: "task-200", title: "新タスク（判断待ち中）" }),
        ],
      })
    );
  });
});

describe("executeResumeParkedTask - working分岐（拒否）", () => {
  it("アクティブタスクが進行中の場合、再開を拒否する", async () => {
    mockedReadYamlFile.mockResolvedValue({
      task_id: "task-200",
      title: "進行中タスク",
      description: null,
      target_path: null,
      status: "working",
      substatus: "working",
      assigned_at: "2026-08-05T00:00:00Z",
      started_at: "2026-08-05T00:00:00Z",
      completed_at: null,
      completion_summary: null,
      parked_tasks: [parkedEntry],
    });

    const result = await executeResumeParkedTask(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("task-200");
    expect(mockedWriteYamlFile).not.toHaveBeenCalled();
  });
});

describe("executeResumeParkedTask - エラーケース", () => {
  it("存在しないTASK_IDの場合はエラーを返す", async () => {
    mockedReadYamlFile.mockResolvedValue({
      task_id: "task-200",
      title: "新タスク",
      description: null,
      target_path: null,
      status: "idle",
      substatus: null,
      assigned_at: null,
      started_at: null,
      completed_at: null,
      completion_summary: null,
      parked_tasks: [parkedEntry],
    });

    const result = await executeResumeParkedTask({
      ...baseParams,
      taskId: "task-999",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("task-999");
    expect(mockedWriteYamlFile).not.toHaveBeenCalled();
  });
});
