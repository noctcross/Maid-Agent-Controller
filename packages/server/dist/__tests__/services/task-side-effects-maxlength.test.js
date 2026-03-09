import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
// config-loader をモック
const mockLoadConfig = jest.fn();
jest.unstable_mockModule("../../utils/config-loader.js", () => ({
    loadConfig: mockLoadConfig,
}));
// yaml-helper をモック
const mockSanitizeDescription = jest.fn();
const mockFileExists = jest.fn();
const mockCopyFile = jest.fn();
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
    sanitizeDescription: mockSanitizeDescription,
    fileExists: mockFileExists,
    copyFile: mockCopyFile,
    readYamlFile: jest.fn(),
    writeYamlFile: jest.fn(),
    writeTextFile: jest.fn(),
    stringifyYaml: jest.fn((data) => JSON.stringify(data)),
}));
// file-lock をモック
jest.unstable_mockModule("../../utils/file-lock.js", () => ({
    withFileLock: jest.fn((_path, fn) => fn()),
}));
describe("task-side-effects maxLength configuration", () => {
    beforeEach(async () => {
        jest.resetModules();
        mockLoadConfig.mockResolvedValue({
            formatter: {
                sanitize_description_max_length: 25,
            },
        });
        mockSanitizeDescription.mockReturnValue("test-title");
        mockFileExists.mockResolvedValue(true);
        mockCopyFile.mockResolvedValue(true);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it("should pass configured maxLength to sanitizeDescription", async () => {
        const { executeSideEffects } = await import("../../services/task-side-effects.js");
        const task = {
            id: "123",
            title: "This is a very long task title that should be truncated",
            status: "completed",
            assignees: [{ agentId: "emma", assignedAt: "2026-02-15T00:00:00Z", role: "main", subTaskId: null }],
        };
        const params = { taskId: "123", status: "completed" };
        // prevStatus を追加（5引数）- completed への遷移をテスト
        await executeSideEffects("/project", task, params, "working", task.assignees);
        expect(mockSanitizeDescription).toHaveBeenCalledWith("This is a very long task title that should be truncated", 25);
    });
    it("should use default maxLength (15) when not configured", async () => {
        mockLoadConfig.mockResolvedValue({
            formatter: {
                sanitize_description_max_length: 15,
            },
        });
        const { executeSideEffects } = await import("../../services/task-side-effects.js");
        const task = {
            id: "456",
            title: "Short title",
            status: "completed",
            assignees: [{ agentId: "sophia", assignedAt: "2026-02-15T00:00:00Z", role: "main", subTaskId: null }],
        };
        const params = { taskId: "456", status: "completed" };
        // prevStatus を追加（5引数）
        await executeSideEffects("/project", task, params, "working", task.assignees);
        expect(mockSanitizeDescription).toHaveBeenCalledWith("Short title", 15);
    });
});
