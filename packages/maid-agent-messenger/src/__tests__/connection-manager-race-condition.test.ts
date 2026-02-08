/**
 * 再接続タイマーのレースコンディションテスト
 * メモリリーク #3: 再接続タイマーが二重化する問題
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// config-loaderのモック
jest.unstable_mockModule("../utils/config-loader.js", () => ({
  loadConfig: jest.fn<() => Promise<any>>().mockResolvedValue({
    server: { mode: "hybrid", port: 3100, host: "0.0.0.0" },
    central: {
      connection_timeout: 5000,
      reconnect_interval: 1000,         // テスト用に短く
      max_reconnect_attempts: 5,
      reconnect_backoff_factor: 1.0,    // テスト用にバックオフなし
      max_reconnect_interval: 10000,
    },
    fallback: { enabled: true, auto_recover: true },
    keepalive: {},
  }),
  getServerUrl: jest.fn(() => "http://localhost:3100"),
  clearConfigCache: jest.fn(),
}));

// fetchのモック（global fetch）
const mockFetch = jest.fn<typeof fetch>();

describe("ConnectionManager - レースコンディション", () => {
  let ConnectionManager: any;

  beforeEach(async () => {
    jest.useFakeTimers();
    global.fetch = mockFetch as any;
    // 毎回新しいモジュールをインポート
    const mod = await import("../connection-manager.js");
    ConnectionManager = mod.ConnectionManager;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("disconnect()後に再接続タイマーが発火しないこと", async () => {
    const manager = new ConnectionManager();

    // 中央サーバー: 最初は不健全（ローカルにフォールバック）
    mockFetch.mockRejectedValue(new Error("connection refused"));

    await manager.connect();
    expect(manager.getMode()).toBe("local");

    // disconnect() でタイマーをキャンセル
    manager.disconnect();
    expect(manager.getMode()).toBe("disconnected");

    // タイマーを進める - 再接続が発火してはならない
    // fetch が呼ばれていないことで確認
    const fetchCallsBefore = mockFetch.mock.calls.length;
    jest.advanceTimersByTime(10000);

    // disconnected状態では追加のfetchコールが発生しないこと
    // （connect時のhealth checkのみ）
    expect(manager.getMode()).toBe("disconnected");
  });

  it("disconnect()がawait中のreconnectを中止できること", async () => {
    const manager = new ConnectionManager();

    // 中央サーバー不健全→ローカルフォールバック
    mockFetch.mockRejectedValue(new Error("connection refused"));

    await manager.connect();
    expect(manager.getMode()).toBe("local");

    // 再接続タイマーを1つ発火させる
    // ヘルスチェックは遅延を返す（非同期処理中にdisconnect）
    let healthResolve: () => void;
    mockFetch.mockImplementation(() =>
      new Promise<Response>((resolve) => {
        healthResolve = () => resolve(new Response(null, { status: 503 }));
      })
    );

    jest.advanceTimersByTime(1000); // 再接続タイマー発火

    // ヘルスチェック実行中にdisconnect
    manager.disconnect();
    expect(manager.getMode()).toBe("disconnected");

    // ヘルスチェックを完了させる（失敗）
    healthResolve!();

    // タイマーを大幅に進めても再接続は起きない
    jest.advanceTimersByTime(60000);
    expect(manager.getMode()).toBe("disconnected");
  });
});
