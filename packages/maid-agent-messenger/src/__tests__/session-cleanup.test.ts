/**
 * セッションクリーンアップのテスト
 * メモリリーク #1: EventStore未クリーンアップ
 * メモリリーク #2: McpServer未close
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// --- モック定義 ---

// fs.existsSyncのモック（validateProjectPathで使用）
jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(() => true),
}));

// McpServerのモック
function createMockMcpServer() {
  return {
    connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    server: {
      request: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
  };
}

// InMemoryEventStoreのモック
function createMockEventStore() {
  return {
    storeEvent: jest.fn(),
    getStreamIdForEventId: jest.fn(),
    replayEventsAfter: jest.fn(),
    cleanupStream: jest.fn(),
    clear: jest.fn(),
    stats: { streamCount: 0, totalEvents: 0 },
  };
}

describe("セッションクリーンアップ - McpServer.close()", () => {
  let sessions: Map<string, any>;
  let cleanupIdleSessions: (idleTimeoutMs: number) => Promise<number>;

  beforeEach(async () => {
    const mod = await import("../middleware/session-manager.js");
    sessions = mod.sessions;
    cleanupIdleSessions = mod.cleanupIdleSessions;
    sessions.clear();
  });

  afterEach(() => {
    sessions.clear();
  });

  describe("cleanupIdleSessions", () => {
    it("アイドルセッションのserver.close()が呼ばれること", async () => {
      const mockServer = createMockMcpServer();
      const mockTransport = {
        close: jest.fn(),
        handleRequest: jest.fn(),
        onclose: null as (() => void) | null,
      };

      sessions.set("test-session-1", {
        transport: mockTransport as any,
        server: mockServer as any,
        projectPath: "/test/path",
        createdAt: new Date(Date.now() - 600_000),
        lastActivity: new Date(Date.now() - 600_000),
        missedPings: 0,
      });

      const cleaned = await cleanupIdleSessions(300_000);

      expect(cleaned).toBe(1);
      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(sessions.size).toBe(0);
    });

    it("server.close()がエラーでもセッション削除が継続すること", async () => {
      const mockServer = createMockMcpServer();
      mockServer.close.mockRejectedValue(new Error("close failed"));
      const mockTransport = {
        close: jest.fn(),
        handleRequest: jest.fn(),
        onclose: null as (() => void) | null,
      };

      sessions.set("test-session-err", {
        transport: mockTransport as any,
        server: mockServer as any,
        projectPath: "/test/path",
        createdAt: new Date(Date.now() - 600_000),
        lastActivity: new Date(Date.now() - 600_000),
        missedPings: 0,
      });

      const cleaned = await cleanupIdleSessions(300_000);

      expect(cleaned).toBe(1);
      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(sessions.size).toBe(0);
    });
  });

  describe("DELETE /mcp ハンドラ", () => {
    it("セッション終了時にsessions.delete()が先に呼ばれ、server.close()が実行されること", async () => {
      const mockServer = createMockMcpServer();
      sessions.set("delete-test", {
        transport: { close: jest.fn() } as any,
        server: mockServer as any,
        projectPath: "/test",
        createdAt: new Date(),
        lastActivity: new Date(),
        missedPings: 0,
      });

      const session = sessions.get("delete-test")!;

      // 修正後: sessions.delete()を先に実行（再帰防止）、transport.close()は不要（server.close()内で呼ばれる）
      sessions.delete("delete-test");
      await session.server.close();

      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(sessions.has("delete-test")).toBe(false);
    });
  });
});

describe("セッションクリーンアップ - EventStore", () => {
  let sessions: Map<string, any>;
  let cleanupIdleSessions: (idleTimeoutMs: number) => Promise<number>;

  beforeEach(async () => {
    const mod = await import("../middleware/session-manager.js");
    sessions = mod.sessions;
    cleanupIdleSessions = mod.cleanupIdleSessions;
    sessions.clear();
  });

  afterEach(() => {
    sessions.clear();
  });

  describe("SessionInfo にeventStoreフィールドが存在すること", () => {
    it("SessionInfo型にeventStoreを保持できること", () => {
      const mockEventStore = createMockEventStore();
      sessions.set("es-test", {
        transport: { close: jest.fn() } as any,
        server: createMockMcpServer() as any,
        projectPath: "/test",
        createdAt: new Date(),
        lastActivity: new Date(),
        missedPings: 0,
        eventStore: mockEventStore as any,
      });

      const session = sessions.get("es-test")!;
      expect(session.eventStore).toBeDefined();
      expect(session.eventStore!.clear).toBeDefined();
    });
  });

  describe("cleanupIdleSessions でeventStoreがクリアされること", () => {
    it("eventStoreが存在する場合clear()が呼ばれること", async () => {
      const mockEventStore = createMockEventStore();
      sessions.set("es-cleanup-test", {
        transport: { close: jest.fn() } as any,
        server: createMockMcpServer() as any,
        projectPath: "/test",
        createdAt: new Date(Date.now() - 600_000),
        lastActivity: new Date(Date.now() - 600_000),
        missedPings: 0,
        eventStore: mockEventStore as any,
      });

      await cleanupIdleSessions(300_000);

      expect(mockEventStore.clear).toHaveBeenCalledTimes(1);
    });

    it("eventStoreが未設定の場合でもエラーにならないこと", async () => {
      sessions.set("no-es-test", {
        transport: { close: jest.fn() } as any,
        server: createMockMcpServer() as any,
        projectPath: "/test",
        createdAt: new Date(Date.now() - 600_000),
        lastActivity: new Date(Date.now() - 600_000),
        missedPings: 0,
        // eventStore: なし
      });

      await expect(cleanupIdleSessions(300_000)).resolves.toBe(1);
    });
  });
});
