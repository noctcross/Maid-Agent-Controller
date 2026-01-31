"use strict";
/**
 * YAML ファイル操作ヘルパー
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
exports.readYamlFile = readYamlFile;
exports.writeYamlFile = writeYamlFile;
exports.fileExists = fileExists;
exports.getFirstLine = getFirstLine;
exports.getTimestamp = getTimestamp;
const fs = __importStar(require("fs/promises"));
const yaml = __importStar(require("yaml"));
/**
 * YAMLファイルを読み込んでパース
 */
async function readYamlFile(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    return yaml.parse(content);
}
/**
 * オブジェクトをYAMLファイルに書き込み
 */
async function writeYamlFile(filePath, data) {
    const content = yaml.stringify(data, {
        lineWidth: 0, // 改行しない
        defaultStringType: "QUOTE_DOUBLE",
        defaultKeyType: "PLAIN",
    });
    await fs.writeFile(filePath, content, "utf-8");
}
/**
 * ファイルが存在するか確認
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * descriptionの1行目を取得（トークン削減用）
 */
function getFirstLine(text) {
    if (!text)
        return null;
    const firstLine = text.split("\n")[0].trim();
    return firstLine || null;
}
/**
 * ISO 8601形式のタイムスタンプを取得
 */
function getTimestamp() {
    return new Date().toISOString();
}
//# sourceMappingURL=yaml-helper.js.map