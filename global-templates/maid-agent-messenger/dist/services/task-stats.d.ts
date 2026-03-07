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
export interface DashboardData {
    v2Goals: GoalData[];
    v2ReviewQueue: ReviewTaskData[];
    v2Artifacts: ArtifactData[];
    v2Stats: StatsData;
    totalGoals: number;
}
export interface StepData {
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
export interface WorkData {
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
    steps: StepData[];
    updatedAt?: string;
    hasReport?: boolean;
}
export interface TaskData {
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
    works: WorkData[];
    displayStatus?: string;
    displayIcon?: string;
    archived?: boolean;
    updatedAt?: string;
    latestUpdatedAt?: string;
    hasReport?: boolean;
    actionRequired?: boolean;
}
export type GoalData = TaskData;
export type PhaseData = WorkData;
export type ActionData = StepData;
export interface ReviewTaskData {
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
export interface ArtifactData {
    path: string;
    type: string;
    retention: string;
    taskId: string;
    createdAt: string;
}
export interface StatsData {
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
export interface DashboardOptions {
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
export declare function generateDashboardData(projectPath: string, options?: DashboardOptions): Promise<DashboardData>;
