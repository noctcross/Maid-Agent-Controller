/**
 * タスク管理サービス V2.1 sortBy テスト
 *
 * Task #405-1: Work/Step のソートロジック
 * - sortBy: 'id' → ID順（昇順）
 * - sortBy: 'updated' → updatedAt順（降順）
 */

import * as fs from "fs/promises";
import * as path from "path";
import { stringify } from "yaml";
import {
  generateDashboardData,
  type TasksData,
  type Task,
} from "../src/services/task-manager.js";

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

const TEST_PROJECT_PATH = "/tmp/test-maid-agent-v2-sortby";

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

describe("V2.1: generateDashboardData - sortBy パラメータ", () => {
  beforeEach(async () => {
    await setupTestProject();
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  });

  it("sortBy: 'id' の場合、Work/Step がID順（昇順）でソートされる", async () => {
    // テストデータ: Task → Work(2つ) → Step(2つ)
    const testData: TasksData = {
      lastTaskNumber: 100,
      tasks: [
        // Task
        createTestTask({
          id: "100",
          title: "テストTask",
          type: "task",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        // Work (ID逆順で登録、updatedAtも逆順)
        createTestTask({
          id: "100-2",
          title: "Work B",
          type: "work",
          parentId: "100",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-03T00:00:00Z", // 新しい
        }),
        createTestTask({
          id: "100-1",
          title: "Work A",
          type: "work",
          parentId: "100",
          status: "pending",
          mainStatus: "open",
          v2Substatus: "pending",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-02T00:00:00Z", // 古い
        }),
        // Step (Work 100-1配下、ID逆順で登録)
        createTestTask({
          id: "100-1-2",
          title: "Step B",
          type: "step",
          parentId: "100-1",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-04T00:00:00Z", // 新しい
        }),
        createTestTask({
          id: "100-1-1",
          title: "Step A",
          type: "step",
          parentId: "100-1",
          status: "pending",
          mainStatus: "open",
          v2Substatus: "pending",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-03T00:00:00Z", // 古い
        }),
      ],
    };
    await writeTasksYaml(testData);

    const result = await generateDashboardData(TEST_PROJECT_PATH, {
      sortBy: "id",
    });

    // Task の確認
    expect(result.v2Goals.length).toBe(1);
    const task = result.v2Goals[0];

    // Work がID順（昇順）: 100-1, 100-2
    expect(task.works.length).toBe(2);
    expect(task.works[0].id).toBe("100-1");
    expect(task.works[1].id).toBe("100-2");

    // Step がID順（昇順）: 100-1-1, 100-1-2
    expect(task.works[0].steps.length).toBe(2);
    expect(task.works[0].steps[0].id).toBe("100-1-1");
    expect(task.works[0].steps[1].id).toBe("100-1-2");
  });

  it("sortBy: 'updated' の場合、Work/Step がupdatedAt順（降順）でソートされる", async () => {
    // テストデータ: Task → Work(2つ) → Step(2つ)
    const testData: TasksData = {
      lastTaskNumber: 100,
      tasks: [
        // Task
        createTestTask({
          id: "100",
          title: "テストTask",
          type: "task",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        // Work (ID順で登録、updatedAtは逆順)
        createTestTask({
          id: "100-1",
          title: "Work A",
          type: "work",
          parentId: "100",
          status: "pending",
          mainStatus: "open",
          v2Substatus: "pending",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-02T00:00:00Z", // 古い
        }),
        createTestTask({
          id: "100-2",
          title: "Work B",
          type: "work",
          parentId: "100",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-03T00:00:00Z", // 新しい
        }),
        // Step (Work 100-1配下、ID順で登録)
        createTestTask({
          id: "100-1-1",
          title: "Step A",
          type: "step",
          parentId: "100-1",
          status: "pending",
          mainStatus: "open",
          v2Substatus: "pending",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-03T00:00:00Z", // 古い
        }),
        createTestTask({
          id: "100-1-2",
          title: "Step B",
          type: "step",
          parentId: "100-1",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-04T00:00:00Z", // 新しい
        }),
      ],
    };
    await writeTasksYaml(testData);

    const result = await generateDashboardData(TEST_PROJECT_PATH, {
      sortBy: "updated",
    });

    // Task の確認
    expect(result.v2Goals.length).toBe(1);
    const task = result.v2Goals[0];

    // Work がupdatedAt順（降順）: 100-2 (新), 100-1 (古)
    expect(task.works.length).toBe(2);
    expect(task.works[0].id).toBe("100-2");
    expect(task.works[1].id).toBe("100-1");

    // Step がupdatedAt順（降順）: 100-1-2 (新), 100-1-1 (古)
    expect(task.works[1].steps.length).toBe(2);
    expect(task.works[1].steps[0].id).toBe("100-1-2");
    expect(task.works[1].steps[1].id).toBe("100-1-1");
  });

  it("sortBy 未指定の場合、デフォルトは 'updated'（updatedAt降順）", async () => {
    // テストデータ: Task → Work(2つ)
    const testData: TasksData = {
      lastTaskNumber: 100,
      tasks: [
        createTestTask({
          id: "100",
          title: "テストTask",
          type: "task",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-01T00:00:00Z",
        }),
        createTestTask({
          id: "100-1",
          title: "Work A (古い)",
          type: "work",
          parentId: "100",
          status: "pending",
          mainStatus: "open",
          v2Substatus: "pending",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-02T00:00:00Z",
        }),
        createTestTask({
          id: "100-2",
          title: "Work B (新しい)",
          type: "work",
          parentId: "100",
          status: "working",
          mainStatus: "open",
          v2Substatus: "working",
          createdAt: "2026-02-01T00:00:00Z",
          updatedAt: "2026-02-03T00:00:00Z",
        }),
      ],
    };
    await writeTasksYaml(testData);

    // sortBy 未指定
    const result = await generateDashboardData(TEST_PROJECT_PATH, {});

    expect(result.v2Goals.length).toBe(1);
    const task = result.v2Goals[0];

    // デフォルト: updatedAt降順 → 100-2 (新), 100-1 (古)
    expect(task.works[0].id).toBe("100-2");
    expect(task.works[1].id).toBe("100-1");
  });
});
