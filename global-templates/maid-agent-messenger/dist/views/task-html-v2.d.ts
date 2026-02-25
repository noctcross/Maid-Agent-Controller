/**
 * V2.1 ダッシュボードUI用HTML生成関数
 *
 * Phase 5: ダッシュボードUI実装
 * - Goalグルーピング表示
 * - Phase/Action階層表示
 * - 成果物パネル
 * - 統計サマリーの種別対応
 * - レビューキュー表示
 */
export interface V2Action {
    id: string;
    title: string;
    description?: string;
    type: "action";
    mainStatus: string;
    v2Substatus: string;
    assignees?: Array<{
        agentId: string;
    }>;
    updatedAt?: string;
}
export interface V2Phase {
    id: string;
    title: string;
    description?: string;
    type: "phase";
    mainStatus: string;
    v2Substatus: string;
    reviewStatus?: string;
    assignees?: Array<{
        agentId: string;
    }>;
    actions: V2Action[];
    updatedAt?: string;
}
export interface V2Goal {
    id: string;
    title: string;
    description?: string;
    type: "goal";
    mainStatus: string;
    v2Substatus: string;
    size?: string;
    reviewStatus?: string;
    assignees: Array<{
        agentId: string;
    }>;
    phases: V2Phase[];
    displayStatus?: string;
    displayIcon?: string;
    archived?: boolean;
    updatedAt?: string;
}
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
    goalCount: number;
    phaseCount: number;
    actionCount: number;
    completedCount: number;
    actionRequiredCount: number;
    reviewPendingCount: number;
    proposalCount: number;
}
/**
 * Goal一覧をツリー形式のHTMLで生成
 */
export declare function generateGoalTreeHtml(goals: V2Goal[], projectPath: string): string;
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
