/**
 * task-crud-update: checkpointPassAdd（C-1: Type B 通過型チェックポイント記録）テスト
 *
 * 目的: `maidctl checkpoint pass --summary "..."` が呼び出す
 * executeUpdateTask({ checkpointPassAdd }) が、対象タスクの checkpointPassed
 * 配列にタイムスタンプ付きで正しく追記されることを確認する。
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ESMモード: jest.unstable_mockModule + dynamic import パターン（beforeEach 内での重いモジュール再インポートは行わない）
const mockWithTasksLock = jest.fn<any>();

jest.unstable_mockModule("../../services/task-core.js", () => ({
  withTasksLock: mockWithTasksLock,
}));

jest.unstable_mockModule("../../services/task-side-effects.js", () => ({
  executeSideEffects: jest.fn<any>().mockResolvedValue({}),
}));

jest.unstable_mockModule("../../services/task-migration.js", () => ({
  getAgentRole: jest.fn<any>().mockReturnValue("maid"),
  validateStatusTransition: jest.fn<any>().mockReturnValue({ valid: true }),
}));

jest.unstable_mockModule("../../services/task-auto-close.js", () => ({
  checkAndAutoCloseParent: jest.fn<any>().mockResolvedValue({ autoClosedIds: [] }),
  resolveBlockedTasks: jest.fn<any>().mockResolvedValue({ unblockedTasks: [] }),
}));

jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  getTimestamp: () => "2026-07-04T13:00:00+09:00",
  getJstTimestamp: () => "2026-07-04 13:00:00",
}));

const { executeUpdateTask } = await import("../../services/task-crud-update.js");

const PROJECT_PATH = "/project";

function createMockTasksData(task: Record<string, unknown>) {
  return {
    lastTaskNumber: 1,
    tasks: [
      {
        id: "task-1454-1",
        parentId: null,
        title: "テストタスク",
        description: "",
        priority: "medium" as const,
        status: "working" as const,
        substatus: "working" as const,
        subStatus: "working" as const,
        mainStatus: "open" as const,
        category: "task" as const,
        type: "work" as const,
        targetPath: null,
        assignees: [],
        createdAt: "2026-07-04T00:00:00+09:00",
        updatedAt: "2026-07-04T00:00:00+09:00",
        assignedAt: "2026-07-04T00:00:00+09:00",
        startedAt: "2026-07-04T00:00:00+09:00",
        completedAt: null,
        reportPaths: [],
        summary: null,
        blockedBy: [],
        actionRequired: false,
        actionRequiredAt: null,
        archived: false,
        archivedAt: null,
        artifacts: [],
        escalation: undefined,
        stepRequired: false,
        ...task,
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWithTasksLock.mockImplementation(async (_projectPath: string, operation: any) => {
    const data = createMockTasksData({});
    const { result } = await operation(data);
    return result;
  });
});

describe("executeUpdateTask - checkpointPassAdd（C-1）", () => {
  it("checkpointPassed が未初期化のタスクに新規配列を作って1件追記する", async () => {
    const result = await executeUpdateTask(PROJECT_PATH, {
      taskId: "task-1454-1",
      checkpointPassAdd: { summary: "暫定判断: dev直接で続行", agentId: "rose" },
    });

    expect(result.success).toBe(true);
    expect(result.task?.checkpointPassed).toEqual([
      { timestamp: "2026-07-04T13:00:00+09:00", summary: "暫定判断: dev直接で続行", agentId: "rose" },
    ]);
  });

  it("既存の checkpointPassed に追記する（既存エントリを保持）", async () => {
    mockWithTasksLock.mockImplementation(async (_projectPath: string, operation: any) => {
      const data = createMockTasksData({
        checkpointPassed: [
          { timestamp: "2026-07-01T00:00:00+09:00", summary: "1件目", agentId: "emma" },
        ],
      });
      const { result } = await operation(data);
      return result;
    });

    const result = await executeUpdateTask(PROJECT_PATH, {
      taskId: "task-1454-1",
      checkpointPassAdd: { summary: "2件目", agentId: "rose" },
    });

    expect(result.task?.checkpointPassed).toEqual([
      { timestamp: "2026-07-01T00:00:00+09:00", summary: "1件目", agentId: "emma" },
      { timestamp: "2026-07-04T13:00:00+09:00", summary: "2件目", agentId: "rose" },
    ]);
  });

  // task-1637-9 (W-CP): 検討選択肢の記録（変更モーダルでのボタン化に利用予定・W-B1）
  it("options を指定すると checkpointPassed エントリに options 配列が含まれる", async () => {
    const result = await executeUpdateTask(PROJECT_PATH, {
      taskId: "task-1454-1",
      checkpointPassAdd: {
        summary: "暫定判断: A案を採用",
        agentId: "rose",
        options: ["A案", "B案"],
      },
    });

    expect(result.success).toBe(true);
    expect(result.task?.checkpointPassed).toEqual([
      {
        timestamp: "2026-07-04T13:00:00+09:00",
        summary: "暫定判断: A案を採用",
        agentId: "rose",
        options: ["A案", "B案"],
      },
    ]);
  });

  it("options を指定しない場合はエントリに options キーを含めない（後方互換）", async () => {
    const result = await executeUpdateTask(PROJECT_PATH, {
      taskId: "task-1454-1",
      checkpointPassAdd: { summary: "暫定判断: dev直接で続行", agentId: "rose" },
    });

    expect(result.success).toBe(true);
    expect(result.task?.checkpointPassed?.[0]).not.toHaveProperty("options");
  });

  it("checkpointPassAdd を指定しない通常更新では checkpointPassed を変更しない", async () => {
    mockWithTasksLock.mockImplementation(async (_projectPath: string, operation: any) => {
      const data = createMockTasksData({
        checkpointPassed: [
          { timestamp: "2026-07-01T00:00:00+09:00", summary: "既存記録", agentId: "emma" },
        ],
      });
      const { result } = await operation(data);
      return result;
    });

    const result = await executeUpdateTask(PROJECT_PATH, {
      taskId: "task-1454-1",
      summary: "通常のサマリ更新",
    });

    expect(result.task?.checkpointPassed).toEqual([
      { timestamp: "2026-07-01T00:00:00+09:00", summary: "既存記録", agentId: "emma" },
    ]);
  });
});
