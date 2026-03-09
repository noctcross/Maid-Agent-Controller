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
import { type Task, type ReviewTask, type Artifact, type Stats } from "./task-tree.js";
/**
 * V2チーム状態セクションのHTML生成
 * 各メイドの現在の状態をカード形式で表示
 */
export declare function generateTeamStatusHtml(teamStatus: AgentStatus[]): string;
/**
 * V2検索・絞り込みセクションのHTML生成
 * 検索ボックスと優先度・担当者フィルターを表示
 */
export declare function generateV2SearchFilterHtml(teamStatus: AgentStatus[]): string;
export interface HtmlDashboardData {
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
    v2Goals?: Task[];
    v2ReviewQueue?: ReviewTask[];
    v2Artifacts?: Artifact[];
    v2Stats?: Stats;
    dashboardVersion?: "v2";
}
/**
 * ダッシュボードHTMLを生成
 *
 * @param data - ダッシュボードに表示するデータ
 * @param editorScheme - エディタスキーム（デフォルト: "vscode"）
 * @returns 完全なHTML文字列
 */
export declare function generateDashboardHtml(data: HtmlDashboardData, editorScheme?: string): string;
//# sourceMappingURL=dashboard-html.d.ts.map