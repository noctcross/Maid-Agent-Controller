import { jest, describe, it, expect, beforeEach } from "@jest/globals";

describe("config-loader defaults", () => {
  let loadConfig: typeof import("../../utils/config-loader.js").loadConfig;
  let clearConfigCache: typeof import("../../utils/config-loader.js").clearConfigCache;

  beforeEach(async () => {
    jest.resetModules();

    // 設定ファイルが見つからない場合にデフォルト値が使われることをテスト
    jest.unstable_mockModule("fs/promises", () => ({
      readFile: jest.fn<() => Promise<never>>().mockRejectedValue(new Error("ENOENT")),
    }));

    const mod = await import("../../utils/config-loader.js");
    loadConfig = mod.loadConfig;
    clearConfigCache = mod.clearConfigCache;
    clearConfigCache();
  });

  it("session_idle_timeout のデフォルト値が30分(1800000ms)である", async () => {
    const config = await loadConfig();
    expect(config.keepalive.session_idle_timeout).toBe(1800000);
  });

  it("max_missed_pings のデフォルト値が2である", async () => {
    const config = await loadConfig();
    expect(config.keepalive.max_missed_pings).toBe(2);
  });

  it("ping_enabled のデフォルト値がtrueである", async () => {
    const config = await loadConfig();
    expect(config.keepalive.ping_enabled).toBe(true);
  });
});
