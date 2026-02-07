import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

describe("KeepAliveManager", () => {
  let KeepAliveManager: typeof import("../../middleware/keepalive-manager.js").KeepAliveManager;
  let sessions: Map<string, unknown>;

  const defaultConfig = {
    session_idle_timeout: 300000,
    gc_interval: 60000,
    http_keepalive_timeout: 65000,
    http_headers_timeout: 66000,
    ping_enabled: true,
    ping_interval: 1000,   // テスト用に短く
    ping_timeout: 500,
    max_missed_pings: 2,
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    const sessionMod = await import("../../middleware/session-manager.js");
    sessions = sessionMod.sessions;
    sessions.clear();

    const mod = await import("../../middleware/keepalive-manager.js");
    KeepAliveManager = mod.KeepAliveManager;
  });

  afterEach(() => {
    sessions.clear();
    jest.useRealTimers();
  });

  it("ping_enabled: false の場合タイマーが設定されない", () => {
    const manager = new KeepAliveManager({ ...defaultConfig, ping_enabled: false });
    const session = {
      transport: { close: jest.fn() },
      server: { server: { request: jest.fn() } },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
      missedPings: 0,
    };
    sessions.set("test-session", session as unknown);

    manager.startPing("test-session", session as never);
    expect((session as Record<string, unknown>).pingTimer).toBeUndefined();
  });

  it("ping成功時にmissedPingsがリセットされる", async () => {
    const manager = new KeepAliveManager(defaultConfig);
    const mockRequest = jest.fn<() => Promise<object>>().mockResolvedValue({});
    const session = {
      transport: { close: jest.fn() },
      server: { server: { request: mockRequest } },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(Date.now() - 60000),
      missedPings: 1,
    };
    sessions.set("test-session", session as unknown);

    manager.startPing("test-session", session as never);
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); // flush microtasks

    expect(mockRequest).toHaveBeenCalled();
    expect(session.missedPings).toBe(0);
  });

  it("ping失敗時にmissedPingsが増加する", async () => {
    const manager = new KeepAliveManager(defaultConfig);
    const mockRequest = jest.fn<() => Promise<object>>().mockRejectedValue(new Error("timeout"));
    const session = {
      transport: { close: jest.fn() },
      server: { server: { request: mockRequest } },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
      missedPings: 0,
    };
    sessions.set("test-session", session as unknown);

    manager.startPing("test-session", session as never);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(session.missedPings).toBe(1);
  });

  it("max_missed_pings超過でPingは停止されるがセッションは保全される", async () => {
    const manager = new KeepAliveManager(defaultConfig);
    const mockRequest = jest.fn<() => Promise<object>>().mockRejectedValue(new Error("timeout"));
    const mockClose = jest.fn();
    const session = {
      transport: { close: mockClose },
      server: { server: { request: mockRequest } },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
      missedPings: 1, // 既に1回失敗済み→次の失敗で max_missed_pings(2) に到達
      pingTimer: undefined as ReturnType<typeof setInterval> | undefined,
    };
    sessions.set("stale-session", session as unknown);

    manager.startPing("stale-session", session as never);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(session.missedPings).toBe(2);
    // セッションは保全される（transport.close()は呼ばれない、sessionsから削除されない）
    expect(mockClose).not.toHaveBeenCalled();
    expect(sessions.has("stale-session")).toBe(true);
    // Pingタイマーは停止される
    expect(session.pingTimer).toBeUndefined();
  });

  it("stopPing でタイマーが停止される", () => {
    const manager = new KeepAliveManager(defaultConfig);
    const session = {
      transport: { close: jest.fn() },
      server: { server: { request: jest.fn() } },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
      missedPings: 0,
      pingTimer: undefined as ReturnType<typeof setInterval> | undefined,
    };
    sessions.set("test-session", session as unknown);

    manager.startPing("test-session", session as never);
    expect(session.pingTimer).toBeDefined();

    manager.stopPing("test-session", session as never);
    expect(session.pingTimer).toBeUndefined();
  });

  it("stopAll で全タイマーが停止される", () => {
    const manager = new KeepAliveManager(defaultConfig);
    const makeSession = () => ({
      transport: { close: jest.fn() },
      server: { server: { request: jest.fn() } },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
      missedPings: 0,
      pingTimer: undefined as ReturnType<typeof setInterval> | undefined,
    });

    const session1 = makeSession();
    const session2 = makeSession();
    sessions.set("s1", session1 as unknown);
    sessions.set("s2", session2 as unknown);

    manager.startPing("s1", session1 as never);
    manager.startPing("s2", session2 as never);

    expect(session1.pingTimer).toBeDefined();
    expect(session2.pingTimer).toBeDefined();

    manager.stopAll();

    expect(session1.pingTimer).toBeUndefined();
    expect(session2.pingTimer).toBeUndefined();
  });

  it("startPing で既存のPingタイマーが停止され新たに開始される（SSE再接続シナリオ）", () => {
    const manager = new KeepAliveManager(defaultConfig);
    const mockRequest = jest.fn<() => Promise<object>>().mockResolvedValue({});
    const session = {
      transport: { close: jest.fn() },
      server: { server: { request: mockRequest } },
      projectPath: "/test",
      createdAt: new Date(),
      lastActivity: new Date(),
      missedPings: 2,  // Ping失敗でカウントアップ済み
      pingTimer: undefined as ReturnType<typeof setInterval> | undefined,
    };
    sessions.set("reconnect-session", session as unknown);

    // 初回Ping開始 → 停止（Ping失敗シナリオを模擬）
    manager.startPing("reconnect-session", session as never);
    expect(session.pingTimer).toBeDefined();
    manager.stopPing("reconnect-session", session as never);
    expect(session.pingTimer).toBeUndefined();

    // SSE再接続: missedPingsリセット → Ping再開
    session.missedPings = 0;
    manager.startPing("reconnect-session", session as never);
    expect(session.pingTimer).toBeDefined();
    expect(session.missedPings).toBe(0);
  });
});
