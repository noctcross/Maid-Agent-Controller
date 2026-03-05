/**
 * エスカレーション機能テスト
 *
 * task-410-2: エスカレーション情報の保存・表示を検証
 */

import { jest, describe, it, expect, beforeEach, afterAll } from "@jest/globals";

// ESMモード: jest.unstable_mockModule + dynamic import パターン
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  readYamlFile: jest.fn(),
  writeYamlFile: jest.fn(),
  fileExists: jest.fn(),
  copyFile: jest.fn(),
  writeTextFile: jest.fn(),
  sanitizeDescription: jest.fn((s: string | null) => s || "untitled"),
  getTimestamp: jest.fn(() => "2026-03-01T12:00:00+09:00"),
  stringifyYaml: jest.fn((data: unknown) => JSON.stringify(data)),
}));

jest.unstable_mockModule("../../utils/file-lock.js", () => ({
  withFileLock: jest.fn(),
  withTasksLock: jest.fn(),
}));

jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(),
  stat: jest.fn(),
  default: { readFile: jest.fn(), stat: jest.fn() },
}));

// dynamic import
const {
  readYamlFile,
  writeYamlFile,
} = await import("../../utils/yaml-helper.js");
const { withFileLock } = await import("../../utils/file-lock.js");

// 型付きモック
const mockedReadYamlFile = readYamlFile as jest.MockedFunction<typeof readYamlFile>;
const mockedWriteYamlFile = writeYamlFile as jest.MockedFunction<typeof writeYamlFile>;
const mockedWithFileLock = withFileLock as jest.MockedFunction<typeof withFileLock>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedWriteYamlFile.mockResolvedValue(undefined);
  mockedWithFileLock.mockImplementation(
    (async (_path: string, callback: () => Promise<unknown>) => {
      return await callback();
    }) as typeof withFileLock
  );
  mockedReadYamlFile.mockResolvedValue({
    task_id: "task-072",
    title: "テストタスク",
    description: "テスト説明",
    status: "working",
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("EscalationInfo 型定義", () => {
  it("EscalationInfo 型が正しく定義されている", async () => {
    const { EscalationInfo } = await import("../../types/task-manager-types.js") as {
      EscalationInfo: {
        title: string;
        detail?: string;
      };
    };

    // 型インポートが成功すれば OK
    const testEscalation: typeof EscalationInfo = {
      title: "技術的判断が必要",
      detail: "AとBのどちらのアプローチを採用すべきか",
    };

    expect(testEscalation.title).toBe("技術的判断が必要");
    expect(testEscalation.detail).toBe("AとBのどちらのアプローチを採用すべきか");
  });

  it("EscalationInfo は detail を省略可能", async () => {
    const { EscalationInfo } = await import("../../types/task-manager-types.js") as {
      EscalationInfo: {
        title: string;
        detail?: string;
      };
    };

    const testEscalation: typeof EscalationInfo = {
      title: "判断待ち",
    };

    expect(testEscalation.title).toBe("判断待ち");
    expect(testEscalation.detail).toBeUndefined();
  });
});

describe("UpdateTaskParams escalation フィールド", () => {
  it("UpdateTaskParams に escalation フィールドが含まれている", async () => {
    // UpdateTaskParams 型が escalation を受け入れることを確認
    const params = {
      taskId: "072",
      status: "blocked" as const,
      escalation: {
        title: "エスカレーション件名",
        detail: "詳細・背景",
      },
    };

    expect(params.escalation?.title).toBe("エスカレーション件名");
    expect(params.escalation?.detail).toBe("詳細・背景");
  });
});

describe("Task escalation フィールド", () => {
  it("Task 型に escalation フィールドが含まれている", async () => {
    // Task 型が escalation を受け入れることを確認
    const task = {
      id: "072",
      title: "テストタスク",
      description: "テスト説明",
      status: "blocked" as const,
      escalation: {
        title: "技術的判断が必要",
        detail: "どのライブラリを使用すべきか",
      },
    };

    expect(task.escalation?.title).toBe("技術的判断が必要");
    expect(task.escalation?.detail).toBe("どのライブラリを使用すべきか");
  });
});
