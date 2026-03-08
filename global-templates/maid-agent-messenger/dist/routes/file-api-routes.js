/**
 * ファイル API エンドポイント
 * GET /api/files - ディレクトリ一覧取得（JSON）
 * GET /api/files/content - ファイル内容取得（JSON）
 */
import { Router } from "express";
import path from "path";
import * as fs from "fs/promises";
import { convertMarkdownToHtml, linkifyProjectPaths } from "../markdown-utils.js";
import { extractAgentIdFromPath } from "../utils/agent-image.js";
import { logger } from "../utils/logger.js";
const router = Router();
/** 許可する拡張子（セキュリティ対策） */
const ALLOWED_EXTENSIONS = new Set([
    ".md", ".txt", ".json", ".yaml", ".yml",
    ".ts", ".tsx", ".js", ".jsx",
    ".css", ".html", ".xml",
    ".sh", ".bash", ".zsh",
    ".py", ".rb", ".go", ".rs",
    ".env.example", ".gitignore", ".editorconfig",
]);
/** 画像拡張子 */
const IMAGE_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
]);
/** 画像のMIMEタイプ */
const IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".bmp": "image/bmp",
};
/** 隠しファイル・ディレクトリのパターン */
const HIDDEN_PATTERNS = [
    /^\.git$/,
    /^node_modules$/,
    /^\.DS_Store$/,
    /^\.env$/,
    /^\.env\.local$/,
    /^\.env\.production$/,
    /\.pem$/,
    /\.key$/,
    /^credentials/,
];
/**
 * ファイル/ディレクトリが表示可能か判定
 */
function isVisibleItem(name) {
    return !HIDDEN_PATTERNS.some((pattern) => pattern.test(name));
}
/**
 * ファイルが閲覧可能か判定
 */
function isViewableFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    // 拡張子なしのファイル（README, LICENSE等）も許可
    if (!ext) {
        return ["README", "LICENSE", "CHANGELOG", "CLAUDE"].some((name) => filename.toUpperCase().includes(name));
    }
    return ALLOWED_EXTENSIONS.has(ext);
}
/**
 * パストラバーサル対策
 */
async function validatePath(filePath, projectPath) {
    const normalizedProjectPath = path.resolve(projectPath);
    let resolvedPath;
    try {
        resolvedPath = await fs.realpath(filePath);
    }
    catch {
        resolvedPath = path.resolve(filePath);
    }
    if (!resolvedPath.startsWith(normalizedProjectPath + path.sep) &&
        resolvedPath !== normalizedProjectPath) {
        return {
            valid: false,
            resolvedPath,
            error: "Access denied: path is outside project directory",
        };
    }
    return { valid: true, resolvedPath };
}
/**
 * GET /api/files
 * ディレクトリ一覧を取得
 */
router.get("/api/files", async (req, res) => {
    try {
        const projectPath = req.query.project;
        let dirPath = req.query.path || "";
        if (!projectPath) {
            res.status(400).json({ error: "Missing project parameter" });
            return;
        }
        // パスが空または"/"の場合はプロジェクトルート
        if (!dirPath || dirPath === "/") {
            dirPath = projectPath;
        }
        else if (!path.isAbsolute(dirPath)) {
            dirPath = path.join(projectPath, dirPath);
        }
        // パス検証
        const validation = await validatePath(dirPath, projectPath);
        if (!validation.valid) {
            logger.warn(`Path traversal blocked: ${dirPath}`);
            res.status(403).json({ error: validation.error });
            return;
        }
        // ディレクトリ読み込み
        const entries = await fs.readdir(validation.resolvedPath, {
            withFileTypes: true,
        });
        // ファイル情報を取得
        const items = [];
        for (const entry of entries) {
            if (!isVisibleItem(entry.name))
                continue;
            const itemPath = path.join(validation.resolvedPath, entry.name);
            const relativePath = path.relative(projectPath, itemPath);
            try {
                const stats = await fs.stat(itemPath);
                items.push({
                    name: entry.name,
                    path: relativePath,
                    type: entry.isDirectory() ? "directory" : "file",
                    size: entry.isFile() ? stats.size : undefined,
                    modifiedAt: stats.mtime.toISOString(),
                    extension: entry.isFile()
                        ? path.extname(entry.name).toLowerCase()
                        : undefined,
                });
            }
            catch {
                // statに失敗した場合はスキップ
            }
        }
        // ソート: ディレクトリ優先、名前順
        items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "directory" ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        // 現在のパスの相対パスを計算
        const currentRelativePath = path.relative(projectPath, validation.resolvedPath);
        res.json({
            path: currentRelativePath || "/",
            items,
            parentPath: currentRelativePath && currentRelativePath !== "."
                ? path.dirname(currentRelativePath)
                : null,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to list directory", error instanceof Error ? error : { error });
        res.status(500).json({ error: message });
    }
});
/**
 * GET /api/files/content
 * ファイル内容を取得
 */
router.get("/api/files/content", async (req, res) => {
    try {
        const projectPath = req.query.project;
        let filePath = req.query.path;
        if (!projectPath) {
            res.status(400).json({ error: "Missing project parameter" });
            return;
        }
        if (!filePath) {
            res.status(400).json({ error: "Missing path parameter" });
            return;
        }
        // 絶対パスに変換
        if (!path.isAbsolute(filePath)) {
            filePath = path.join(projectPath, filePath);
        }
        // パス検証
        const validation = await validatePath(filePath, projectPath);
        if (!validation.valid) {
            logger.warn(`Path traversal blocked: ${filePath}`);
            res.status(403).json({ error: validation.error });
            return;
        }
        // ファイルかどうか確認
        const stats = await fs.stat(validation.resolvedPath);
        if (!stats.isFile()) {
            res.status(400).json({ error: "Path is not a file" });
            return;
        }
        const fileName = path.basename(validation.resolvedPath);
        // 閲覧可能なファイルか確認
        if (!isViewableFile(fileName)) {
            res.status(403).json({
                error: "File type not allowed for viewing",
                allowedExtensions: Array.from(ALLOWED_EXTENSIONS),
            });
            return;
        }
        // ファイルサイズ制限（1MB）
        const MAX_FILE_SIZE = 1024 * 1024;
        if (stats.size > MAX_FILE_SIZE) {
            res.status(413).json({
                error: "File too large",
                maxSize: MAX_FILE_SIZE,
                actualSize: stats.size,
            });
            return;
        }
        // ファイル読み込み
        const content = await fs.readFile(validation.resolvedPath, "utf-8");
        const isMarkdown = /\.(md|markdown)$/i.test(fileName);
        // Markdown → HTML変換（パスリンク化適用）
        let htmlContent;
        if (isMarkdown) {
            const rawHtml = convertMarkdownToHtml(content);
            htmlContent = linkifyProjectPaths(rawHtml, projectPath);
        }
        // エージェントID抽出（背景イラスト用）
        const agentId = extractAgentIdFromPath(validation.resolvedPath);
        res.json({
            path: path.relative(projectPath, validation.resolvedPath),
            absolutePath: validation.resolvedPath,
            name: fileName,
            content,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            isMarkdown,
            htmlContent,
            agentId,
        });
    }
    catch (error) {
        if (error.code === "ENOENT") {
            res.status(404).json({ error: "File not found" });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to read file", error instanceof Error ? error : { error });
        res.status(500).json({ error: message });
    }
});
/**
 * GET /api/files/raw
 * ファイルを直接配信（画像等のバイナリファイル用）
 */
router.get("/api/files/raw", async (req, res) => {
    try {
        const projectPath = req.query.project;
        let filePath = req.query.path;
        if (!projectPath) {
            res.status(400).json({ error: "Missing project parameter" });
            return;
        }
        if (!filePath) {
            res.status(400).json({ error: "Missing path parameter" });
            return;
        }
        // 絶対パスに変換
        if (!path.isAbsolute(filePath)) {
            filePath = path.join(projectPath, filePath);
        }
        // パス検証
        const validation = await validatePath(filePath, projectPath);
        if (!validation.valid) {
            logger.warn(`Path traversal blocked: ${filePath}`);
            res.status(403).json({ error: validation.error });
            return;
        }
        // ファイルかどうか確認
        const stats = await fs.stat(validation.resolvedPath);
        if (!stats.isFile()) {
            res.status(400).json({ error: "Path is not a file" });
            return;
        }
        const fileName = path.basename(validation.resolvedPath);
        const ext = path.extname(fileName).toLowerCase();
        // 画像ファイルか確認
        if (!IMAGE_EXTENSIONS.has(ext)) {
            res.status(403).json({
                error: "File type not allowed for raw access",
                allowedExtensions: Array.from(IMAGE_EXTENSIONS),
            });
            return;
        }
        // ファイルサイズ制限（10MB）
        const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
        if (stats.size > MAX_IMAGE_SIZE) {
            res.status(413).json({
                error: "File too large",
                maxSize: MAX_IMAGE_SIZE,
                actualSize: stats.size,
            });
            return;
        }
        // Content-Type を設定して配信
        const mimeType = IMAGE_MIME_TYPES[ext] || "application/octet-stream";
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.sendFile(validation.resolvedPath);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            res.status(404).json({ error: "File not found" });
            return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to serve raw file", error instanceof Error ? error : { error });
        res.status(500).json({ error: message });
    }
});
export default router;
