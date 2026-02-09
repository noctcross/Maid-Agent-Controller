/**
 * Health エンドポイント E2E テスト
 * 対象: GET /health
 *
 * /health は central-server.ts に直接定義されているため、
 * テスト用appで同等のハンドラを再現してテストする。
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// --- モック定義 ---
jest.unstable_mockModule("../../middleware/session-manager.js", () => ({
  sessions: new Map(),
}));

jest.unstable_mockModule("../../utils/yaml-helper.js", () => ({
  getTimestamp: () => "2026-02-09T00:00:00+09:00",
}));

// --- ダイナミックインポート ---
const express = (await import("express")).default;
const supertest = (await import("supertest")).default;
const { sessions } = await import("../../middleware/session-manager.js") as { sessions: Map<string, unknown> };
const { getTimestamp } = await import("../../utils/yaml-helper.js");

// --- テスト用app構築（central-server.tsの/healthハンドラを再現） ---
const app = express();
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: getTimestamp(),
    version: "4.1.0",
    mode: "streamable-http-multiproject",
    activeConnections: sessions.size,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  sessions.clear();
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
    expect(res.body.version).toBe("4.1.0");
    expect(res.body.mode).toBe("streamable-http-multiproject");
    expect(res.body.activeConnections).toBe(0);
  });

  it("アクティブ接続数を正しく反映する", async () => {
    sessions.set("session-1", {});
    sessions.set("session-2", {});

    const res = await supertest(app).get("/health").expect(200);

    expect(res.body.activeConnections).toBe(2);
  });

  it("レスポンスに必要なフィールドが全て含まれる", async () => {
    const res = await supertest(app).get("/health").expect(200);

    const requiredFields = ["status", "timestamp", "version", "mode", "activeConnections"];
    for (const field of requiredFields) {
      expect(res.body).toHaveProperty(field);
    }
  });
});
