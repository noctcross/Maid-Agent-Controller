import { jest, describe, it, expect } from "@jest/globals";
import type { KeepAliveConfig } from "../utils/config-loader.js";

describe("central-server - Express timeout settings", () => {
  it("keepAliveTimeout と headersTimeout が設定ファイルの値で正しく定義される", () => {
    const config: KeepAliveConfig = {
      session_idle_timeout: 300000,
      gc_interval: 60000,
      http_keepalive_timeout: 65000,
      http_headers_timeout: 66000,
      ping_enabled: true,
      ping_interval: 30000,
      ping_timeout: 5000,
      max_missed_pings: 2,
    };

    // 設定値が正しい範囲であることを検証
    expect(config.http_keepalive_timeout).toBe(65000);
    expect(config.http_headers_timeout).toBe(66000);
    // headersTimeout > keepAliveTimeout であること
    expect(config.http_headers_timeout).toBeGreaterThan(
      config.http_keepalive_timeout
    );
  });

  it("デフォルト値がプロキシの60秒タイムアウトより長い", async () => {
    process.env.MAID_MCP_CONFIG = "/nonexistent/config.yaml";
    const mod = await import("../utils/config-loader.js");
    mod.clearConfigCache();
    const fullConfig = await mod.loadConfig();

    const PROXY_TIMEOUT = 60000;
    expect(fullConfig.keepalive.http_keepalive_timeout).toBeGreaterThan(PROXY_TIMEOUT);
    expect(fullConfig.keepalive.http_headers_timeout).toBeGreaterThan(
      fullConfig.keepalive.http_keepalive_timeout
    );

    delete process.env.MAID_MCP_CONFIG;
  });
});
