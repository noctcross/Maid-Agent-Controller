import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// モジュールをモック
const mockReadFile = jest.fn<() => Promise<string>>();
jest.unstable_mockModule("fs/promises", () => ({
  readFile: mockReadFile,
  access: jest.fn(),
}));

describe("config-loader formatter settings", () => {
  let loadConfig: typeof import("../../utils/config-loader.js").loadConfig;
  let clearConfigCache: typeof import("../../utils/config-loader.js").clearConfigCache;

  beforeEach(async () => {
    jest.resetModules();
    const configModule = await import("../../utils/config-loader.js");
    loadConfig = configModule.loadConfig;
    clearConfigCache = configModule.clearConfigCache;
    clearConfigCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return default sanitize_description_max_length when not configured", async () => {
    mockReadFile.mockResolvedValue(`
server:
  port: 3100
`);
    const config = await loadConfig();
    expect(config.formatter.sanitize_description_max_length).toBe(15);
  });

  it("should use configured sanitize_description_max_length", async () => {
    mockReadFile.mockResolvedValue(`
server:
  port: 3100
formatter:
  sanitize_description_max_length: 25
`);
    const config = await loadConfig();
    expect(config.formatter.sanitize_description_max_length).toBe(25);
  });

  it("should merge formatter config with defaults", async () => {
    mockReadFile.mockResolvedValue(`
formatter:
  sanitize_description_max_length: 30
`);
    const config = await loadConfig();
    expect(config.formatter.sanitize_description_max_length).toBe(30);
    // 他のデフォルト値も保持されていること
    expect(config.server.port).toBe(3100);
  });
});
