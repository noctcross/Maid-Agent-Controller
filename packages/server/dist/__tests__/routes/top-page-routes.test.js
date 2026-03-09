/**
 * Top Page Routes テスト
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
// --- モック定義 ---
const mockListProjects = jest.fn();
const mockTogglePin = jest.fn();
const mockToggleHide = jest.fn();
const mockExecuteListTasks = jest.fn();
jest.unstable_mockModule("../../services/project-registry.js", () => ({
    listProjects: mockListProjects,
    togglePin: mockTogglePin,
    toggleHide: mockToggleHide,
    recordProjectAccess: jest.fn(),
}));
jest.unstable_mockModule("../../services/index.js", () => ({
    executeListTasks: mockExecuteListTasks,
}));
jest.unstable_mockModule("fs", () => ({
    existsSync: () => true,
}));
// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const { createTopPageRoutes } = await import("../../routes/top-page-routes.js");
// --- ビュー関数のスタブ ---
const stubGenerateTopPageHtml = jest.fn()
    .mockReturnValue("<html><body>stub top page</body></html>");
// --- テスト用app構築 ---
const app = express();
app.use(express.json());
app.use(createTopPageRoutes({
    generateTopPageHtml: stubGenerateTopPageHtml,
}));
beforeEach(() => {
    jest.clearAllMocks();
    mockListProjects.mockResolvedValue([]);
    mockExecuteListTasks.mockResolvedValue({ tasks: [], total: 0 });
});
describe("GET /", () => {
    it("トップページHTMLを返す", async () => {
        mockListProjects.mockResolvedValue([
            { path: "/test", name: "test", pinned: false, hidden: false, lastAccessedAt: "2026-01-01", firstAccessedAt: "2026-01-01", accessCount: 1 },
        ]);
        const res = await supertest(app)
            .get("/")
            .expect(200)
            .expect("Content-Type", /html/);
        expect(res.text).toContain("stub top page");
        expect(stubGenerateTopPageHtml).toHaveBeenCalledTimes(1);
    });
});
describe("GET /api/projects", () => {
    it("プロジェクト一覧JSONを返す", async () => {
        mockListProjects.mockResolvedValue([
            { path: "/test", name: "test" },
        ]);
        const res = await supertest(app)
            .get("/api/projects")
            .expect(200)
            .expect("Content-Type", /json/);
        expect(res.body.projects).toHaveLength(1);
    });
});
describe("PATCH /api/projects/:encodedPath/pin", () => {
    it("ピン留めをトグルする", async () => {
        mockTogglePin.mockResolvedValue(true);
        const encodedPath = encodeURIComponent("/test/project");
        const res = await supertest(app)
            .patch(`/api/projects/${encodedPath}/pin`)
            .expect(200);
        expect(res.body.success).toBe(true);
        expect(mockTogglePin).toHaveBeenCalledWith("/test/project");
    });
    it("存在しないプロジェクトに404を返す", async () => {
        mockTogglePin.mockResolvedValue(false);
        const encodedPath = encodeURIComponent("/nonexistent");
        await supertest(app)
            .patch(`/api/projects/${encodedPath}/pin`)
            .expect(404);
    });
});
describe("PATCH /api/projects/:encodedPath/hide", () => {
    it("非表示をトグルする", async () => {
        mockToggleHide.mockResolvedValue(true);
        const encodedPath = encodeURIComponent("/test/project");
        const res = await supertest(app)
            .patch(`/api/projects/${encodedPath}/hide`)
            .expect(200);
        expect(res.body.success).toBe(true);
    });
});
