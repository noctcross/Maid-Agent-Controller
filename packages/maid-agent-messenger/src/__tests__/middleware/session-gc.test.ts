import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

describe("cleanupIdleSessions", () => {
  let sessions: Map<string, unknown>;
  let cleanupIdleSessions: (idleTimeoutMs: number) => Promise<number>;

  beforeEach(async () => {
    const mod = await import("../../middleware/session-manager.js");
    sessions = mod.sessions;
    cleanupIdleSessions = mod.cleanupIdleSessions;
    sessions.clear();
  });

  afterEach(() => {
    sessions.clear();
  });

  it("アイドルタイムアウトを超えたセッションのみ削除される", async () => {
    const mockTransport = { close: jest.fn() };
    const mockServer = { close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };

    // 10分前のセッション（アイドル）
    sessions.set("old-session", {
      transport: mockTransport,
      server: mockServer,
      projectPath: "/test",
      createdAt: new Date(Date.now() - 600000),
      lastActivity: new Date(Date.now() - 600000),
    } as unknown);

    // 直近のセッション（アクティブ）
    sessions.set("active-session", {
      transport: { close: jest.fn() },
      server: { close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
    } as unknown);

    const cleaned = await cleanupIdleSessions(300000); // 5分

    expect(cleaned).toBe(1);
    expect(sessions.has("old-session")).toBe(false);
    expect(sessions.has("active-session")).toBe(true);
    // transport.close()はserver.close()内でSDKが呼ぶため、明示的な呼び出しは不要
    expect(mockServer.close).toHaveBeenCalled();
  });

  it("アイドルセッションがない場合は0を返す", async () => {
    sessions.set("active", {
      transport: { close: jest.fn() },
      server: { close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
    } as unknown);

    const cleaned = await cleanupIdleSessions(300000);
    expect(cleaned).toBe(0);
    expect(sessions.size).toBe(1);
  });

  it("セッションが空の場合は0を返す", async () => {
    const cleaned = await cleanupIdleSessions(300000);
    expect(cleaned).toBe(0);
  });

  it("server.close() がエラーでもセッションは削除される", async () => {
    const mockServer = {
      close: jest.fn<() => Promise<void>>().mockRejectedValue(new Error("close failed")),
    };

    sessions.set("error-session", {
      transport: { close: jest.fn() },
      server: mockServer,
      projectPath: "/test",
      createdAt: new Date(Date.now() - 600000),
      lastActivity: new Date(Date.now() - 600000),
    } as unknown);

    const cleaned = await cleanupIdleSessions(300000);
    expect(cleaned).toBe(1);
    expect(sessions.has("error-session")).toBe(false);
  });

  it("pingTimer がある場合は clearInterval される", async () => {
    const mockTimer = setInterval(() => {}, 10000);
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

    sessions.set("timer-session", {
      transport: { close: jest.fn() },
      server: { close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
      projectPath: "/test",
      createdAt: new Date(Date.now() - 600000),
      lastActivity: new Date(Date.now() - 600000),
      pingTimer: mockTimer,
    } as unknown);

    const cleaned = await cleanupIdleSessions(300000);
    expect(cleaned).toBe(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(mockTimer);

    clearIntervalSpy.mockRestore();
  });
});
