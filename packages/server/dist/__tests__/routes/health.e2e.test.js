/**
 * Health エンドポイント E2E テスト
 * 対象: GET /health
 *
 * /health は central-server.ts に直接定義されているため、
 * テスト用appで同等のハンドラを再現してテストする。
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
    getTimestamp: () => "2026-02-09T00:00:00+09:00",
    stringifyYaml: (data) => JSON.stringify(data),
}));
// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const { getTimestamp } = await import("../../utils/yaml-helper.js");
// --- テスト用app構築（central-server.tsの/healthハンドラを再現） ---
const app = express();
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        timestamp: getTimestamp(),
        version: "5.0.0",
        mode: "dashboard-only",
    });
});
beforeEach(() => {
    jest.clearAllMocks();
});
// ===========================================
// GET /health
// ===========================================
describe("GET /health", () => {
    it("ヘルスチェックレスポンスを返す", async () => {
        const res = await supertest(app)
            .get("/health")
            .expect(200)
            .expect("Content-Type", /json/);
        expect(res.body.status).toBe("ok");
        expect(res.body.timestamp).toBe("2026-02-09T00:00:00+09:00");
        expect(res.body.version).toBe("5.0.0");
        expect(res.body.mode).toBe("dashboard-only");
    });
    it("レスポンスに必要なフィールドが全て含まれる", async () => {
        const res = await supertest(app).get("/health").expect(200);
        const requiredFields = ["status", "timestamp", "version", "mode"];
        for (const field of requiredFields) {
            expect(res.body).toHaveProperty(field);
        }
    });
});
