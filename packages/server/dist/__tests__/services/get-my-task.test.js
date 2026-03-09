/**
 * get-my-task ビジネスロジックのテスト
 *
 * 親タスク情報の取得機能を含む
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { stringify as stringifyYaml } from "yaml";
// テスト対象モジュールを動的にインポート
let executeGetMyTask;
describe("executeGetMyTask", () => {
    let tempDir;
    let queueMaidPath;
    let projectPath;
    let tasksYamlPath;
    beforeEach(async () => {
        // 一時ディレクトリを作成
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "get-my-task-test-"));
        queueMaidPath = path.join(tempDir, ".maid-agent", "system", "data", "maid");
        projectPath = tempDir;
        tasksYamlPath = path.join(tempDir, ".maid-agent", "system", "data", "tasks.yaml");
        await fs.mkdir(queueMaidPath, { recursive: true });
        await fs.mkdir(path.dirname(tasksYamlPath), { recursive: true });
        // モジュールをインポート
        const module = await import("../../services/get-my-task.js");
        executeGetMyTask = module.executeGetMyTask;
    });
    afterEach(async () => {
        // 一時ディレクトリを削除
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("親タスクがない場合はparent_chainが含まれない", async () => {
        // エージェントのタスクファイルを作成
        const agentYaml = stringifyYaml({
            task_id: "task-100",
            description: "テストタスク",
            status: "working",
            assigned_at: "2026-02-25T10:00:00Z",
        });
        await fs.writeFile(path.join(queueMaidPath, "flora.yaml"), agentYaml);
        // tasks.yaml を作成（親タスクなし）
        const tasksYaml = stringifyYaml({
            lastTaskNumber: 100,
            tasks: [
                { id: "task-100", title: "テストタスク", type: "step", parentId: null },
            ],
        });
        await fs.writeFile(tasksYamlPath, tasksYaml);
        const result = await executeGetMyTask({
            queueMaidPath,
            agentId: "flora",
            projectPath,
        });
        expect(result.task_id).toBe("task-100");
        expect(result.parent_chain).toBeUndefined();
    });
    it("親タスクがある場合はparent_chainに階層情報が含まれる", async () => {
        // エージェントのタスクファイルを作成
        const agentYaml = stringifyYaml({
            task_id: "task-100-1",
            description: "子タスク",
            status: "working",
            assigned_at: "2026-02-25T10:00:00Z",
        });
        await fs.writeFile(path.join(queueMaidPath, "flora.yaml"), agentYaml);
        // tasks.yaml を作成（親子関係あり）
        const tasksYaml = stringifyYaml({
            lastTaskNumber: 100,
            tasks: [
                { id: "task-100", title: "親Goal", type: "task", parentId: null, description: "Goalの説明" },
                { id: "task-100-1", title: "子Action", type: "step", parentId: "task-100" },
            ],
        });
        await fs.writeFile(tasksYamlPath, tasksYaml);
        const result = await executeGetMyTask({
            queueMaidPath,
            agentId: "flora",
            projectPath,
        });
        expect(result.task_id).toBe("task-100-1");
        expect(result.parent_chain).toBeDefined();
        expect(result.parent_chain).toHaveLength(1);
        expect(result.parent_chain[0]).toEqual({
            id: "task-100",
            title: "親Goal",
            type: "task",
            description: "Goalの説明",
            subStatus: undefined,
        });
    });
    it("複数階層の親タスクがある場合はGoal→Phaseの順でparent_chainが返される", async () => {
        // エージェントのタスクファイルを作成
        const agentYaml = stringifyYaml({
            task_id: "task-100-P1-1",
            description: "孫タスク",
            status: "working",
            assigned_at: "2026-02-25T10:00:00Z",
        });
        await fs.writeFile(path.join(queueMaidPath, "flora.yaml"), agentYaml);
        // tasks.yaml を作成（3階層）
        const tasksYaml = stringifyYaml({
            lastTaskNumber: 100,
            tasks: [
                { id: "task-100", title: "最上位Goal", type: "task", parentId: null },
                { id: "task-100-P1", title: "中間Phase", type: "work", parentId: "task-100" },
                { id: "task-100-P1-1", title: "末端Action", type: "step", parentId: "task-100-P1" },
            ],
        });
        await fs.writeFile(tasksYamlPath, tasksYaml);
        const result = await executeGetMyTask({
            queueMaidPath,
            agentId: "flora",
            projectPath,
        });
        expect(result.task_id).toBe("task-100-P1-1");
        expect(result.parent_chain).toBeDefined();
        expect(result.parent_chain).toHaveLength(2);
        // Goal が先（配列の最初）
        expect(result.parent_chain[0].id).toBe("task-100");
        expect(result.parent_chain[0].type).toBe("task");
        // Phase が次
        expect(result.parent_chain[1].id).toBe("task-100-P1");
        expect(result.parent_chain[1].type).toBe("work");
    });
    it("projectPathが未指定の場合はparent_chainが含まれない", async () => {
        // エージェントのタスクファイルを作成
        const agentYaml = stringifyYaml({
            task_id: "task-100-1",
            description: "子タスク",
            status: "working",
            assigned_at: "2026-02-25T10:00:00Z",
        });
        await fs.writeFile(path.join(queueMaidPath, "flora.yaml"), agentYaml);
        // projectPath を指定しない
        const result = await executeGetMyTask({
            queueMaidPath,
            agentId: "flora",
            // projectPath は未指定
        });
        expect(result.task_id).toBe("task-100-1");
        expect(result.parent_chain).toBeUndefined();
    });
});
