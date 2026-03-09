/**
 * image-routes テスト
 * GET /agent-image エンドポイントのユニットテスト
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import * as os from "os";
import * as path from "path";
// ESMモック: agent-image ユーティリティ
const mockFindAgentImages = jest.fn();
jest.unstable_mockModule("../../utils/agent-image.js", () => ({
    findAgentImages: mockFindAgentImages,
    IMAGES_RELATIVE_PATH: ".maid-agent/system/resources/images",
}));
// ダイナミックインポート
const { handleAgentImage } = await import("../../routes/image-routes.js");
// Express req/res モック
function createMockReqRes(query = {}) {
    const req = { query };
    const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
        sendFile: jest.fn(),
    };
    return { req, res };
}
describe("handleAgentImage", () => {
    beforeEach(() => {
        mockFindAgentImages.mockReset();
    });
    it("agentパラメータが未指定の場合は400を返す", async () => {
        const { req, res } = createMockReqRes({ project: "/test" });
        await handleAgentImage(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalled();
    });
    it("projectパラメータが未指定の場合は400を返す", async () => {
        const { req, res } = createMockReqRes({ agent: "lily" });
        await handleAgentImage(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalled();
    });
    it("画像が見つからない場合は404を返す", async () => {
        mockFindAgentImages.mockResolvedValue([]);
        const { req, res } = createMockReqRes({ agent: "lily", project: "/test" });
        await handleAgentImage(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });
    it("画像が見つかった場合はsendFileを呼ぶ", async () => {
        mockFindAgentImages.mockResolvedValue(["lily_1.png"]);
        const { req, res } = createMockReqRes({ agent: "lily", project: "/test" });
        await handleAgentImage(req, res);
        expect(res.sendFile).toHaveBeenCalled();
        const sentPath = res.sendFile.mock.calls[0][0];
        expect(sentPath).toContain("lily_1.png");
    });
    it("Cache-Controlヘッダーが設定される", async () => {
        mockFindAgentImages.mockResolvedValue(["lily_1.png"]);
        const { req, res } = createMockReqRes({ agent: "lily", project: "/test" });
        await handleAgentImage(req, res);
        expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", expect.stringContaining("max-age"));
    });
    it("複数画像がある場合はランダムに1つ選択する", async () => {
        mockFindAgentImages.mockResolvedValue(["lily_1.png", "lily_2.png", "lily_3.png"]);
        const { req, res } = createMockReqRes({ agent: "lily", project: "/test" });
        await handleAgentImage(req, res);
        expect(res.sendFile).toHaveBeenCalledTimes(1);
        const sentPath = res.sendFile.mock.calls[0][0];
        expect(sentPath).toMatch(/lily_[123]\.png$/);
    });
    it("findAgentImagesに正しいimagesDirが渡される", async () => {
        mockFindAgentImages.mockResolvedValue(["lily_1.png"]);
        const testProject = path.join(os.tmpdir(), "Project");
        const { req, res } = createMockReqRes({ agent: "lily", project: testProject });
        await handleAgentImage(req, res);
        expect(mockFindAgentImages).toHaveBeenCalledWith(expect.stringContaining(".maid-agent/system/resources/images"), "lily");
    });
});
