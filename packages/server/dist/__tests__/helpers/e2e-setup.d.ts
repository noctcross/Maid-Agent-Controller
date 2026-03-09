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
export declare const TEST_PROJECT_PATH = "/test/project";
/** テスト用タスクオブジェクトのファクトリ */
export declare function createMockTask(overrides?: Record<string, unknown>): {
    id: string;
    title: string;
    status: string;
    createdAt: string;
};
/** テスト用 ListTasks レスポンスのファクトリ */
export declare function createMockListResponse(tasks?: unknown[], total?: number): {
    tasks: unknown[];
    total: number;
    hasMore: boolean;
};
//# sourceMappingURL=e2e-setup.d.ts.map