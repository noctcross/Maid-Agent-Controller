/**
 * ダッシュボードUI用HTML生成関数 - タスクツリー表示
 *
 * ダッシュボードUI実装
 * - Taskグルーピング表示
 * - Work/Step階層表示
 * - 成果物パネル
 * - 統計サマリーの種別対応
 * - レビューキュー表示
 */
export interface Step {
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
    hasReport?: boolean;
}
export interface Work {
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
    steps: Step[];
    updatedAt?: string;
    hasReport?: boolean;
}
export interface Task {
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
    works: Work[];
    displayStatus?: string;
    displayIcon?: string;
    archived?: boolean;
    updatedAt?: string;
    hasReport?: boolean;
}
export type Goal = Task;
export type Phase = Work;
export type Action = Step;
export interface ReviewTask {
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
export interface Artifact {
    path: string;
    type: string;
    retention: string;
    taskId: string;
    createdAt: string;
}
export interface Stats {
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
export declare function generateTaskTreeHtml(tasks: Task[], projectPath: string): string;
export declare const generateGoalTreeHtml: typeof generateTaskTreeHtml;
/**
 * レビューキューのHTMLを生成
 */
export declare function generateReviewQueueHtml(reviewTasks: ReviewTask[], projectPath: string): string;
/**
 * 成果物一覧のHTMLを生成
 */
export declare function generateArtifactsHtml(artifacts: Artifact[], projectPath: string): string;
/**
 * V2.1統計サマリーのHTMLを生成
 */
export declare function generateStatsHtml(stats: Stats): string;
