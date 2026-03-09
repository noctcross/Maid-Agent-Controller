/**
 * プロジェクトレジストリ管理
 * ~/.maid-agent/system/data/projects.json の読み書き
 */
export interface ProjectEntry {
    path: string;
    name: string;
    lastAccessedAt: string;
    firstAccessedAt: string;
    accessCount: number;
    pinned: boolean;
    hidden: boolean;
    displayName?: string;
}
export interface ProjectRegistry {
    version: 1;
    projects: ProjectEntry[];
}
export declare function loadProjectRegistry(): Promise<ProjectRegistry>;
export declare function saveProjectRegistry(registry: ProjectRegistry): Promise<void>;
export declare function recordProjectAccess(projectPath: string): Promise<void>;
export declare function listProjects(): Promise<ProjectEntry[]>;
export declare function togglePin(projectPath: string): Promise<boolean>;
export declare function toggleHide(projectPath: string): Promise<boolean>;
//# sourceMappingURL=project-registry.d.ts.map