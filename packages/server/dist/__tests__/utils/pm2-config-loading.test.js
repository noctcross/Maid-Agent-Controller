/**
 * PM2設定の読み込みテスト
 * config-loader.ts に pm2 セクションが正しく追加されていることを確認
 */
import { describe, it, expect, beforeEach } from "@jest/globals";
import { clearConfigCache } from "../../utils/config-loader.js";
describe("PM2 Config Loading", () => {
    beforeEach(() => {
        clearConfigCache();
    });
    it("デフォルト設定にpm2セクションが含まれること", async () => {
        // 存在しないパスを環境変数に設定してデフォルト値を使わせる
        const originalEnv = process.env.MAID_MCP_CONFIG;
        process.env.MAID_MCP_CONFIG = "/nonexistent/path/mcp-server.yaml";
        try {
            clearConfigCache();
            const { loadConfig } = await import("../../utils/config-loader.js");
            const config = await loadConfig();
            expect(config.pm2).toBeDefined();
            expect(config.pm2.max_memory_restart).toBe("500M");
            expect(config.pm2.instances).toBe(1);
            expect(config.pm2.autorestart).toBe(true);
            expect(config.pm2.watch).toBe(false);
        }
        finally {
            if (originalEnv !== undefined) {
                process.env.MAID_MCP_CONFIG = originalEnv;
            }
            else {
                delete process.env.MAID_MCP_CONFIG;
            }
            clearConfigCache();
        }
    });
    it("pm2設定がMcpServerConfigインターフェースに準拠していること", async () => {
        const originalEnv = process.env.MAID_MCP_CONFIG;
        process.env.MAID_MCP_CONFIG = "/nonexistent/path/mcp-server.yaml";
        try {
            clearConfigCache();
            const { loadConfig } = await import("../../utils/config-loader.js");
            const config = await loadConfig();
            // pm2セクションのプロパティ存在確認
            expect(typeof config.pm2.max_memory_restart).toBe("string");
            expect(typeof config.pm2.instances).toBe("number");
            expect(typeof config.pm2.autorestart).toBe("boolean");
            expect(typeof config.pm2.watch).toBe("boolean");
        }
        finally {
            if (originalEnv !== undefined) {
                process.env.MAID_MCP_CONFIG = originalEnv;
            }
            else {
                delete process.env.MAID_MCP_CONFIG;
            }
            clearConfigCache();
        }
    });
});
