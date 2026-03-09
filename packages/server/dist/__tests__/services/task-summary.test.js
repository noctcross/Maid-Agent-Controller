/**
 * タスク軽量版（summaryOnly）テスト
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { existsSync, rmSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { stringify } from "yaml";
// テスト用の一時ディレクトリ
const TEST_PROJECT = path.join(os.tmpdir(), "maid-test-summary");
const TASKS_FILE = path.join(TEST_PROJECT, ".maid-agent", "system", "data", "tasks.yaml");
const { executeGetTask, executeListTasks } = await import("../../services/task-manager.js");
describe("summaryOnly オプション", () => {
    beforeEach(async () => {
        if (existsSync(TEST_PROJECT)) {
            rmSync(TEST_PROJECT, { recursive: true });
        }
        mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
        // テストデータ作成
        const testData = {
            lastTaskNumber: 1,
            tasks: [
                {
                    id: "001",
                    parentId: null,
                    title: "テストタスク",
                    description: "これは非常に長い説明文です。summaryOnlyで除外されるべきフィールドです。",
                    priority: "high",
                    status: "pending",
                    substatus: null,
                    category: "task",
                    assignees: [{ agentId: "emma", role: null, subTaskId: null }],
                    targetPath: "/path/to/target",
                    createdAt: "2026-02-11T00:00:00+09:00",
                    assignedAt: null,
                    startedAt: null,
                    completedAt: null,
                    updatedAt: "2026-02-11T00:00:00+09:00",
                    reportPaths: ["/path/to/report1.md", "/path/to/report2.md"],
                    summary: null,
                },
                {
                    id: "001-1",
                    parentId: "001",
                    title: "サブタスク1",
                    description: "サブタスクの説明",
                    priority: "medium",
                    status: "working",
                    substatus: null,
                    category: "task",
                    assignees: [],
                    targetPath: null,
                    createdAt: "2026-02-11T00:00:00+09:00",
                    assignedAt: null,
                    startedAt: null,
                    completedAt: null,
                    updatedAt: "2026-02-11T00:00:00+09:00",
                    reportPaths: [],
                    summary: null,
                },
            ],
        };
        await writeFile(TASKS_FILE, stringify(testData), "utf-8");
    });
    afterEach(() => {
        if (existsSync(TEST_PROJECT)) {
            rmSync(TEST_PROJECT, { recursive: true });
        }
    });
    describe("executeGetTask", () => {
        it("summaryOnly: false（デフォルト）は全フィールドを返す", async () => {
            const result = await executeGetTask(TEST_PROJECT, { taskId: "001" });
            expect(result.task).not.toBeNull();
            expect(result.task).toHaveProperty("description");
            expect(result.task).toHaveProperty("reportPaths");
            expect(result.task).toHaveProperty("createdAt");
        });
        it("summaryOnly: true は軽量フィールドのみ返す", async () => {
            const result = await executeGetTask(TEST_PROJECT, { taskId: "001", summaryOnly: true });
            expect(result.task).not.toBeNull();
            expect(result.task).toHaveProperty("id", "001");
            expect(result.task).toHaveProperty("title", "テストタスク");
            expect(result.task).toHaveProperty("status", "pending");
            expect(result.task).toHaveProperty("priority", "high");
            expect(result.task).toHaveProperty("assignees");
            expect(result.task).toHaveProperty("parentId");
            expect(result.task).toHaveProperty("category");
            // 除外されるフィールド
            expect(result.task).not.toHaveProperty("description");
            expect(result.task).not.toHaveProperty("reportPaths");
            expect(result.task).not.toHaveProperty("createdAt");
            expect(result.task).not.toHaveProperty("targetPath");
        });
        it("summaryOnly: true + includeSubtasks でサブタスクも軽量版", async () => {
            const result = await executeGetTask(TEST_PROJECT, {
                taskId: "001",
                includeSubtasks: true,
                summaryOnly: true,
            });
            expect(result.subtasks).toHaveLength(1);
            expect(result.subtasks[0]).not.toHaveProperty("description");
            expect(result.subtasks[0]).toHaveProperty("id", "001-1");
        });
    });
    describe("executeListTasks", () => {
        it("summaryOnly: false（デフォルト）は全フィールドを返す", async () => {
            const result = await executeListTasks(TEST_PROJECT, {});
            expect(result.tasks[0]).toHaveProperty("description");
            expect(result.tasks[0]).toHaveProperty("reportPaths");
        });
        it("summaryOnly: true は軽量フィールドのみ返す", async () => {
            const result = await executeListTasks(TEST_PROJECT, { summaryOnly: true });
            expect(result.tasks).toHaveLength(2);
            expect(result.tasks[0]).toHaveProperty("id");
            expect(result.tasks[0]).toHaveProperty("title");
            expect(result.tasks[0]).toHaveProperty("status");
            expect(result.tasks[0]).not.toHaveProperty("description");
            expect(result.tasks[0]).not.toHaveProperty("reportPaths");
        });
        it("summaryOnly: true でもフィルタ・ソートは動作する", async () => {
            const result = await executeListTasks(TEST_PROJECT, {
                status: ["pending"],
                summaryOnly: true,
            });
            expect(result.tasks).toHaveLength(1);
            expect(result.tasks[0]).toHaveProperty("id", "001");
        });
    });
});
