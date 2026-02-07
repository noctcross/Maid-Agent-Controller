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
    expect(config.keepalive.session_idle_timeout).toBe(300000);
    expect(config.keepalive.gc_interval).toBe(60000);
  });

  it("keepalive の部分設定がデフォルト値とマージされる", async () => {
    // テスト用の一時YAMLファイルを使用
    const fs = await import("fs/promises");
    const os = await import("os");
    const path = await import("path");
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `test-mcp-config-${Date.now()}.yaml`);

    await fs.writeFile(tmpFile, `
server:
  port: 3100
keepalive:
  session_idle_timeout: 600000
`);

    process.env.MAID_MCP_CONFIG = tmpFile;
    clearConfigCache();
    const config = await loadConfig();

    expect(config.keepalive.session_idle_timeout).toBe(600000);
    expect(config.keepalive.gc_interval).toBe(60000); // デフォルト値が残る

    await fs.unlink(tmpFile);
  });
});
