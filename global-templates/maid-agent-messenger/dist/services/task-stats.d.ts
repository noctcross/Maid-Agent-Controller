/**
 * タスク統計・ダッシュボードデータ生成
 *
 * V2.1 ダッシュボードデータの生成処理を提供。
 * task-manager.ts から責務分割のため分離。
 */
/**
 * V2.1: Goal階層連動 - 子Phaseの状態から親Goalの表示ステータスを計算
 *
 * 設計書より:
 * - 全Phase pending → Goal「未着手」⏸️
 * - いずれかPhase assigned → Goal「準備中」📋
 * - いずれかPhase working → Goal「進行中」🔵
 * - いずれかPhase waiting/checkpoint → Goal「ブロック中」⚠️
 * - 全Phase completed → Goal「完了可能」✅
 */
export declare function computeGoalDisplayStatus(goalSubstatus: string, phases: Array<{
    v2Substatus: string;
    mainStatus?: string;
}>, goalMainStatus?: string): {
    displayStatus: string;
    displayIcon: string;
};
/**
 * V2.1 ダッシュボードデータ
 */
export interface V2DashboardData {
    v2Goals: V2GoalData[];
    v2ReviewQueue: V2ReviewTaskData[];
    v2Artifacts: V2ArtifactData[];
    v2Stats: V2StatsData;
    totalGoals: number;
}
export interface V2StepData {
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
export interface V2WorkData {
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
    steps: V2StepData[];
    updatedAt?: string;
}
export interface V2TaskData {
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
    works: V2WorkData[];
    displayStatus?: string;
    displayIcon?: string;
    archived?: boolean;
    updatedAt?: string;
    latestUpdatedAt?: string;
}
export type V2GoalData = V2TaskData;
export type V2PhaseData = V2WorkData;
export type V2ActionData = V2StepData;
export interface V2ReviewTaskData {
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
export interface V2ArtifactData {
    path: string;
    type: string;
    retention: string;
    taskId: string;
    createdAt: string;
}
export interface V2StatsData {
    taskCount: number;
    workCount: number;
    stepCount: number;
    completedCount: number;
    actionRequiredCount: number;
    reviewPendingCount: number;
    proposalCount: number;
}
/**
 * V2.1 ダッシュボードデータ生成オプション
 */
export interface V2DashboardOptions {
    showArchived?: boolean;
    statusFilter?: "open" | "closed" | "all";
    offset?: number;
    limit?: number;
    sortField?: "id" | "updatedAt";
    sortOrder?: "asc" | "desc";
    sortBy?: "id" | "updated";
    search?: string;
    priority?: "high" | "medium" | "low";
    assignee?: string;
}
/**
 * タスク一覧からV2.1ダッシュボードデータを生成
 */
export declare function generateV2DashboardData(projectPath: string, options?: V2DashboardOptions): Promise<V2DashboardData>;
