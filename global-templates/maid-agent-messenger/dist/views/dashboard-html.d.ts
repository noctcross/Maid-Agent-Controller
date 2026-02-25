/**
 * ダッシュボードHTML生成
 * generateDashboardHtml() - メインダッシュボードのHTML生成
 *
 * CSS/JS/HTMLテンプレートを各モジュールに委譲する形式に変更。
 * - dashboard-styles.ts: CSSスタイル定義
 * - dashboard-scripts.ts: JavaScriptコード
 * - dashboard-template.ts: HTMLボディテンプレート
 */
import type { AgentStatus } from "../types/index.js";
import { type V2Goal, type V2ReviewTask, type V2Artifact, type V2Stats } from "./task-html-v2.js";
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
        actionRequired?: boolean;
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
        actionRequired?: boolean;
        actionRequiredAt?: string | null;
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
    v2Goals?: V2Goal[];
    v2ReviewQueue?: V2ReviewTask[];
    v2Artifacts?: V2Artifact[];
    v2Stats?: V2Stats;
    dashboardVersion?: "v1" | "v2";
}
/**
 * ダッシュボードHTMLを生成
 *
 * @param data - ダッシュボードに表示するデータ
 * @param editorScheme - エディタスキーム（デフォルト: "vscode"）
 * @returns 完全なHTML文字列
 */
export declare function generateDashboardHtml(data: DashboardData, editorScheme?: string): string;
