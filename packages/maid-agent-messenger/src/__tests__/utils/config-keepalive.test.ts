import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import type { McpServerConfig } from "../../utils/config-loader.js";

describe("loadConfig - keepalive settings", () => {
  let loadConfig: () => Promise<McpServerConfig>;
  let clearConfigCache: () => void;
  const originalEnv = process.env.MAID_MCP_CONFIG;

  beforeEach(async () => {
    const mod = await import("../../utils/config-loader.js");
    loadConfig = mod.loadConfig;
    clearConfigCache = mod.clearConfigCache;
    clearConfigCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MAID_MCP_CONFIG;
    } else {
      process.env.MAID_MCP_CONFIG = originalEnv;
    }
  });

  it("keepalive のデフォルト値が設定される", async () => {
    // 存在しないパスを指定してデフォルト値を使用
    process.env.MAID_MCP_CONFIG = "/nonexistent/config.yaml";
    clearConfigCache();
    const config = await loadConfig();

    expect(config.keepalive).toBeDefined();
    expect(config.keepalive.http_keepalive_timeout).toBe(65000);
    expect(config.keepalive.http_headers_timeout).toBe(66000);
  });

  it("keepalive の部分設定がデフォルト値とマージされる", async () => {
    // テスト用の一時YAMLファイルを使用
    const fs = await import("fs/promises");
    const os = await import("os");
    const path = await import("path");
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `test-config-${Date.now()}.yaml`);

    await fs.writeFile(tmpFile, `
server:
  port: 3100
keepalive:
  http_keepalive_timeout: 70000
`);

    process.env.MAID_MCP_CONFIG = tmpFile;
    clearConfigCache();
    const config = await loadConfig();

    expect(config.keepalive.http_keepalive_timeout).toBe(70000);
    expect(config.keepalive.http_headers_timeout).toBe(66000); // デフォルト値が残る

    await fs.unlink(tmpFile);
  });
});
