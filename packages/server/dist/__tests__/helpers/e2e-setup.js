/**
 * E2Eテスト共通ヘルパー
 * - テスト用定数
 * - 共通のモックレスポンスファクトリ
 *
 * 注意: jest.unstable_mockModule() やapp構築は各テストファイルで行う。
 * ESMの制約上、モック定義はテストファイルのモジュールスコープで行う必要があるため、
 * ヘルパーでのモック定義の共通化は行わない。
 */
/** テスト用プロジェクトパス定数 */
export const TEST_PROJECT_PATH = "/test/project";
/** テスト用タスクオブジェクトのファクトリ */
export function createMockTask(overrides = {}) {
    return {
        id: "001",
        title: "Test task",
        status: "pending",
        createdAt: "2026-02-09T00:00:00+09:00",
        ...overrides,
    };
}
/** テスト用 ListTasks レスポンスのファクトリ */
export function createMockListResponse(tasks = [], total) {
    return {
        tasks,
        total: total ?? tasks.length,
        hasMore: false,
    };
}
