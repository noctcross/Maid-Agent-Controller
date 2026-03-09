/**
 * タスク管理サービス - 祖先タスク自動再オープン テスト
 *
 * Task #406-1: 子タスク追加時の祖先Task自動オープン
 * - 追加されたタスクの最上位の祖先（Task）を特定
 * - そのTaskを open/working に変更
 * - 途中の階層（Work等）も必要に応じてオープン
 */

import * as fs from "fs/promises";
import * as path from "path";
import { stringify } from "yaml";
import {
  executeCreateTask,
  executeGetTask,
  type TasksData,
  type Task,
} from "../src/services/task-manager.js";

const TEST_PROJECT_PATH = "/tmp/test-maid-agent-ancestor-reopen";

// テスト用の簡易タスクデータを作成するヘルパー
function createTestTask(partial: Partial<Task>): Task {
  return {
    id: "",
    parentId: "",
    title: "",
    description: "",
    priority: "medium",
    status: "pending",
    substatus: "",
    category: "task",
    assignees: [],
    blockedBy: [],
    createdAt: "",
    updatedAt: "",
    ...partial,
  } as Task;
}

/**
 * テスト用ヘルパー: テストディレクトリの初期化
 */
async function setupTestProject(): Promise<void> {
  const dataDir = path.join(TEST_PROJECT_PATH, ".maid-agent", "system", "data");
  await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
}

/**
 * テスト用ヘルパー: tasks.yaml を直接書き込み
 */
async function writeTasksYaml(data: TasksData): Promise<void> {
  const filePath = path.join(TEST_PROJECT_PATH, ".maid-agent", "system", "data", "tasks.yaml");
  await fs.writeFile(filePath, stringify(data), "utf-8");
}

describe("createTask - 祖先タスク自動再オープン", () => {
  beforeEach(async () => {
    await setupTestProject();
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  });

  it("Step追加時に最上位のTask（祖先）まで遡ってオープンする", async () => {
    // 階層: Task(100) → Work(100-1) → Step追加
    // Task と Work が両方 closed の状態で Step を追加
    const testData: TasksData = {
      lastTaskNumber: 100,
      tasks: [
        // 最上位 Task (closed)
        createTestTask({
          id: "100",
          title: "親Task",
          type: "task",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        // 中間 Work (closed)
        createTestTask({
          id: "100-1",
          parentId: "100",
          title: "親Work",
          type: "work",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
      ],
    };
    await writeTasksYaml(testData);

    // Step を Work(100-1) 配下に追加
    const result = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "新しいStep",
      parentId: "100-1",
      type: "step",
    });

    expect(result.taskId).toBe("100-1-1");

    // 直接の親（Work 100-1）がオープンされている
    const workResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: "100-1" });
    const work = workResult.task as Task;
    expect(work.mainStatus).toBe("open");
    expect(work.subStatus).toBe("working");

    // 最上位の祖先（Task 100）もオープンされている
    const taskResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: "100" });
    const task = taskResult.task as Task;
    expect(task.mainStatus).toBe("open");
    expect(task.subStatus).toBe("working");
  });

  it("Work追加時に最上位のTask（親）がオープンされる", async () => {
    // 階層: Task(101) → Work追加
    const testData: TasksData = {
      lastTaskNumber: 101,
      tasks: [
        // Task (closed)
        createTestTask({
          id: "101",
          title: "親Task",
          type: "task",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
      ],
    };
    await writeTasksYaml(testData);

    // Work を Task(101) 配下に追加
    const result = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "新しいWork",
      parentId: "101",
      type: "work",
    });

    expect(result.taskId).toBe("101-1");

    // 親（Task 101）がオープンされている
    const taskResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: "101" });
    const task = taskResult.task as Task;
    expect(task.mainStatus).toBe("open");
    expect(task.subStatus).toBe("working");
  });

  it("3階層（Task→Work→Step→新Step）でも最上位までオープン", async () => {
    // 4階層のテスト: Task(102) → Work(102-1) → Step(102-1-1) → 新Step追加
    const testData: TasksData = {
      lastTaskNumber: 102,
      tasks: [
        createTestTask({
          id: "102",
          title: "最上位Task",
          type: "task",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        createTestTask({
          id: "102-1",
          parentId: "102",
          title: "中間Work",
          type: "work",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        createTestTask({
          id: "102-1-1",
          parentId: "102-1",
          title: "中間Step",
          type: "step",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
      ],
    };
    await writeTasksYaml(testData);

    // 新Step を Step(102-1-1) 配下に追加
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "孫Step",
      parentId: "102-1-1",
      type: "step",
    });

    // 全ての祖先がオープンされている
    const task = (await executeGetTask(TEST_PROJECT_PATH, { taskId: "102" })).task as Task;
    const work = (await executeGetTask(TEST_PROJECT_PATH, { taskId: "102-1" })).task as Task;
    const step = (await executeGetTask(TEST_PROJECT_PATH, { taskId: "102-1-1" })).task as Task;

    expect(task.mainStatus).toBe("open");
    expect(work.mainStatus).toBe("open");
    expect(step.mainStatus).toBe("open");
  });

  it("archived も全祖先で解除される", async () => {
    // Task と Work が archived の状態
    const testData: TasksData = {
      lastTaskNumber: 103,
      tasks: [
        createTestTask({
          id: "103",
          title: "親Task",
          type: "task",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          archived: true,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        createTestTask({
          id: "103-1",
          parentId: "103",
          title: "親Work",
          type: "work",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          archived: true,
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
      ],
    };
    await writeTasksYaml(testData);

    // Step を追加
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "新しいStep",
      parentId: "103-1",
      type: "step",
    });

    // 全ての祖先で archived が解除されている
    const task = (await executeGetTask(TEST_PROJECT_PATH, { taskId: "103" })).task as Task;
    const work = (await executeGetTask(TEST_PROJECT_PATH, { taskId: "103-1" })).task as Task;

    expect(task.archived).not.toBe(true);
    expect(work.archived).not.toBe(true);
  });

  it("既にopenの祖先は変更されない", async () => {
    // Task が open、Work が closed の状態
    const testData: TasksData = {
      lastTaskNumber: 104,
      tasks: [
        createTestTask({
          id: "104",
          title: "親Task (open)",
          type: "task",
          status: "working",
          mainStatus: "open",
          subStatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        createTestTask({
          id: "104-1",
          parentId: "104",
          title: "親Work (closed)",
          type: "work",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
      ],
    };
    await writeTasksYaml(testData);

    // Step を追加
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "新しいStep",
      parentId: "104-1",
      type: "step",
    });

    // Task は元から open なので変わらない
    const task = (await executeGetTask(TEST_PROJECT_PATH, { taskId: "104" })).task as Task;
    expect(task.mainStatus).toBe("open");
    expect(task.subStatus).toBe("working");

    // Work は closed → open に変更
    const work = (await executeGetTask(TEST_PROJECT_PATH, { taskId: "104-1" })).task as Task;
    expect(work.mainStatus).toBe("open");
    expect(work.subStatus).toBe("working");
  });

  it("reopenedParent には全ての再オープンされた祖先が含まれる", async () => {
    // 複数の祖先が再オープンされる場合
    const testData: TasksData = {
      lastTaskNumber: 105,
      tasks: [
        createTestTask({
          id: "105",
          title: "親Task",
          type: "task",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        createTestTask({
          id: "105-1",
          parentId: "105",
          title: "親Work",
          type: "work",
          status: "completed",
          mainStatus: "closed",
          subStatus: "completed",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
      ],
    };
    await writeTasksYaml(testData);

    // Step を追加
    const result = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "新しいStep",
      parentId: "105-1",
      type: "step",
    });

    // reopenedAncestors に全ての再オープンされた祖先が含まれる
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ancestors = (result as any).reopenedAncestors as Task[] | undefined;
    expect(ancestors).toBeDefined();
    expect(ancestors?.length).toBe(2);
    expect(ancestors?.map((t: Task) => t.id)).toContain("105");
    expect(ancestors?.map((t: Task) => t.id)).toContain("105-1");
  });
});
