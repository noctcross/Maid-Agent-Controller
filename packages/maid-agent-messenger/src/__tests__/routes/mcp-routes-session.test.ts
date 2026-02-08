import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from "@jest/globals";
import express from "express";
import http from "http";
import type { AddressInfo } from "net";

// Mock validateProjectPath to skip filesystem checks
jest.unstable_mockModule("../../middleware/session-manager.js", () => ({
  sessions: new Map(),
  validateProjectPath: () => null, // always valid
  cleanupIdleSessions: () => Promise.resolve(0),
  getProjectPathFromRequest: () => "/test/project",
}));

describe("MCP Routes - Session handling", () => {
  let server: http.Server;
  let port: number;
  let sessions: Map<string, unknown>;

  beforeAll(async () => {
    const sessionMod = await import("../../middleware/session-manager.js");
    sessions = sessionMod.sessions;
    sessions.clear();

    const { createMcpRoutes } = await import("../../routes/mcp-routes.js");

    const app = express();
    app.use(express.json());

    const router = createMcpRoutes({
      sessions: sessions as never,
      createMcpServer: (() => ({
        connect: jest.fn(),
        server: { request: jest.fn() },
      })) as never,
    });
    app.use(router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  beforeEach(() => {
    sessions.clear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Maid-Project-Path": "/test/project",
          ...headers,
        },
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode!, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode!, body: data });
          }
        });
      });
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // --- POST /mcp ---

  it("POST: 期限切れセッションIDに404を返す", async () => {
    const result = await makeRequest("POST", "/mcp", {
      "Mcp-Session-Id": "expired-session-id",
    }, { jsonrpc: "2.0", method: "tools/list", id: 1 });

    expect(result.status).toBe(404);
    expect((result.body as Record<string, unknown>).error).toBeDefined();
  });

  it("POST: セッションIDなし + initialize以外に400を返す", async () => {
    const result = await makeRequest("POST", "/mcp", {}, {
      jsonrpc: "2.0", method: "tools/list", id: 1,
    });

    expect(result.status).toBe(400);
  });

  // --- GET /mcp ---

  it("GET: セッションIDなしに400を返す", async () => {
    const result = await makeRequest("GET", "/mcp");
    expect(result.status).toBe(400);
  });

  it("GET: 期限切れセッションIDに404を返す", async () => {
    const result = await makeRequest("GET", "/mcp", {
      "Mcp-Session-Id": "expired-session-id",
    });
    expect(result.status).toBe(404);
  });

  // --- DELETE /mcp ---

  it("DELETE: セッションIDなしに400を返す", async () => {
    const result = await makeRequest("DELETE", "/mcp");
    expect(result.status).toBe(400);
  });

  it("DELETE: 不在セッションIDに404を返す", async () => {
    const result = await makeRequest("DELETE", "/mcp", {
      "Mcp-Session-Id": "non-existent-session",
    });
    expect(result.status).toBe(404);
  });
});
