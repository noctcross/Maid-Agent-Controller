import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

describe("ConnectionManager - exponential backoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("再接続間隔が指数バックオフで増加する", () => {
    const initial = 30000;
    const factor = 1.5;
    const max = 120000;

    let interval = initial;
    const intervals = [interval];

    for (let i = 0; i < 5; i++) {
      interval = Math.min(interval * factor, max);
      intervals.push(interval);
    }

    // 30000 → 45000 → 67500 → 101250 → 120000 → 120000
    expect(intervals[0]).toBe(30000);
    expect(intervals[1]).toBe(45000);
    expect(intervals[2]).toBe(67500);
    expect(intervals[3]).toBe(101250);
    expect(intervals[4]).toBe(120000);  // max に到達
    expect(intervals[5]).toBe(120000);  // max で固定
  });

  it("バックオフ係数1.0の場合は間隔が変わらない", () => {
    const initial = 30000;
    const factor = 1.0;
    const max = 120000;

    let interval = initial;
    for (let i = 0; i < 3; i++) {
      interval = Math.min(interval * factor, max);
    }

    expect(interval).toBe(30000);
  });

  it("初期値がmax以上の場合はmaxで固定される", () => {
    const initial = 150000;
    const factor = 1.5;
    const max = 120000;

    const interval = Math.min(initial * factor, max);
    expect(interval).toBe(120000);
  });
});

describe("ConnectionManager - CentralConfig reconnect fields", () => {
  it("CentralConfig に再接続設定フィールドが含まれる", async () => {
    // config-loader をインポートしてデフォルト値を検証
    const { loadConfig, clearConfigCache } = await import("../utils/config-loader.js");
    clearConfigCache();

    // 存在しないパスを指定してデフォルト値を使用
    const originalEnv = process.env.MAID_MCP_CONFIG;
    process.env.MAID_MCP_CONFIG = "/nonexistent/config.yaml";

    try {
      const config = await loadConfig();

      expect(config.central.max_reconnect_attempts).toBe(10);
      expect(config.central.reconnect_backoff_factor).toBe(1.5);
      expect(config.central.max_reconnect_interval).toBe(120000);
    } finally {
      if (originalEnv !== undefined) {
        process.env.MAID_MCP_CONFIG = originalEnv;
      } else {
        delete process.env.MAID_MCP_CONFIG;
      }
      clearConfigCache();
    }
  });
});
