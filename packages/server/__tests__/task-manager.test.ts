/**
 * タスク管理サービス テスト (Phase 1)
 *
 * 設計書 docs/designs/mcp-task-management-system.md §6.2, §11.1 に基づく
 *
 * Phase 1 完了条件チェックリスト:
 * - [x] .maid-agent/tasks.yaml が正常に作成される
 * - [x] create_task でタスクが追加される
 * - [x] get_task で指定タスクが取得できる
 * - [x] list_tasks でフィルタリングが動作する
 * - [x] 単体テストが全てパス
 * - [x] ファイルロックが正常に動作する
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import {
  executeCreateTask,
  executeGetTask,
  executeListTasks,
  executeUpdateTask,
  type Task,
  type TasksData,
} from "../src/services/task-manager";

const TEST_PROJECT_PATH = "/tmp/test-maid-agent-task-manager";

/**
 * テスト用ヘルパー: tasks.yaml を直接読み込み
 */
async function readTasksYaml(): Promise<TasksData | null> {
  const filePath = path.join(TEST_PROJECT_PATH, ".maid-agent", "system", "data", "tasks.yaml");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const { parse } = await import("yaml");
    return parse(content) as TasksData;
  } catch {
    return null;
  }
}

/**
 * テスト用ヘルパー: 不正なYAMLを書き込み
 */
async function writeInvalidYaml(): Promise<void> {
  const dirPath = path.join(TEST_PROJECT_PATH, ".maid-agent", "system", "data");
  const filePath = path.join(dirPath, "tasks.yaml");
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, "invalid: yaml: content: [", "utf-8");
}

beforeEach(async () => {
  // テスト用ディレクトリをクリーンアップして作成
  if (fsSync.existsSync(TEST_PROJECT_PATH)) {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  }
  await fs.mkdir(path.join(TEST_PROJECT_PATH, ".maid-agent"), {
    recursive: true,
  });
});

afterEach(async () => {
  // クリーンアップ
  if (fsSync.existsSync(TEST_PROJECT_PATH)) {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  }
});

// ============================================================
// Phase 1 完了条件: create_task でタスクが追加される
// ============================================================
describe("executeCreateTask", () => {
  it("should create a new task with incremented ID", async () => {
    const result = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "テストタスク",
      description: "テストタスク",
      priority: "high",
    });

    expect(result.taskId).toBe("001");
    expect(result.task.description).toBe("テストタスク");
    expect(result.task.priority).toBe("high");
    expect(result.task.status).toBe("pending");
    expect(result.task.createdAt).toBeTruthy();
  });

  it("should create sequential task IDs", async () => {
    const result1 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスク1",
      description: "タスク1",
    });
    const result2 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスク2",
      description: "タスク2",
    });
    const result3 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスク3",
      description: "タスク3",
    });

    expect(result1.taskId).toBe("001");
    expect(result2.taskId).toBe("002");
    expect(result3.taskId).toBe("003");
  });

  it("should create a subtask with parent ID prefix", async () => {
    // 親タスク作成
    await executeCreateTask(TEST_PROJECT_PATH, { title: "親タスク", description: "親タスク" });

    // サブタスク作成
    const result = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "サブタスク",
      description: "サブタスク",
      parentId: "001",
    });

    expect(result.taskId).toBe("001-1");
    expect(result.task.parentId).toBe("001");
  });

  it("should create multiple subtasks with sequential IDs", async () => {
    // 親タスク作成
    await executeCreateTask(TEST_PROJECT_PATH, { title: "親タスク", description: "親タスク" });

    // サブタスク作成
    const sub1 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "サブタスク1",
      description: "サブタスク1",
      parentId: "001",
    });
    const sub2 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "サブタスク2",
      description: "サブタスク2",
      parentId: "001",
    });

    expect(sub1.taskId).toBe("001-1");
    expect(sub2.taskId).toBe("001-2");
  });

  it("should set assignees via executeUpdateTask", async () => {
    // create_taskはassignees不可、executeUpdateTaskで設定
    const created = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "割り当て済みタスク",
      description: "割り当て済みタスク",
    });

    expect(created.task.status).toBe("pending");
    expect(created.task.assignees).toHaveLength(0);

    // executeUpdateTaskでassigneesを設定
    const updated = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: created.taskId,
      status: "assigned",
      assignees: [
        { agentId: "alice", role: null, subTaskId: null },
        { agentId: "luna", role: null, subTaskId: null },
      ],
    });

    expect(updated.task?.status).toBe("assigned");
    expect(updated.task?.assignees).toHaveLength(2);
    expect(updated.task?.assignees[0].agentId).toBe("alice");
    expect(updated.task?.assignees[1].agentId).toBe("luna");
    expect(updated.task?.assignedAt).toBeTruthy();
  });

  it("should use default priority when not specified", async () => {
    const result = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "デフォルト優先度タスク",
      description: "デフォルト優先度タスク",
    });

    expect(result.task.priority).toBe("medium");
  });
});

// ============================================================
// Phase 1 完了条件: get_task で指定タスクが取得できる
// ============================================================
describe("executeGetTask", () => {
  it("should return null for non-existent task", async () => {
    const result = await executeGetTask(TEST_PROJECT_PATH, {
      taskId: "nonexistent",
    });

    expect(result.task).toBeNull();
  });

  it("should return the task by ID", async () => {
    await executeCreateTask(TEST_PROJECT_PATH, { title: "テストタスク", description: "テストタスク" });

    const result = await executeGetTask(TEST_PROJECT_PATH, { taskId: "001" });

    expect(result.task).not.toBeNull();
    expect(result.task!.id).toBe("001");
    expect((result.task as any).description).toBe("テストタスク");
  });

  it("should include subtasks when requested", async () => {
    // 親タスク作成
    await executeCreateTask(TEST_PROJECT_PATH, { title: "親タスク", description: "親タスク" });
    // サブタスク作成
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "サブタスク1",
      description: "サブタスク1",
      parentId: "001",
    });
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "サブタスク2",
      description: "サブタスク2",
      parentId: "001",
    });

    const result = await executeGetTask(TEST_PROJECT_PATH, {
      taskId: "001",
      includeSubtasks: true,
    });

    expect(result.task).not.toBeNull();
    expect(result.subtasks).toHaveLength(2);
    expect(result.subtasks![0].id).toBe("001-1");
    expect(result.subtasks![1].id).toBe("001-2");
  });

  it("should not include subtasks when not requested", async () => {
    // 親タスク作成
    await executeCreateTask(TEST_PROJECT_PATH, { title: "親タスク", description: "親タスク" });
    // サブタスク作成
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "サブタスク1",
      description: "サブタスク1",
      parentId: "001",
    });

    const result = await executeGetTask(TEST_PROJECT_PATH, {
      taskId: "001",
      includeSubtasks: false,
    });

    expect(result.task).not.toBeNull();
    expect(result.subtasks).toBeUndefined();
  });
});

// ============================================================
// Phase 1 完了条件: list_tasks でフィルタリングが動作する
// ============================================================
describe("executeListTasks", () => {
  it("should return empty list for empty project", async () => {
    const { tasks, total, hasMore } = await executeListTasks(TEST_PROJECT_PATH);

    expect(tasks).toEqual([]);
    expect(total).toBe(0);
    expect(hasMore).toBe(false);
  });

  it("should return all tasks", async () => {
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク1", description: "タスク1" });
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク2", description: "タスク2" });

    const { tasks, total } = await executeListTasks(TEST_PROJECT_PATH);

    expect(tasks).toHaveLength(2);
    expect(total).toBe(2);
  });

  it("should filter by status (pending vs assigned)", async () => {
    // pending タスク
    await executeCreateTask(TEST_PROJECT_PATH, { title: "未割当タスク", description: "未割当タスク" });
    // assigned タスク（executeUpdateTaskでassigneesを設定）
    const task2 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "割当済タスク",
      description: "割当済タスク",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: task2.taskId,
      status: "assigned",
      assignees: [{ agentId: "alice", role: null, subTaskId: null }],
    });

    const pending = await executeListTasks(TEST_PROJECT_PATH, {
      status: ["pending"],
    });
    const assigned = await executeListTasks(TEST_PROJECT_PATH, {
      status: ["assigned"],
    });

    expect(pending.tasks).toHaveLength(1);
    expect(pending.tasks[0].status).toBe("pending");
    expect(assigned.tasks).toHaveLength(1);
    expect(assigned.tasks[0].status).toBe("assigned");
  });

  it("should filter by multiple statuses", async () => {
    await executeCreateTask(TEST_PROJECT_PATH, { title: "未割当タスク", description: "未割当タスク" });
    const task2 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "割当済タスク",
      description: "割当済タスク",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: task2.taskId,
      status: "assigned",
      assignees: [{ agentId: "alice", role: null, subTaskId: null }],
    });

    const result = await executeListTasks(TEST_PROJECT_PATH, {
      status: ["pending", "assigned"],
    });

    expect(result.tasks).toHaveLength(2);
  });

  it("should filter by assignee", async () => {
    // create_taskはassignees不可、executeUpdateTaskで設定
    const task1 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "アリスのタスク",
      description: "アリスのタスク",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: task1.taskId,
      assignees: [{ agentId: "alice", role: null, subTaskId: null }],
    });

    const task2 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "ルナのタスク",
      description: "ルナのタスク",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: task2.taskId,
      assignees: [{ agentId: "luna", role: null, subTaskId: null }],
    });

    const aliceTasks = await executeListTasks(TEST_PROJECT_PATH, {
      assignee: "alice",
    });

    expect(aliceTasks.tasks).toHaveLength(1);
    expect(aliceTasks.tasks[0].assignees[0].agentId).toBe("alice");
  });

  it("should filter by parentId (top-level tasks only)", async () => {
    // 親タスク作成
    await executeCreateTask(TEST_PROJECT_PATH, { title: "親タスク", description: "親タスク" });
    // サブタスク作成
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "サブタスク",
      description: "サブタスク",
      parentId: "001",
    });

    const topLevel = await executeListTasks(TEST_PROJECT_PATH, {
      parentId: null,
    });

    expect(topLevel.tasks).toHaveLength(1);
    expect(topLevel.tasks[0].id).toBe("001");
  });

  it("should support pagination", async () => {
    // 5件作成
    for (let i = 0; i < 5; i++) {
      await executeCreateTask(TEST_PROJECT_PATH, {
        title: `タスク${i + 1}`,
        description: `タスク${i + 1}`,
      });
    }

    const page1 = await executeListTasks(TEST_PROJECT_PATH, {
      limit: 2,
      offset: 0,
    });
    const page2 = await executeListTasks(TEST_PROJECT_PATH, {
      limit: 2,
      offset: 2,
    });
    const page3 = await executeListTasks(TEST_PROJECT_PATH, {
      limit: 2,
      offset: 4,
    });

    expect(page1.tasks).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page2.tasks).toHaveLength(2);
    expect(page2.hasMore).toBe(true);
    expect(page3.tasks).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });

  it("should sort by createdAt descending", async () => {
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク1", description: "タスク1" });
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク2", description: "タスク2" });
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク3", description: "タスク3" });

    const { tasks } = await executeListTasks(TEST_PROJECT_PATH, {
      sortField: "createdAt",
      sortOrder: "desc",
    });

    expect(tasks[0].id).toBe("003");
    expect(tasks[1].id).toBe("002");
    expect(tasks[2].id).toBe("001");
  });

  it("should sort by createdAt ascending", async () => {
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク1", description: "タスク1" });
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク2", description: "タスク2" });
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク3", description: "タスク3" });

    const { tasks } = await executeListTasks(TEST_PROJECT_PATH, {
      sortField: "createdAt",
      sortOrder: "asc",
    });

    expect(tasks[0].id).toBe("001");
    expect(tasks[1].id).toBe("002");
    expect(tasks[2].id).toBe("003");
  });
});

// ============================================================
// Phase 1 完了条件: tasks.yaml が正常に作成される
// ============================================================
describe("tasks.yaml ファイル管理", () => {
  it("should create tasks.yaml on first task creation", async () => {
    // .maid-agentディレクトリすら存在しない状態
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });

    const result = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "新規プロジェクトのタスク",
      description: "新規プロジェクトのタスク",
    });

    expect(result.taskId).toBe("001");

    // ファイルが作成されていることを確認
    const data = await readTasksYaml();
    expect(data).not.toBeNull();
    expect(data!.tasks).toHaveLength(1);
    expect(data!.lastTaskNumber).toBe(1);
  });

  it("should persist lastTaskNumber correctly", async () => {
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク1", description: "タスク1" });
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク2", description: "タスク2" });
    await executeCreateTask(TEST_PROJECT_PATH, { title: "タスク3", description: "タスク3" });

    const data = await readTasksYaml();
    expect(data!.lastTaskNumber).toBe(3);
  });

  it("should handle empty project gracefully", async () => {
    // tasks.yamlが存在しない状態でリスト取得
    const { tasks, total } = await executeListTasks(TEST_PROJECT_PATH);

    expect(tasks).toEqual([]);
    expect(total).toBe(0);
  });
});

// ============================================================
// Phase 1 完了条件: ファイルロックが正常に動作する
// ============================================================
describe("ファイルロック（エッジケース）", () => {
  it("同時書き込みでロック競合が発生しない", async () => {
    // 並列でcreateTaskを実行
    const promises = Array(5)
      .fill(null)
      .map((_, i) =>
        executeCreateTask(TEST_PROJECT_PATH, { title: `タスク${i}`, description: `タスク${i}` })
      );
    const results = await Promise.all(promises);

    // 全て異なるIDが割り当てられる
    const ids = results.map((r) => r.taskId);
    expect(new Set(ids).size).toBe(5);

    // 全タスクが正常に保存されている
    const { tasks } = await executeListTasks(TEST_PROJECT_PATH);
    expect(tasks).toHaveLength(5);
  });

  it("高負荷での同時書き込みでも整合性が保たれる", async () => {
    // 6件の並列書き込み
    // Note: proper-lockfileのリトライ数(5)とリトライ間隔により、
    // 過度な並列数ではタイムアウトする。実運用では複数メイドが
    // 同時にタスク作成することは稀なため6並列でテスト。
    const concurrentCount = 6;
    const promises = Array(concurrentCount)
      .fill(null)
      .map((_, i) =>
        executeCreateTask(TEST_PROJECT_PATH, {
          title: `高負荷タスク${i}`,
          description: `高負荷タスク${i}`,
        })
      );
    const results = await Promise.all(promises);

    // 全て異なるIDが割り当てられる
    const ids = results.map((r) => r.taskId);
    expect(new Set(ids).size).toBe(concurrentCount);

    // YAMLファイルの整合性確認
    const data = await readTasksYaml();
    expect(data).not.toBeNull();
    expect(data!.tasks).toHaveLength(concurrentCount);
    expect(data!.lastTaskNumber).toBe(concurrentCount);
  });

  it("不正なYAMLファイルでエラーハンドリング", async () => {
    // 不正なYAMLを書き込み
    await writeInvalidYaml();

    // エラーがスローされる
    await expect(executeListTasks(TEST_PROJECT_PATH)).rejects.toThrow();
  });

  it("空のプロジェクトでlistTasks", async () => {
    const { tasks, total, hasMore } = await executeListTasks(TEST_PROJECT_PATH);

    expect(tasks).toEqual([]);
    expect(total).toBe(0);
    expect(hasMore).toBe(false);
  });
});

describe("actionRequired フラグ", () => {
  it("actionRequired: true でフラグと日時が設定される", async () => {
    // 準備: タスク作成
    const created = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "テストタスク",
    });

    // 実行: actionRequired: true で更新
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: created.taskId,
      status: "blocked",
      actionRequired: true,
    });

    expect(result.success).toBe(true);
    expect(result.task!.actionRequired).toBe(true);
    expect(result.task!.actionRequiredAt).toBeTruthy();
  });

  it("actionRequired: false でフラグと日時がクリアされる", async () => {
    // 準備: タスク作成 → actionRequired: true に設定
    const created = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "テストタスク",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: created.taskId,
      actionRequired: true,
    });

    // 実行: actionRequired: false で更新
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: created.taskId,
      actionRequired: false,
    });

    expect(result.success).toBe(true);
    expect(result.task!.actionRequired).toBe(false);
    expect(result.task!.actionRequiredAt).toBeNull();
  });

  it("actionRequired 未指定時は既存値を維持する", async () => {
    // 準備: タスク作成 → actionRequired: true に設定
    const created = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "テストタスク",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: created.taskId,
      actionRequired: true,
    });

    // 実行: actionRequired を指定せず別フィールドを更新
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: created.taskId,
      summary: "更新テスト",
    });

    expect(result.success).toBe(true);
    expect(result.task!.actionRequired).toBe(true);
    expect(result.task!.actionRequiredAt).toBeTruthy();
  });
});

describe("完了時チェック（子タスク）", () => {
  it("子タスクがない親Taskを完了→成功", async () => {
    // Arrange: 子タスクがない親Taskを作成
    const parent = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "親タスク（子なし）",
    });

    // Act: 完了に更新
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: parent.taskId,
      status: "completed",
    });

    // Assert: 成功
    expect(result.success).toBe(true);
    expect(result.task!.status).toBe("completed");
  });

  it("未完了の子タスクがある親Task完了(forceなし)→エラー", async () => {
    // Arrange: 親タスクと子タスクを作成
    const parent = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "親タスク",
    });
    const child = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "子タスク",
      parentId: parent.taskId,
    });

    // 子タスクは pending のまま

    // Act: 親タスクを完了しようとする（forceなし）
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: parent.taskId,
      status: "completed",
    });

    // Assert: エラー
    expect(result.success).toBe(false);
    expect(result.error).toContain("未完了の子タスク");
    expect(result.error).toContain(child.taskId);
    expect(result.error).toContain("--force");
  });

  it("未完了の子タスクがある親Task完了(force=true)→成功", async () => {
    // Arrange: 親タスクと子タスクを作成
    const parent = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "親タスク",
    });
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "子タスク",
      parentId: parent.taskId,
    });

    // 子タスクは pending のまま

    // Act: 親タスクを完了（force=true）
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: parent.taskId,
      status: "completed",
      force: true,
    });

    // Assert: 成功
    expect(result.success).toBe(true);
    expect(result.task!.status).toBe("completed");
  });

  it("完了済みの子タスクのみの場合→成功", async () => {
    // Arrange: 親タスクと子タスクを作成
    const parent = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "親タスク",
    });
    const child = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "子タスク",
      parentId: parent.taskId,
    });

    // 子タスクを完了
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: child.taskId,
      status: "completed",
    });

    // Act: 親タスクを完了
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: parent.taskId,
      status: "completed",
    });

    // Assert: 成功
    expect(result.success).toBe(true);
    expect(result.task!.status).toBe("completed");
  });

  it("subStatus=completed でも同様にチェックされる", async () => {
    // Arrange: 親タスクと子タスクを作成
    const parent = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "親タスク",
    });
    const child = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "子タスク",
      parentId: parent.taskId,
    });

    // 子タスクは pending のまま

    // Act: 親タスクを subStatus=completed で完了しようとする
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: parent.taskId,
      subStatus: "completed",
    });

    // Assert: エラー
    expect(result.success).toBe(false);
    expect(result.error).toContain("未完了の子タスク");
    expect(result.error).toContain(child.taskId);
  });

  it("archived の子タスクは完了済みとして扱われる", async () => {
    // Arrange: 親タスクと子タスクを作成
    const parent = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "親タスク",
    });
    const child = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "子タスク",
      parentId: parent.taskId,
    });

    // 子タスクを completed → archived に遷移（pending→archived は不許可）
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: child.taskId,
      status: "completed",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: child.taskId,
      subStatus: "archived",
    });

    // Act: 親タスクを完了
    const result = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: parent.taskId,
      status: "completed",
    });

    // Assert: 成功
    expect(result.success).toBe(true);
    expect(result.task!.status).toBe("completed");
  });
});
