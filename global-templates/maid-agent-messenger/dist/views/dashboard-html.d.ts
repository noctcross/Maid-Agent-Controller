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
        updatedAt?: string;
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
        startedAt?: string | null;
        updatedAt?: string;
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
        updatedAt?: string;
    }>;
    completedTotal: number;
    masterWaiting: Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        substatus: string | null;
        assignees: Array<{
            agentId: string;
        }>;
        priority: string;
        escalation?: boolean;
        escalatedAt?: string | null;
    }>;
    masterReview: Array<{
        id: string;
        title: string;
        description: string;
        completedAt: string | null;
        summary: string | null;
        reviewed?: boolean;
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
        masterWaitingCount: number;
        completedTodayCount: number;
    };
    serverUrl: string;
}
export declare function generateDashboardHtml(data: DashboardData, editorScheme?: string): string;
