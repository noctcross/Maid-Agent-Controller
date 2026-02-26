/**
 * V2.1 ダッシュボードUI用HTML生成関数
 *
 * Phase 5: ダッシュボードUI実装
 * - Taskグルーピング表示
 * - Work/Step階層表示
 * - 成果物パネル
 * - 統計サマリーの種別対応
 * - レビューキュー表示
 */
export interface V2Step {
    id: string;
    title: string;
    description?: string;
    type: "step";
    mainStatus: string;
    v2Substatus: string;
    assignees?: Array<{
        agentId: string;
    }>;
    updatedAt?: string;
}
export interface V2Work {
    id: string;
    title: string;
    description?: string;
    type: "work";
    mainStatus: string;
    v2Substatus: string;
    reviewStatus?: string;
    assignees?: Array<{
        agentId: string;
    }>;
    steps: V2Step[];
    updatedAt?: string;
}
export interface V2Task {
    id: string;
    title: string;
    description?: string;
    type: "task";
    mainStatus: string;
    v2Substatus: string;
    size?: string;
    reviewStatus?: string;
    assignees: Array<{
        agentId: string;
    }>;
    works: V2Work[];
    displayStatus?: string;
    displayIcon?: string;
    archived?: boolean;
    updatedAt?: string;
}
export type V2Goal = V2Task;
export type V2Phase = V2Work;
export type V2Action = V2Step;
export interface V2ReviewTask {
    id: string;
    title: string;
    type: string;
    reviewStatus: string;
    priority: string;
    completedAt: string;
    assignees: Array<{
        agentId: string;
    }>;
}
export interface V2Artifact {
    path: string;
    type: string;
    retention: string;
    taskId: string;
    createdAt: string;
}
export interface V2Stats {
    taskCount: number;
    workCount: number;
    stepCount: number;
    completedCount: number;
    actionRequiredCount: number;
    reviewPendingCount: number;
    proposalCount: number;
}
/**
 * Task一覧をツリー形式のHTMLで生成
 */
export declare function generateTaskTreeHtml(tasks: V2Task[], projectPath: string): string;
export declare const generateGoalTreeHtml: typeof generateTaskTreeHtml;
/**
 * レビューキューのHTMLを生成
 */
export declare function generateReviewQueueHtml(reviewTasks: V2ReviewTask[], projectPath: string): string;
/**
 * 成果物一覧のHTMLを生成
 */
export declare function generateArtifactsHtml(artifacts: V2Artifact[], projectPath: string): string;
/**
 * V2.1統計サマリーのHTMLを生成
 */
export declare function generateV2StatsHtml(stats: V2Stats): string;
