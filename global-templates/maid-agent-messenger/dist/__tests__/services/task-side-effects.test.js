/**
 * task-side-effects テスト
 *
 * executeSideEffects の各副作用を検証
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
    readYamlFile: jest.fn(),
    writeYamlFile: jest.fn(),
    fileExists: jest.fn(),
    copyFile: jest.fn(),
    writeTextFile: jest.fn(),
    sanitizeDescription: jest.fn((s) => s || "untitled"),
    getTimestamp: jest.fn(),
    stringifyYaml: jest.fn((data) => JSON.stringify(data)),
}));
jest.unstable_mockModule("../../utils/file-lock.js", () => ({
    withFileLock: jest.fn(),
}));
jest.unstable_mockModule("fs/promises", () => ({
    readFile: jest.fn(),
    default: { readFile: jest.fn() },
}));
// dynamic import
const { readYamlFile, writeYamlFile, fileExists, copyFile, writeTextFile, sanitizeDescription, } = await import("../../utils/yaml-helper.js");
const { withFileLock } = await import("../../utils/file-lock.js");
const fsPromises = await import("fs/promises");
const { executeSideEffects } = await import("../../services/task-side-effects.js");
// 型付きモック
const mockedReadYamlFile = readYamlFile;
const mockedWriteYamlFile = writeYamlFile;
const mockedFileExists = fileExists;
const mockedCopyFile = copyFile;
const mockedWriteTextFile = writeTextFile;
const mockedSanitizeDescription = sanitizeDescription;
const mockedWithFileLock = withFileLock;
const mockedReadFile = fsPromises.readFile;
const PROJECT_PATH = "/project";
// テスト用ヘルパー: Task オブジェクト生成
function createTask(overrides = {}) {
    return {
        id: "072",
        parentId: null,
        title: "テストタスク",
        description: "テスト説明",
        priority: "medium",
        status: "assigned",
        substatus: null,
        category: "task",
        assignees: [{ agentId: "emma", role: null, subTaskId: null }],
        targetPath: null,
        createdAt: "2026-02-06T00:00:00Z",
        updatedAt: "2026-02-06T00:00:00Z",
        assignedAt: "2026-02-06T00:00:00Z",
        startedAt: null,
        completedAt: null,
        reportPaths: [],
        summary: null,
        ...overrides,
    };
}
beforeEach(() => {
    jest.clearAllMocks();
    mockedWriteYamlFile.mockResolvedValue(undefined);
    mockedFileExists.mockResolvedValue(false);
    mockedCopyFile.mockResolvedValue(true);
    mockedWriteTextFile.mockResolvedValue(true);
    mockedSanitizeDescription.mockImplementation((s) => s || "untitled");
    // withFileLock: コールバックをそのまま実行
    mockedWithFileLock.mockImplementation((async (_path, callback) => {
        return await callback();
    }));
    // readYamlFile: デフォルトで idle 状態のメイド yaml を返す
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
describe("executeSideEffects", () => {
    describe("syncMaidYaml - maid yaml 自動同期", () => {
        it("assignees 変更時に maid yaml が更新される", async () => {
            const task = createTask({ status: "assigned" });
            const params = {
                taskId: "072",
                status: "assigned",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            };
            const prevAssignees = [];
            const result = await executeSideEffects(PROJECT_PATH, task, params, "pending", prevAssignees);
            expect(mockedWriteYamlFile).toHaveBeenCalled();
            const writtenData = mockedWriteYamlFile.mock.calls[0][1];
            expect(writtenData.task_id).toBe("task-072");
            expect(writtenData.title).toBe("テストタスク");
            expect(writtenData.status).toBe("assigned");
            expect(result.maidYamlSynced).toBe(true);
        });
        it("status 変更時に maid yaml が更新される", async () => {
            const task = createTask({
                status: "working",
                assignees: [{ agentId: "sophia", role: null, subTaskId: null }],
                startedAt: "2026-02-06T01:00:00Z",
            });
            const params = {
                taskId: "072",
                status: "working",
                agentId: "sophia",
            };
            const prevAssignees = [{ agentId: "sophia", role: null, subTaskId: null }];
            const result = await executeSideEffects(PROJECT_PATH, task, params, "assigned", prevAssignees);
            expect(mockedWriteYamlFile).toHaveBeenCalled();
            const writtenData = mockedWriteYamlFile.mock.calls[0][1];
            expect(writtenData.status).toBe("working");
            expect(writtenData.started_at).toBe("2026-02-06T01:00:00Z");
            expect(result.maidYamlSynced).toBe(true);
        });
        it("tasks.yaml の pending は maid yaml では idle に変換される", async () => {
            const task = createTask({ status: "pending", assignees: [] });
            const params = {
                taskId: "072",
                status: "pending",
            };
            const prevAssignees = [{ agentId: "emma", role: null, subTaskId: null }];
            await executeSideEffects(PROJECT_PATH, task, params, "assigned", prevAssignees);
            // emma が除外されたので idle にリセット
            expect(mockedWriteYamlFile).toHaveBeenCalled();
            const writtenData = mockedWriteYamlFile.mock.calls[0][1];
            expect(writtenData.status).toBe("idle");
        });
        it("除外されたメイドの maid yaml が idle にリセットされる", async () => {
            const task = createTask({
                assignees: [{ agentId: "sophia", role: null, subTaskId: null }],
            });
            const params = {
                taskId: "072",
                assignees: [{ agentId: "sophia", role: null, subTaskId: null }],
            };
            // 以前は emma も割り当てられていた
            const prevAssignees = [
                { agentId: "emma", role: null, subTaskId: null },
                { agentId: "sophia", role: null, subTaskId: null },
            ];
            await executeSideEffects(PROJECT_PATH, task, params, "assigned", prevAssignees);
            // emma の maid yaml が idle にリセット、sophia は同期
            expect(mockedWriteYamlFile).toHaveBeenCalledTimes(2);
        });
        it("params.description が渡された場合、tasks.yaml の description より優先される", async () => {
            const task = createTask({ description: "元のdescription" });
            const params = {
                taskId: "072",
                status: "assigned",
                description: "assign_task独自の説明",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            };
            await executeSideEffects(PROJECT_PATH, task, params, "pending", []);
            const writtenData = mockedWriteYamlFile.mock.calls[0][1];
            expect(writtenData.description).toBe("assign_task独自の説明");
        });
        it("params.targetPath が渡された場合、maid yaml の target_path に設定される", async () => {
            const task = createTask({ targetPath: "/path/from/task" });
            const params = {
                taskId: "072",
                status: "assigned",
                targetPath: "/override/path",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            };
            await executeSideEffects(PROJECT_PATH, task, params, "pending", []);
            const writtenData = mockedWriteYamlFile.mock.calls[0][1];
            expect(writtenData.target_path).toBe("/override/path");
        });
        it("params.targetPath がない場合、tasks.yaml の targetPath を使用する", async () => {
            const task = createTask({ targetPath: "/path/from/task" });
            const params = {
                taskId: "072",
                status: "assigned",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            };
            await executeSideEffects(PROJECT_PATH, task, params, "pending", []);
            const writtenData = mockedWriteYamlFile.mock.calls[0][1];
            expect(writtenData.target_path).toBe("/path/from/task");
        });
    });
    describe("archiveReport - レポートアーカイブ", () => {
        it("status が completed に変更された場合、レポートがコピーされる", async () => {
            mockedFileExists.mockResolvedValue(true);
            mockedSanitizeDescription.mockReturnValue("テストタスク");
            const task = createTask({
                status: "completed",
                completedAt: "2026-02-06T02:00:00Z",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            });
            const params = {
                taskId: "072",
                status: "completed",
                agentId: "emma",
            };
            const result = await executeSideEffects(PROJECT_PATH, task, params, "working", [
                { agentId: "emma", role: null, subTaskId: null },
            ]);
            expect(mockedCopyFile).toHaveBeenCalledWith("/project/.maid-agent/system/data/reports/current_emma.md", expect.stringContaining("task-072-emma-テストタスク.md"));
            expect(result.reportArchived).toBe(true);
            expect(result.archivePath).toContain("task-072-emma-テストタスク.md");
        });
        it("params.agentId を優先して使用する", async () => {
            mockedFileExists.mockResolvedValue(true);
            mockedSanitizeDescription.mockReturnValue("テスト");
            const task = createTask({
                status: "completed",
                assignees: [
                    { agentId: "emma", role: null, subTaskId: null },
                    { agentId: "sophia", role: null, subTaskId: null },
                ],
            });
            const params = {
                taskId: "072",
                status: "completed",
                agentId: "sophia", // sophia のレポートのみ
            };
            await executeSideEffects(PROJECT_PATH, task, params, "working", [
                { agentId: "emma", role: null, subTaskId: null },
                { agentId: "sophia", role: null, subTaskId: null },
            ]);
            // sophia のレポートのみコピー
            expect(mockedCopyFile).toHaveBeenCalledTimes(1);
            expect(mockedCopyFile).toHaveBeenCalledWith("/project/.maid-agent/system/data/reports/current_sophia.md", expect.stringContaining("sophia"));
        });
        it("レポートファイルが存在しない場合はコピーしない", async () => {
            mockedFileExists.mockResolvedValue(false);
            const task = createTask({ status: "completed" });
            const params = {
                taskId: "072",
                status: "completed",
                agentId: "emma",
            };
            const result = await executeSideEffects(PROJECT_PATH, task, params, "working", [
                { agentId: "emma", role: null, subTaskId: null },
            ]);
            expect(mockedCopyFile).not.toHaveBeenCalled();
            expect(result.reportArchived).toBeUndefined();
        });
        it("status が completed 以外に変更された場合はアーカイブしない", async () => {
            const task = createTask({ status: "working" });
            const params = {
                taskId: "072",
                status: "working",
                agentId: "emma",
            };
            await executeSideEffects(PROJECT_PATH, task, params, "assigned", [
                { agentId: "emma", role: null, subTaskId: null },
            ]);
            expect(mockedCopyFile).not.toHaveBeenCalled();
        });
    });
    describe("initReportTemplate - レポートテンプレート初期化", () => {
        it("status が assigned に変更された場合、テンプレートが生成される", async () => {
            mockedFileExists.mockResolvedValue(true);
            mockedReadFile.mockResolvedValue("# 作業報告 - {{MAID_NAME}}\n## タスク: {{TASK_ID}} {{TITLE}}\n{{DESCRIPTION}}");
            const task = createTask({ status: "assigned" });
            const params = {
                taskId: "072",
                status: "assigned",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            };
            const result = await executeSideEffects(PROJECT_PATH, task, params, "pending", []);
            expect(mockedWriteTextFile).toHaveBeenCalledWith("/project/.maid-agent/system/data/reports/current_emma.md", expect.stringContaining("エマ"));
            expect(result.reportTemplatized).toBe(true);
        });
        it("テンプレートファイルが存在しない場合、フォールバックテンプレートを使用する", async () => {
            // テンプレートファイルの存在チェックで false を返す
            // syncMaidYaml 用の maid yaml 読み込みも考慮
            mockedFileExists.mockResolvedValue(false);
            const task = createTask({ status: "assigned" });
            const params = {
                taskId: "072",
                status: "assigned",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            };
            const result = await executeSideEffects(PROJECT_PATH, task, params, "pending", []);
            expect(mockedWriteTextFile).toHaveBeenCalledWith("/project/.maid-agent/system/data/reports/current_emma.md", expect.stringContaining("エマ"));
            expect(result.reportTemplatized).toBe(true);
        });
        it("status が assigned 以外に変更された場合はテンプレート生成しない", async () => {
            const task = createTask({ status: "working" });
            const params = {
                taskId: "072",
                status: "working",
                agentId: "emma",
            };
            await executeSideEffects(PROJECT_PATH, task, params, "assigned", [
                { agentId: "emma", role: null, subTaskId: null },
            ]);
            expect(mockedWriteTextFile).not.toHaveBeenCalled();
        });
    });
    describe("エラーハンドリング", () => {
        it("副作用がエラーでも例外を投げない（後方互換性）", async () => {
            mockedWriteYamlFile.mockRejectedValue(new Error("write failed"));
            const task = createTask({ status: "assigned" });
            const params = {
                taskId: "072",
                status: "assigned",
                assignees: [{ agentId: "emma", role: null, subTaskId: null }],
            };
            // 例外を投げないことを確認
            const result = await executeSideEffects(PROJECT_PATH, task, params, "pending", []);
            expect(result).toBeDefined();
        });
    });
});
