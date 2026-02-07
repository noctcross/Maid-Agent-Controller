import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

describe("ConnectionManager - scheduleReconnect behavior", () => {
  let ConnectionManager: typeof import("../connection-manager.js").ConnectionManager;
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.Mock<typeof globalThis.fetch>;

  beforeEach(async () => {
    jest.useFakeTimers();

    // global.fetch をモック化
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;

    // モジュールを再インポート
    const mod = await import("../connection-manager.js");
    ConnectionManager = mod.ConnectionManager;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  /**
   * ヘルパー: fetchモックのレスポンスを設定
   */
  function mockHealthResponse(healthy: boolean): void {
    if (healthy) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);
    } else {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
    }
  }

  it("hybrid モードで中央サーバー不通時にlocalモードへフォールバックする", async () => {
    const manager = new ConnectionManager();

    // ヘルスチェック失敗
    mockHealthResponse(false);

    const status = await manager.connect();

    expect(status.mode).toBe("local");
  });

  it("再接続成功時にcentralモードに復帰する", async () => {
    const manager = new ConnectionManager();

    // 初回: ヘルスチェック失敗 → local mode
    mockHealthResponse(false);
    await manager.connect();
    expect(manager.getMode()).toBe("local");

    // 再接続: ヘルスチェック成功
    mockHealthResponse(true);

    // scheduleReconnect のタイマーを進める
    await jest.advanceTimersByTimeAsync(30000);

    expect(manager.getMode()).toBe("central");
  });

  it("再接続失敗時にバックオフ間隔が増加する", async () => {
    const manager = new ConnectionManager();

    // 初回: ヘルスチェック失敗 → local mode
    mockHealthResponse(false);
    await manager.connect();
    expect(manager.getMode()).toBe("local");

    // 1回目の再接続失敗（30秒後）
    mockHealthResponse(false);
    await jest.advanceTimersByTimeAsync(30000);
    expect(manager.getMode()).toBe("local");

    // 2回目の再接続失敗（45秒後 = 30000 * 1.5）
    mockHealthResponse(false);
    await jest.advanceTimersByTimeAsync(45000);
    expect(manager.getMode()).toBe("local");

    // 3回目の再接続成功（67500ms後 = 45000 * 1.5）
    mockHealthResponse(true);
    await jest.advanceTimersByTimeAsync(67500);
    expect(manager.getMode()).toBe("central");
  });

  it("max_reconnect_attempts 超過で再接続が停止する", async () => {
    const manager = new ConnectionManager();
    const consoleSpy = jest.spyOn(console, "log");

    // 初回: ヘルスチェック失敗 → local mode
    mockHealthResponse(false);
    await manager.connect();
    expect(manager.getMode()).toBe("local");

    // max_reconnect_attempts(10) 回分 + 停止判定の1回分を進める
    // 10回の試行後、11回目のattemptReconnectで停止メッセージが出力される
    const intervals = [30000]; // 初回
    let interval = 30000;
    for (let i = 1; i <= 10; i++) {
      interval = Math.min(interval * 1.5, 120000);
      intervals.push(interval);
    }

    for (const ms of intervals) {
      mockHealthResponse(false);
      await jest.advanceTimersByTimeAsync(ms);
    }

    // 停止メッセージが出力されたことを確認
    const stopMessage = consoleSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("Reconnect failed after")
    );
    expect(stopMessage).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("disconnect() でカウンタがリセットされる", async () => {
    const manager = new ConnectionManager();

    // 初回: ヘルスチェック失敗 → local mode
    mockHealthResponse(false);
    await manager.connect();

    // 1回再接続失敗
    mockHealthResponse(false);
    await jest.advanceTimersByTimeAsync(30000);

    // disconnect
    manager.disconnect();
    expect(manager.getMode()).toBe("disconnected");

    // 再接続: 初回の間隔に戻っていることを確認
    // （再度connectして確認）
    mockHealthResponse(false);
    const status = await manager.connect();
    expect(status.mode).toBe("local");

    // 30秒後（初期値）に再接続成功 → バックオフがリセットされている
    mockHealthResponse(true);
    await jest.advanceTimersByTimeAsync(30000);
    expect(manager.getMode()).toBe("central");
  });

  it("clearTimeout が正しく使用される（clearInterval ではなく）", async () => {
    const manager = new ConnectionManager();
    const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");

    // 初回: ヘルスチェック失敗 → local mode
    mockHealthResponse(false);
    await manager.connect();

    // 再接続成功
    mockHealthResponse(true);
    await jest.advanceTimersByTimeAsync(30000);

    // clearTimeout が呼ばれたことを確認
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });
});
