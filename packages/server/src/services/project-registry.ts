/**
 * プロジェクトレジストリ管理
 * ~/.maid-agent/system/data/projects.json の読み書き
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { getProjectRegistryPath, getGlobalDataPath } from "../utils/path-helpers.js";

export interface ProjectEntry {
  path: string;              // フルパス（プライマリキー）
  name: string;              // プロジェクト名
  lastAccessedAt: string;    // ISO 8601
  firstAccessedAt: string;   // ISO 8601
  accessCount: number;
  pinned: boolean;
  hidden: boolean;
  displayName?: string;
}

export interface ProjectRegistry {
  version: 1;
  projects: ProjectEntry[];
}

const EMPTY_REGISTRY: ProjectRegistry = { version: 1, projects: [] };

export async function loadProjectRegistry(): Promise<ProjectRegistry> {
  const filePath = getProjectRegistryPath();
  if (!existsSync(filePath)) {
    return EMPTY_REGISTRY;
  }
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as ProjectRegistry;
  } catch {
    return EMPTY_REGISTRY;
  }
}

export async function saveProjectRegistry(registry: ProjectRegistry): Promise<void> {
  const filePath = getProjectRegistryPath();
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(registry, null, 2), "utf-8");
}

export async function recordProjectAccess(projectPath: string): Promise<void> {
  const registry = await loadProjectRegistry();
  const now = new Date().toISOString();
  const existing = registry.projects.find((p) => p.path === projectPath);

  if (existing) {
    existing.lastAccessedAt = now;
    existing.accessCount += 1;
  } else {
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

export async function listProjects(): Promise<ProjectEntry[]> {
  const registry = await loadProjectRegistry();
  return registry.projects
    .filter((p) => !p.hidden)
    .sort((a, b) => {
      // ピン留め優先
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      // lastAccessedAt 降順
      return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    });
}

export async function togglePin(projectPath: string): Promise<boolean> {
  const registry = await loadProjectRegistry();
  const entry = registry.projects.find((p) => p.path === projectPath);
  if (!entry) return false;
  entry.pinned = !entry.pinned;
  await saveProjectRegistry(registry);
  return true;
}

export async function toggleHide(projectPath: string): Promise<boolean> {
  const registry = await loadProjectRegistry();
  const entry = registry.projects.find((p) => p.path === projectPath);
  if (!entry) return false;
  entry.hidden = !entry.hidden;
  await saveProjectRegistry(registry);
  return true;
}
