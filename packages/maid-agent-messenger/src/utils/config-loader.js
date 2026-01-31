"use strict";
/**
 * MCP Server 設定ローダー
 *
 * .maid-agent/config/mcp-server.yaml から設定を読み込む
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
exports.clearConfigCache = clearConfigCache;
exports.getServerUrl = getServerUrl;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const yaml = __importStar(require("yaml"));
const DEFAULT_CONFIG = {
    server: {
        mode: "hybrid",
        port: 3100,
        host: "127.0.0.1",
    },
    central: {
        connection_timeout: 3000,
        reconnect_interval: 30000,
    },
    fallback: {
        enabled: true,
        auto_recover: true,
    },
};
let cachedConfig = null;
/**
 * 設定ファイルのパスを取得
 */
function getConfigPath() {
    // 環境変数で指定されている場合はそちらを使用
    if (process.env.MAID_MCP_CONFIG) {
        return process.env.MAID_MCP_CONFIG;
    }
    // デフォルトパス
    return ".maid-agent/config/mcp-server.yaml";
}
/**
 * 設定ファイルを読み込む
 */
async function loadConfig() {
    // キャッシュがあれば返す
    if (cachedConfig) {
        return cachedConfig;
    }
    const configPath = getConfigPath();
    try {
        const absolutePath = path.resolve(process.cwd(), configPath);
        const content = await fs.readFile(absolutePath, "utf-8");
        const parsed = yaml.parse(content);
        // デフォルト値とマージ
        cachedConfig = {
            server: { ...DEFAULT_CONFIG.server, ...parsed.server },
            central: { ...DEFAULT_CONFIG.central, ...parsed.central },
            fallback: { ...DEFAULT_CONFIG.fallback, ...parsed.fallback },
        };
        return cachedConfig;
    }
    catch (error) {
        // 設定ファイルがない場合はデフォルト値を使用
        console.error(`Config file not found at ${configPath}, using defaults`);
        cachedConfig = DEFAULT_CONFIG;
        return cachedConfig;
    }
}
/**
 * キャッシュをクリア（テスト用）
 */
function clearConfigCache() {
    cachedConfig = null;
}
/**
 * サーバーURLを取得
 */
function getServerUrl(config) {
    return `http://${config.server.host}:${config.server.port}`;
}
//# sourceMappingURL=config-loader.js.map