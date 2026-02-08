/**
 * ダッシュボードHTML生成
 * generateDashboardHtml() - メインダッシュボードのHTML生成
 */
import type { AgentStatus } from "../types/index.js";
export interface DashboardData {
    projectPath: string;
    timestamp: string;
    pending: Array<{
        id: string;
        title: string;
        description: string;
        priority: string;
        createdAt: string;
        category?: string;
    }>;
    working: Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        assignees: Array<{
            agentId: string;
        }>;
        priority: string;
    }>;
    blocked: Array<{
        id: string;
        title: string;
        description: string;
        substatus: string | null;
        assignees: Array<{
            agentId: string;
        }>;
        priority: string;
    }>;
    recentCompleted: Array<{
        id: string;
        title: string;
        description: string;
        completedAt: string | null;
        summary: string | null;
        assignees: Array<{
            agentId: string;
        }>;
        reportPaths: string[];
        reviewed?: boolean;
        starred?: boolean;
    }>;
    completedTotal: number;
    actionRequired: Array<{
        id: string;
        title: string;
        description: string;
        substatus: string | null;
    }>;
    skillCandidates: Array<{
        id: string;
        title: string;
        description: string;
    }>;
    improvements: Array<{
        id: string;
        title: string;
        description: string;
    }>;
    teamStatus: AgentStatus[];
    stats: {
        pendingCount: number;
        workingCount: number;
        blockedCount: number;
        completedTodayCount: number;
    };
    serverUrl: string;
}
export declare function generateDashboardHtml(data: DashboardData, editorScheme?: string): string;
