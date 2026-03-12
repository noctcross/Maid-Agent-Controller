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

  it("http_keepalive_timeout のデフォルト値が65000msである", async () => {
    const config = await loadConfig();
    expect(config.keepalive.http_keepalive_timeout).toBe(65000);
  });

  it("http_headers_timeout のデフォルト値が66000msである", async () => {
    const config = await loadConfig();
    expect(config.keepalive.http_headers_timeout).toBe(66000);
  });

  it("ping_interval のデフォルト値が設定されている", async () => {
    const config = await loadConfig();
    expect(config.keepalive.ping_interval).toBeGreaterThan(0);
  });
});
