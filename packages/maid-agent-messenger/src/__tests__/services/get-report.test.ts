/**
 * get-report テスト
 *
 * タスクのレポート内容取得機能を検証
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("../../services/task-manager.js", () => ({
  executeGetTask: jest.fn(),
}));

jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  fileExists: jest.fn(),
}));

jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(),
}));

// dynamic import（モック設定後に読み込み）
const { executeGetReport } = await import("../../services/get-report.js");
const { executeGetTask } = await import("../../services/task-manager.js");
const { fileExists } = await import("../../utils/yaml-helper.js");
const { readFile } = await import("fs/promises");

// 型付きモック参照
const mockedExecuteGetTask = executeGetTask as jest.MockedFunction<typeof executeGetTask>;
const mockedFileExists = fileExists as jest.MockedFunction<typeof fileExists>;
const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

const PROJECT_PATH = "/mnt/c/Users/noct/Development/02_Projects/MaidsHouse";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("executeGetReport", () => {
  describe("正常系", () => {
    it("reportPathsが1件の場合、レポート内容を返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "040",
          parentId: null,
          title: "調査タスク",
          description: "テスト用タスク",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [{ agentId: "flora", role: null, subTaskId: null }],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: "2026-02-05T10:00:00Z",
          startedAt: "2026-02-05T11:00:00Z",
          completedAt: "2026-02-05T12:00:00Z",
          reportPaths: [".maid-agent/master/reports/task-040-flora-report.md"],
          summary: "完了",
        },
        subtasks: undefined,
      });

      const reportContent = "# 作業報告 - フローラ\n\n## タスク情報\n- task_id: task-040\n";
      const absolutePath = `${PROJECT_PATH}/.maid-agent/master/reports/task-040-flora-report.md`;
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue(reportContent);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "040" });

      expect(result.success).toBe(true);
      expect(result.reports).toHaveLength(1);
      expect(result.reports[0].path).toBe(".maid-agent/master/reports/task-040-flora-report.md");
      expect(result.reports[0].content).toBe(reportContent);
      expect(result.reports[0].error).toBeUndefined();
      expect(mockedReadFile).toHaveBeenCalledWith(absolutePath, "utf-8");
    });

    it("reportPathsが複数件の場合、全件分のレポート内容を返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "041",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [{ agentId: "emma", role: null, subTaskId: null }],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [
            ".maid-agent/master/reports/task-041-emma-report.md",
            ".maid-agent/master/reports/task-041-sophia-report.md",
          ],
          summary: null,
        },
        subtasks: undefined,
      });

      const report1 = "# レポート1\n内容1";
      const report2 = "# レポート2\n内容2";
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile
        .mockResolvedValueOnce(report1)
        .mockResolvedValueOnce(report2);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "041" });

      expect(result.success).toBe(true);
      expect(result.reports).toHaveLength(2);
      expect(result.reports[0].content).toBe(report1);
      expect(result.reports[1].content).toBe(report2);
    });

    it("reportPathsが空の場合、空配列を返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "042",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "working" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [],
          summary: null,
        },
        subtasks: undefined,
      });

      const result = await executeGetReport(PROJECT_PATH, { taskId: "042" });

      expect(result.success).toBe(true);
      expect(result.reports).toHaveLength(0);
      expect(result.message).toBe("レポートファイルが登録されていません");
    });

    it("limitパラメータで行数を制限できる", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "043",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [".maid-agent/master/reports/task-043-report.md"],
          summary: null,
        },
        subtasks: undefined,
      });

      const fullContent = "行1\n行2\n行3\n行4\n行5\n行6\n行7\n行8\n行9\n行10";
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue(fullContent);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "043", limit: 3 });

      expect(result.success).toBe(true);
      expect(result.reports[0].content).toBe("行1\n行2\n行3");
      expect(result.reports[0].truncated).toBe(true);
      expect(result.reports[0].totalLines).toBe(10);
    });

    it("limitが全行数以上の場合、truncatedはfalse", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "044",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [".maid-agent/master/reports/task-044-report.md"],
          summary: null,
        },
        subtasks: undefined,
      });

      const content = "行1\n行2\n行3";
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue(content);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "044", limit: 10 });

      expect(result.success).toBe(true);
      expect(result.reports[0].content).toBe(content);
      expect(result.reports[0].truncated).toBe(false);
    });

    it("絶対パスのreportPathもそのまま読み込む", async () => {
      const absoluteReportPath = "/mnt/c/Users/noct/Development/02_Projects/MaidsHouse/.maid-agent/master/reports/task-045-report.md";
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "045",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [absoluteReportPath],
          summary: null,
        },
        subtasks: undefined,
      });

      const content = "# レポート";
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue(content);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "045" });

      expect(result.success).toBe(true);
      expect(result.reports[0].content).toBe(content);
      // 絶対パスはそのまま使用
      expect(mockedReadFile).toHaveBeenCalledWith(absoluteReportPath, "utf-8");
    });
  });

  describe("異常系", () => {
    it("存在しないタスクIDの場合、エラーを返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: null,
        subtasks: undefined,
      });

      const result = await executeGetReport(PROJECT_PATH, { taskId: "999" });

      expect(result.success).toBe(false);
      expect(result.reports).toHaveLength(0);
      expect(result.message).toBe("タスクが見つかりません: 999");
    });

    it("レポートファイルが存在しない場合、該当ファイルにエラーを付与して返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "046",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [".maid-agent/master/reports/missing-report.md"],
          summary: null,
        },
        subtasks: undefined,
      });

      mockedFileExists.mockResolvedValue(false);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "046" });

      expect(result.success).toBe(true);
      expect(result.reports).toHaveLength(1);
      expect(result.reports[0].content).toBeNull();
      expect(result.reports[0].error).toBe("ファイルが見つかりません");
    });

    it("ファイル読み込みエラーの場合、該当ファイルにエラーを付与して返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "047",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [".maid-agent/master/reports/error-report.md"],
          summary: null,
        },
        subtasks: undefined,
      });

      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockRejectedValue(new Error("Permission denied"));

      const result = await executeGetReport(PROJECT_PATH, { taskId: "047" });

      expect(result.success).toBe(true);
      expect(result.reports).toHaveLength(1);
      expect(result.reports[0].content).toBeNull();
      expect(result.reports[0].error).toBe("読み込みエラー: Permission denied");
    });

    it("複数レポートで一部のみエラーの場合、読めたものは返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "048",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [
            ".maid-agent/master/reports/ok-report.md",
            ".maid-agent/master/reports/missing-report.md",
          ],
          summary: null,
        },
        subtasks: undefined,
      });

      mockedFileExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockedReadFile.mockResolvedValue("# 正常なレポート");

      const result = await executeGetReport(PROJECT_PATH, { taskId: "048" });

      expect(result.success).toBe(true);
      expect(result.reports).toHaveLength(2);
      expect(result.reports[0].content).toBe("# 正常なレポート");
      expect(result.reports[0].error).toBeUndefined();
      expect(result.reports[1].content).toBeNull();
      expect(result.reports[1].error).toBe("ファイルが見つかりません");
    });
  });

  describe("境界値", () => {
    it("limit=0の場合、制限なし（全行返す）", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "049",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [".maid-agent/master/reports/task-049-report.md"],
          summary: null,
        },
        subtasks: undefined,
      });

      const content = "行1\n行2\n行3\n行4\n行5";
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue(content);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "049", limit: 0 });

      expect(result.success).toBe(true);
      expect(result.reports[0].content).toBe(content);
      expect(result.reports[0].truncated).toBe(false);
    });

    it("limit=1の場合、先頭1行のみ返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "050",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [".maid-agent/master/reports/task-050-report.md"],
          summary: null,
        },
        subtasks: undefined,
      });

      const content = "行1\n行2\n行3";
      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue(content);

      const result = await executeGetReport(PROJECT_PATH, { taskId: "050", limit: 1 });

      expect(result.success).toBe(true);
      expect(result.reports[0].content).toBe("行1");
      expect(result.reports[0].truncated).toBe(true);
      expect(result.reports[0].totalLines).toBe(3);
    });

    it("空ファイルの場合、空文字列を返す", async () => {
      mockedExecuteGetTask.mockResolvedValue({
        task: {
          id: "051",
          parentId: null,
          title: "テストタスク",
          description: "",
          priority: "medium" as const,
          status: "completed" as const,
          substatus: null,
          category: "task" as const,
          assignees: [],
          createdAt: "2026-02-05T10:00:00Z",
          assignedAt: null,
          startedAt: null,
          completedAt: null,
          reportPaths: [".maid-agent/master/reports/task-051-report.md"],
          summary: null,
        },
        subtasks: undefined,
      });

      mockedFileExists.mockResolvedValue(true);
      mockedReadFile.mockResolvedValue("");

      const result = await executeGetReport(PROJECT_PATH, { taskId: "051" });

      expect(result.success).toBe(true);
      expect(result.reports[0].content).toBe("");
      expect(result.reports[0].truncated).toBe(false);
    });
  });
});
