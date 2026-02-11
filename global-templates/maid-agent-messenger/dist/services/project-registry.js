/**
 * プロジェクトレジストリ管理
 * ~/.maid-agent/system/data/projects.json の読み書き
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { getProjectRegistryPath } from "../utils/path-helpers.js";
const EMPTY_REGISTRY = { version: 1, projects: [] };
export async function loadProjectRegistry() {
    const filePath = getProjectRegistryPath();
    if (!existsSync(filePath)) {
        return EMPTY_REGISTRY;
    }
    try {
        const content = await readFile(filePath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return EMPTY_REGISTRY;
    }
}
export async function saveProjectRegistry(registry) {
    const filePath = getProjectRegistryPath();
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, JSON.stringify(registry, null, 2), "utf-8");
}
export async function recordProjectAccess(projectPath) {
    const registry = await loadProjectRegistry();
    const now = new Date().toISOString();
    const existing = registry.projects.find((p) => p.path === projectPath);
    if (existing) {
        existing.lastAccessedAt = now;
        existing.accessCount += 1;
    }
    else {
        const name = path.basename(projectPath);
        registry.projects.push({
            path: projectPath,
            name,
            lastAccessedAt: now,
            firstAccessedAt: now,
            accessCount: 1,
            pinned: false,
            hidden: false,
        });
    }
    await saveProjectRegistry(registry);
}
export async function listProjects() {
    const registry = await loadProjectRegistry();
    return registry.projects
        .filter((p) => !p.hidden)
        .sort((a, b) => {
        // ピン留め優先
        if (a.pinned !== b.pinned)
            return a.pinned ? -1 : 1;
        // lastAccessedAt 降順
        return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    });
}
export async function togglePin(projectPath) {
    const registry = await loadProjectRegistry();
    const entry = registry.projects.find((p) => p.path === projectPath);
    if (!entry)
        return false;
    entry.pinned = !entry.pinned;
    await saveProjectRegistry(registry);
    return true;
}
export async function toggleHide(projectPath) {
    const registry = await loadProjectRegistry();
    const entry = registry.projects.find((p) => p.path === projectPath);
    if (!entry)
        return false;
    entry.hidden = !entry.hidden;
    await saveProjectRegistry(registry);
    return true;
}
