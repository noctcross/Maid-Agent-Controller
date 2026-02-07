/**
 * assign-task テスト
 *
 * unified-task-state-gateway: assign_task は
 * ガード条件のみ担当し、executeUpdateTask に全処理を委譲する
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  getTimestamp: jest.fn(),
  writeTextFile: jest.fn(),
  fileExists: jest.fn(),
}));

jest.unstable_mockModule("../../utils/file-lock.js", () => ({
  withFileLock: jest.fn(),
}));

jest.unstable_mockModule("../../services/task-manager.js", () => ({
  executeUpdateTask: jest.fn(),
}));

// dynamic import
const { executeAssignTask } = await import("../../services/assign-task.js");
const { readYamlFile } = await import("../../utils/yaml-helper.js");
const { withFileLock } = await import("../../utils/file-lock.js");
const { executeUpdateTask } = await import("../../services/task-manager.js");

// 型付きモック
const mockedReadYamlFile = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockedWithFileLock = withFileLock as jest.MockedFunction<typeof withFileLock>;
const mockedExecuteUpdateTask = executeUpdateTask as jest.MockedFunction<typeof executeUpdateTask>;

beforeEach(() => {
  jest.clearAllMocks();

  // withFileLock: コールバックをそのまま実行
  mockedWithFileLock.mockImplementation(
    (async (_path: string, callback: () => Promise<unknown>) => {
      return await callback();
    }) as typeof withFileLock
  );

  // executeUpdateTask: デフォルトで成功を返す
  mockedExecuteUpdateTask.mockResolvedValue({
    success: true,
    task: {
      id: "072",
      parentId: null,
      title: "テストタスク",
      description: "テスト説明",
      priority: "medium" as const,
      status: "assigned" as const,
      substatus: null,
      category: "task" as const,
      assignees: [{ agentId: "emma", role: null, subTaskId: null }],
      createdAt: "2026-02-06T00:00:00Z",
      assignedAt: "2026-02-06T00:00:00Z",
      startedAt: null,
      completedAt: null,
      reportPaths: [],
      summary: null,
    },
    sideEffects: {
      maidYamlSynced: true,
      reportTemplatized: true,
    },
  });

  // readYamlFile: デフォルトで idle 状態を返す
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
  });
});

const baseParams = {
  queueMaidPath: "/project/.maid-agent/system/data/maid",
  currentReportsPath: "/project/.maid-agent/system/data/reports",
  templatePath: "/project/.maid-agent/master/reports",
  taskId: "task-072",
  targetAgent: "emma",
  title: "テストタスク",
  description: "テスト説明",
  targetPath: "/src/",
};

describe("executeAssignTask - unified-task-state-gateway", () => {
  it("ガード条件: working 状態のメイドには割り当て不可", async () => {
    mockedReadYamlFile.mockResolvedValue({
      task_id: "task-071",
      status: "working",
      description: "作業中タスク",
    });

    const result = await executeAssignTask(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("作業中");
    expect(mockedExecuteUpdateTask).not.toHaveBeenCalled();
  });

  it("idle 状態のメイドに正常に割り当てできる", async () => {
    const result = await executeAssignTask(baseParams);

    expect(result.success).toBe(true);
    expect(result.assigned_to).toBe("emma");
    expect(result.task_id).toBe("task-072");
  });

  it("executeUpdateTask に正しいパラメータを渡す", async () => {
    await executeAssignTask(baseParams);

    expect(mockedExecuteUpdateTask).toHaveBeenCalledWith(
      "/project",
      expect.objectContaining({
        taskId: "072",
        status: "assigned",
        assignees: [{ agentId: "emma", role: null, subTaskId: null }],
        description: "テスト説明",
        targetPath: "/src/",
      })
    );
  });

  it("task- プレフィックスが正規化される", async () => {
    await executeAssignTask({
      ...baseParams,
      taskId: "task-task-072",
    });

    expect(mockedExecuteUpdateTask).toHaveBeenCalledWith(
      "/project",
      expect.objectContaining({
        taskId: "072",
      })
    );
  });

  it("description なしでも割り当てできる", async () => {
    const { description, ...paramsWithoutDesc } = baseParams;
    await executeAssignTask(paramsWithoutDesc);

    expect(mockedExecuteUpdateTask).toHaveBeenCalledWith(
      "/project",
      expect.objectContaining({
        taskId: "072",
        status: "assigned",
      })
    );
  });

  it("executeUpdateTask が失敗した場合、エラーを返す", async () => {
    mockedExecuteUpdateTask.mockResolvedValue({
      success: false,
      task: null,
    });

    const result = await executeAssignTask(baseParams);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("maid yaml への直書きは行わない（writeYamlFile が呼ばれない）", async () => {
    const { writeYamlFile } = await import("../../utils/yaml-helper.js");
    const mockedWriteYamlFile = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;

    await executeAssignTask(baseParams);

    expect(mockedWriteYamlFile).not.toHaveBeenCalled();
  });

  it("テンプレート初期化の直接実行は行わない（writeTextFile が呼ばれない）", async () => {
    const { writeTextFile } = await import("../../utils/yaml-helper.js");
    const mockedWriteTextFile = writeTextFile as jest.MockedFunction<typeof writeTextFile>;

    await executeAssignTask(baseParams);

    expect(mockedWriteTextFile).not.toHaveBeenCalled();
  });
});
