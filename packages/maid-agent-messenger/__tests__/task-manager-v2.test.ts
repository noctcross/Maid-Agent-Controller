/**
 * タスク管理サービス V2.1 テスト
 *
 * V2.1 で追加された機能のテスト:
 * - resolveBlockedTasks: 依存解消自動通知
 * - checkGoalAutoClose: Goal自動クローズ判定
 * - migrateToV2: V2.1マイグレーション
 * - convertToV2Status: ステータス変換
 * - inferTaskType: タスク種別推定
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  executeCreateTask,
  executeGetTask,
  executeUpdateTask,
  resolveBlockedTasks,
  checkGoalAutoClose,
  migrateToV2,
  checkMigrationStatus,
  convertToV2Status,
  inferTaskType,
  type Task,
  type TasksData,
} from "../src/services/task-manager";

const TEST_PROJECT_PATH = "/tmp/test-maid-agent-v2";

/**
 * テスト用ヘルパー: テストディレクトリの初期化
 */
async function setupTestProject(): Promise<void> {
  const dataDir = path.join(TEST_PROJECT_PATH, ".maid-agent", "system", "data");
  await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  await fs.mkdir(dataDir, { recursive: true });
}

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
 * テスト用ヘルパー: 旧形式のタスクを作成
 */
async function createLegacyTask(
  title: string,
  options: { parentId?: string; status?: string } = {}
): Promise<string> {
  const result = await executeCreateTask(TEST_PROJECT_PATH, {
    title,
    parentId: options.parentId,
  });

  // 旧形式に戻す（V2.1フィールドを削除）
  const { stringify } = await import("yaml");
  const data = await readTasksYaml();
  if (data) {
    const task = data.tasks.find((t) => t.id === result.taskId);
    if (task) {
      delete task.type;
      delete task.mainStatus;
      delete task.v2Substatus;
      delete task.size;
      delete task.tentative;
      delete task.artifacts;
      delete task.blockedBy;

      if (options.status) {
        task.status = options.status as Task["status"];
      }

      const filePath = path.join(TEST_PROJECT_PATH, ".maid-agent", "system", "data", "tasks.yaml");
      await fs.writeFile(filePath, stringify(data), "utf-8");
    }
  }

  return result.taskId;
}

describe("V2.1: resolveBlockedTasks - 依存解消自動通知", () => {
  beforeEach(async () => {
    await setupTestProject();
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  });

  it("完了タスクに依存するタスクのblockedByを解消し、waiting→activeに変更する", async () => {
    // タスクA作成
    const taskA = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクA",
    });

    // タスクB作成（タスクAに依存）
    const taskB = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクB",
      blockedBy: [taskA.taskId],
    });

    // タスクBが waiting であることを確認
    let taskBResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: taskB.taskId });
    const taskBData = taskBResult.task as Task;
    expect(taskBData?.v2Substatus).toBe("waiting");
    expect(taskBData?.blockedBy).toContain(taskA.taskId);

    // タスクA完了時に依存解消を実行
    const result = await resolveBlockedTasks(TEST_PROJECT_PATH, taskA.taskId);

    // 結果の確認
    expect(result.unblockedTasks.length).toBe(1);
    expect(result.unblockedTasks[0].taskId).toBe(taskB.taskId);
    expect(result.unblockedTasks[0].previousSubstatus).toBe("waiting");

    // タスクBが active になっていることを確認
    taskBResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: taskB.taskId });
    const taskBUpdated = taskBResult.task as Task;
    expect(taskBUpdated?.v2Substatus).toBe("active");
    expect(taskBUpdated?.blockedBy).toEqual([]);
  });

  it("依存するタスクがない場合は空の結果を返す", async () => {
    const taskA = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクA（依存なし）",
    });

    const result = await resolveBlockedTasks(TEST_PROJECT_PATH, taskA.taskId);

    expect(result.unblockedTasks.length).toBe(0);
  });

  it("複数の依存元がある場合、1つ完了しても残りがある間はwaitingのまま", async () => {
    // タスクA, C 作成
    const taskA = await executeCreateTask(TEST_PROJECT_PATH, { title: "タスクA" });
    const taskC = await executeCreateTask(TEST_PROJECT_PATH, { title: "タスクC" });

    // タスクB作成（A, C両方に依存）
    const taskB = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクB",
      blockedBy: [taskA.taskId, taskC.taskId],
    });

    // タスクA完了
    await resolveBlockedTasks(TEST_PROJECT_PATH, taskA.taskId);

    // タスクBはまだ waiting（Cが残っている）
    let taskBResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: taskB.taskId });
    let taskBData = taskBResult.task as Task;
    expect(taskBData?.v2Substatus).toBe("waiting");
    expect(taskBData?.blockedBy).toEqual([taskC.taskId]);

    // タスクC完了
    const result = await resolveBlockedTasks(TEST_PROJECT_PATH, taskC.taskId);

    // タスクBが active に
    expect(result.unblockedTasks.length).toBe(1);
    taskBResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: taskB.taskId });
    taskBData = taskBResult.task as Task;
    expect(taskBData?.v2Substatus).toBe("active");
    expect(taskBData?.blockedBy).toEqual([]);
  });
});

describe("V2.1: checkGoalAutoClose - Goal自動クローズ判定", () => {
  beforeEach(async () => {
    await setupTestProject();
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  });

  it("全Phaseが完了したGoalは自動クローズ可能", async () => {
    // Goal作成
    const goal = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "テストGoal",
      type: "goal",
      size: "standard",
    });

    // Phase作成
    const phase1 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "Phase1",
      type: "phase",
      parentId: goal.taskId,
    });
    const phase2 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "Phase2",
      type: "phase",
      parentId: goal.taskId,
    });

    // Phase1, Phase2 を完了
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: phase1.taskId,
      v2Substatus: "completed",
    });
    await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: phase2.taskId,
      v2Substatus: "completed",
    });

    // 自動クローズ判定
    const result = await checkGoalAutoClose(TEST_PROJECT_PATH, goal.taskId);
    expect(result.canAutoClose).toBe(true);
  });

  it("simple Goal は自動クローズ不可（手動クローズが必要）", async () => {
    const goal = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "Simple Goal",
      type: "goal",
      size: "simple",
    });

    const result = await checkGoalAutoClose(TEST_PROJECT_PATH, goal.taskId);
    expect(result.canAutoClose).toBe(false);
    expect(result.reason).toContain("Simple goal");
  });

  it("tentative Goal は自動クローズ不可", async () => {
    const goal = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "Tentative Goal",
      type: "goal",
      tentative: true,
    });

    const result = await checkGoalAutoClose(TEST_PROJECT_PATH, goal.taskId);
    expect(result.canAutoClose).toBe(false);
    expect(result.reason).toContain("Tentative");
  });

  it("未完了のPhaseがあるGoalは自動クローズ不可", async () => {
    const goal = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "Incomplete Goal",
      type: "goal",
      size: "standard",
    });

    const phase1 = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "Phase1",
      type: "phase",
      parentId: goal.taskId,
    });

    // Phase1 は active のまま

    const result = await checkGoalAutoClose(TEST_PROJECT_PATH, goal.taskId);
    expect(result.canAutoClose).toBe(false);
    expect(result.reason).toContain("Not all phases completed");
  });

  it("除外カテゴリ（skill_candidate等）のGoalは自動クローズ不可", async () => {
    const goal = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "Skill Candidate Goal",
      type: "goal",
      size: "standard",
      category: "skill_candidate",
    });

    const result = await checkGoalAutoClose(TEST_PROJECT_PATH, goal.taskId);
    expect(result.canAutoClose).toBe(false);
    expect(result.reason).toContain("Excluded category");
  });
});

describe("V2.1: migrateToV2 - マイグレーション", () => {
  beforeEach(async () => {
    await setupTestProject();
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  });

  it("旧形式のタスクにV2.1フィールドが追加される", async () => {
    // 旧形式のタスク作成
    await createLegacyTask("レガシータスク");

    // マイグレーション前の状態確認
    let status = await checkMigrationStatus(TEST_PROJECT_PATH);
    expect(status.legacyTasks).toBe(1);
    expect(status.v2Tasks).toBe(0);

    // マイグレーション実行
    const result = await migrateToV2(TEST_PROJECT_PATH);

    expect(result.migratedTasks).toBe(1);
    expect(result.skippedTasks).toBe(0);

    // マイグレーション後の状態確認
    status = await checkMigrationStatus(TEST_PROJECT_PATH);
    expect(status.legacyTasks).toBe(0);
    expect(status.v2Tasks).toBe(1);
  });

  it("dry-run モードでは変更が保存されない", async () => {
    await createLegacyTask("ドライランタスク");

    // dry-run マイグレーション
    const result = await migrateToV2(TEST_PROJECT_PATH, { dryRun: true });

    expect(result.migratedTasks).toBe(1);

    // 状態は変わっていない
    const status = await checkMigrationStatus(TEST_PROJECT_PATH);
    expect(status.legacyTasks).toBe(1);
    expect(status.v2Tasks).toBe(0);
  });

  it("既にV2.1形式のタスクはスキップされる", async () => {
    // V2.1形式のタスク作成
    await executeCreateTask(TEST_PROJECT_PATH, {
      title: "V2.1タスク",
      type: "action",
    });

    // マイグレーション実行
    const result = await migrateToV2(TEST_PROJECT_PATH);

    expect(result.migratedTasks).toBe(0);
    expect(result.skippedTasks).toBe(1);
  });

  it("親タスクはgoal、子タスクはaction/phaseに分類される", async () => {
    // 親タスク（旧形式）
    const parentId = await createLegacyTask("親タスク");
    // 子タスク（旧形式）
    await createLegacyTask("子タスク", { parentId });

    // マイグレーション
    await migrateToV2(TEST_PROJECT_PATH);

    // 確認
    const parentResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: parentId });
    expect((parentResult.task as Task)?.type).toBe("goal");

    // 子タスクのIDを取得
    const data = await readTasksYaml();
    const childTask = data?.tasks.find((t) => t.parentId === parentId);
    expect(childTask?.type).toBe("action");
  });

  it("completed状態の旧タスクはclosed/completedに変換される", async () => {
    const taskId = await createLegacyTask("完了タスク", { status: "completed" });

    await migrateToV2(TEST_PROJECT_PATH);

    const result = await executeGetTask(TEST_PROJECT_PATH, { taskId });
    expect((result.task as Task)?.mainStatus).toBe("closed");
    expect((result.task as Task)?.v2Substatus).toBe("completed");
  });
});

describe("V2.1: convertToV2Status - ステータス変換", () => {
  it("working → open/active に変換", () => {
    const task = { status: "working" } as Task;
    const result = convertToV2Status(task);
    expect(result.mainStatus).toBe("open");
    expect(result.substatus).toBe("active");
  });

  it("completed → closed/completed に変換", () => {
    const task = { status: "completed" } as Task;
    const result = convertToV2Status(task);
    expect(result.mainStatus).toBe("closed");
    expect(result.substatus).toBe("completed");
  });

  it("blocked (blockedBy有り) → open/waiting に変換", () => {
    const task = { status: "blocked", blockedBy: ["001"] } as Task;
    const result = convertToV2Status(task);
    expect(result.mainStatus).toBe("open");
    expect(result.substatus).toBe("waiting");
  });

  it("blocked (blockedBy無し) → open/checkpoint に変換", () => {
    const task = { status: "blocked", blockedBy: [] } as unknown as Task;
    const result = convertToV2Status(task);
    expect(result.mainStatus).toBe("open");
    expect(result.substatus).toBe("checkpoint");
  });

  it("既にV2.1形式の場合はそのまま返す", () => {
    const task = {
      status: "pending",
      mainStatus: "open",
      v2Substatus: "paused",
    } as Task;
    const result = convertToV2Status(task);
    expect(result.mainStatus).toBe("open");
    expect(result.substatus).toBe("paused");
  });
});

describe("V2.1: inferTaskType - タスク種別推定", () => {
  it("type が設定済みの場合はそのまま返す", () => {
    const task = { type: "investigation" } as Task;
    expect(inferTaskType(task)).toBe("investigation");
  });

  it("parentId が null の場合は goal", () => {
    const task = { parentId: null } as Task;
    expect(inferTaskType(task)).toBe("goal");
  });

  it("parentId がある場合は action", () => {
    const task = { parentId: "001" } as Task;
    expect(inferTaskType(task)).toBe("action");
  });
});

describe("V2.1: executeUpdateTask - completed時に依存解消が呼ばれる", () => {
  beforeEach(async () => {
    await setupTestProject();
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  });

  it("status=completed 時に依存タスクが自動解消される", async () => {
    // タスクA作成
    const taskA = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクA",
    });

    // タスクB作成（タスクAに依存）
    const taskB = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクB",
      blockedBy: [taskA.taskId],
    });

    // タスクBが waiting であることを確認
    let taskBResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: taskB.taskId });
    let taskBData = taskBResult.task as Task;
    expect(taskBData?.v2Substatus).toBe("waiting");

    // タスクAを完了
    const updateResult = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: taskA.taskId,
      status: "completed",
    });

    // sideEffects に依存解消結果が含まれる
    expect(updateResult.sideEffects?.dependencyResolved).toBe(true);
    expect(updateResult.sideEffects?.unblockedTasks?.length).toBe(1);

    // タスクBが active になっている
    taskBResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: taskB.taskId });
    taskBData = taskBResult.task as Task;
    expect(taskBData?.v2Substatus).toBe("active");
  });

  it("v2Substatus=completed 時にも依存解消が呼ばれる", async () => {
    const taskA = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクA",
    });

    const taskB = await executeCreateTask(TEST_PROJECT_PATH, {
      title: "タスクB",
      blockedBy: [taskA.taskId],
    });

    // V2.1 substatus で完了
    const updateResult = await executeUpdateTask(TEST_PROJECT_PATH, {
      taskId: taskA.taskId,
      v2Substatus: "completed",
    });

    expect(updateResult.sideEffects?.dependencyResolved).toBe(true);

    const taskBResult = await executeGetTask(TEST_PROJECT_PATH, { taskId: taskB.taskId });
    const taskBData = taskBResult.task as Task;
    expect(taskBData?.v2Substatus).toBe("active");
  });
});
