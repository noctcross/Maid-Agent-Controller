"use strict";
/**
 * ファイルロック ユーティリティ
 *
 * 複数エージェントが同時にファイルを更新する際の競合を防止
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
exports.withFileLock = withFileLock;
exports.isLocked = isLocked;
const lockfile = __importStar(require("proper-lockfile"));
const DEFAULT_OPTIONS = {
    retries: 3,
    stale: 10000, // 10秒後にロックが古いとみなす
};
/**
 * ファイルをロックして操作を実行
 * 操作完了後に自動的にロック解除
 */
async function withFileLock(filePath, operation, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let release = null;
    try {
        // ロック取得
        release = await lockfile.lock(filePath, {
            retries: {
                retries: opts.retries,
                minTimeout: 100,
                maxTimeout: 1000,
            },
            stale: opts.stale,
        });
        // 操作実行
        return await operation();
    }
    finally {
        // ロック解除
        if (release) {
            try {
                await release();
            }
            catch {
                // ロック解除失敗は無視（staleで自動解除される）
            }
        }
    }
}
/**
 * ファイルがロックされているか確認
 */
async function isLocked(filePath) {
    try {
        return await lockfile.check(filePath);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=file-lock.js.map