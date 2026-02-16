/**
 * update-status テスト（unified-task-state-gateway版）
 *
 * update_status は maid yaml から task_id を取得し、
 * executeUpdateTask に全処理を委譲する
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
    readYamlFile: jest.fn(),
    writeYamlFile: jest.fn(),
    getTimestamp: jest.fn(),
    fileExists: jest.fn(),
    copyFile: jest.fn(),
    sanitizeDescription: jest.fn((s) => s),
    stringifyYaml: jest.fn((data) => JSON.stringify(data)),
}));
jest.unstable_mockModule("../../services/task-manager.js", () => ({
    executeUpdateTask: jest.fn(),
}));
// dynamic import
const { executeUpdateStatus } = await import("../../services/update-status.js");
const { readYamlFile, getTimestamp } = await import("../../utils/yaml-helper.js");
const { executeUpdateTask } = await import("../../services/task-manager.js");
// 型付きモック
const mockedReadYamlFile = readYamlFile;
const mockedGetTimestamp = getTimestamp;
const mockedExecuteUpdateTask = executeUpdateTask;
const FIXED_TIMESTAMP = "2026-02-06T20:00:00+09:00";
beforeEach(() => {
    jest.clearAllMocks();
    mockedGetTimestamp.mockReturnValue(FIXED_TIMESTAMP);
    mockedExecuteUpdateTask.mockResolvedValue({
        success: true,
        task: null,
        sideEffects: {
            maidYamlSynced: true,
        },
    });
});
const baseParams = {
    queueMaidPath: "/project/.maid-agent/system/data/maid",
    currentReportsPath: "/project/.maid-agent/system/data/reports",
    archiveReportsPath: "/project/.maid-agent/master/reports",
    agentId: "emma",
};
describe("executeUpdateStatus - unified-task-state-gateway", () => {
    describe("executeUpdateTask への委譲", () => {
        it("working 時に正しいパラメータで委譲される", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "assigned",
            });
            const result = await executeUpdateStatus({
                ...baseParams,
                status: "working",
                summary: "作業開始",
            });
            expect(result.success).toBe(true);
            expect(mockedExecuteUpdateTask).toHaveBeenCalledWith("/project", expect.objectContaining({
                taskId: "072",
                status: "working",
                summary: "作業開始",
                agentId: "emma",
            }));
        });
        it("blocked 時に正しいパラメータで委譲される", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "working",
            });
            await executeUpdateStatus({
                ...baseParams,
                status: "blocked",
                summary: "依存タスク待ち",
            });
            expect(mockedExecuteUpdateTask).toHaveBeenCalledWith("/project", expect.objectContaining({
                taskId: "072",
                status: "blocked",
                summary: "依存タスク待ち",
                agentId: "emma",
            }));
        });
        it("completed 時に正しいパラメータで委譲される", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "working",
            });
            mockedExecuteUpdateTask.mockResolvedValue({
                success: true,
                task: null,
                sideEffects: {
                    maidYamlSynced: true,
                    reportArchived: true,
                    archivePath: "/project/.maid-agent/master/reports/task-072-emma-test.md",
                },
            });
            const result = await executeUpdateStatus({
                ...baseParams,
                status: "completed",
                summary: "完了",
            });
            expect(result.success).toBe(true);
            expect(mockedExecuteUpdateTask).toHaveBeenCalledWith("/project", expect.objectContaining({
                taskId: "072",
                status: "completed",
                summary: "完了",
                agentId: "emma",
            }));
            expect(result.updated_fields).toContain("tasks_yaml_synced");
            expect(result.archive_path).toContain("task-072-emma-test.md");
        });
        it("blocked + escalation: true 時に escalation が委譲される", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "working",
            });
            await executeUpdateStatus({
                ...baseParams,
                status: "blocked",
                summary: "ライセンス判断が必要",
                escalation: true,
            });
            expect(mockedExecuteUpdateTask).toHaveBeenCalledWith("/project", expect.objectContaining({
                taskId: "072",
                status: "blocked",
                summary: "ライセンス判断が必要",
                agentId: "emma",
                escalation: true,
            }));
        });
        it("escalation 省略時は undefined のまま委譲される", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "working",
            });
            await executeUpdateStatus({
                ...baseParams,
                status: "blocked",
                summary: "依存タスク待ち",
            });
            expect(mockedExecuteUpdateTask).toHaveBeenCalledWith("/project", expect.objectContaining({
                taskId: "072",
                status: "blocked",
                summary: "依存タスク待ち",
                agentId: "emma",
            }));
            // escalation が明示的に渡されていないことを確認
            const callArgs = mockedExecuteUpdateTask.mock.calls[0][1];
            expect(callArgs.escalation).toBeUndefined();
        });
    });
    describe("task_id 正規化", () => {
        it("task- プレフィックスが正規化される", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-task-072",
                status: "working",
            });
            await executeUpdateStatus({
                ...baseParams,
                status: "blocked",
            });
            expect(mockedExecuteUpdateTask).toHaveBeenCalledWith("/project", expect.objectContaining({
                taskId: "072",
            }));
        });
        it("末尾の -agentId が除去される", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072-emma",
                status: "working",
            });
            await executeUpdateStatus({
                ...baseParams,
                status: "completed",
            });
            expect(mockedExecuteUpdateTask).toHaveBeenCalledWith("/project", expect.objectContaining({
                taskId: "072",
            }));
        });
    });
    describe("task_id がない場合", () => {
        it("task_id がない場合、executeUpdateTask は呼ばれず成功を返す", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: null,
                status: "idle",
            });
            const result = await executeUpdateStatus({
                ...baseParams,
                status: "working",
            });
            expect(result.success).toBe(true);
            expect(mockedExecuteUpdateTask).not.toHaveBeenCalled();
        });
    });
    describe("後方互換性", () => {
        it("executeUpdateTask が失敗しても全体は成功する", async () => {
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "working",
            });
            mockedExecuteUpdateTask.mockRejectedValue(new Error("tasks.yaml not found"));
            const result = await executeUpdateStatus({
                ...baseParams,
                status: "completed",
                summary: "完了",
            });
            expect(result.success).toBe(true);
        });
    });
    describe("maid yaml 直書きの廃止", () => {
        it("writeYamlFile が呼ばれない", async () => {
            const { writeYamlFile } = await import("../../utils/yaml-helper.js");
            const mockedWriteYamlFile = writeYamlFile;
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "working",
            });
            await executeUpdateStatus({
                ...baseParams,
                status: "completed",
                summary: "完了",
            });
            expect(mockedWriteYamlFile).not.toHaveBeenCalled();
        });
        it("copyFile が直接呼ばれない", async () => {
            const { copyFile } = await import("../../utils/yaml-helper.js");
            const mockedCopyFile = copyFile;
            mockedReadYamlFile.mockResolvedValue({
                task_id: "task-072",
                status: "working",
            });
            await executeUpdateStatus({
                ...baseParams,
                status: "completed",
                summary: "完了",
            });
            expect(mockedCopyFile).not.toHaveBeenCalled();
        });
    });
});
