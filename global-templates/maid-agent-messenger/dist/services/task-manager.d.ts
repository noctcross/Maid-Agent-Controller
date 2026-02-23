/**
 * タスク管理サービス
 *
 * MCPタスク管理システムのコアロジック
 * tasks.yaml を単一ファイルで管理
 */
export type TaskStatus = "pending" | "assigned" | "working" | "completed" | "blocked" | "cancelled";
export type TaskType = "goal" | "phase" | "action" | "investigation";
export type TaskMainStatus = "open" | "closed";
export type TaskSubstatus = "active" | "paused" | "checkpoint" | "waiting" | "completed" | "archived";
export type GoalSize = "simple" | "standard" | "complex";
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected";
export type RetentionLevel = "L1" | "L2" | "L3";
export interface TaskArtifact {
    type: string;
    path: string;
    base?: "temporary" | "permanent";
    retention: RetentionLevel;
}
export interface Assignee {
    agentId: string;
    role: string | null;
    subTaskId: string | null;
}
export type TaskCategory = "task" | "action_required" | "skill_candidate" | "improvement";
export interface Task {
    id: string;
    parentId: string | null;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    status: TaskStatus;
    substatus: string | null;
    category: TaskCategory;
    assignees: Assignee[];
    targetPath?: string | null;
    createdAt: string;
    assignedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    updatedAt: string;
    reportPaths: string[];
    summary: string | null;
    reviewed?: boolean;
    starred?: boolean;
    reviewedAt?: string | null;
    starredAt?: string | null;
    escalation?: boolean;
    escalatedAt?: string | null;
    type?: TaskType;
    mainStatus?: TaskMainStatus;
    v2Substatus?: TaskSubstatus;
    size?: GoalSize;
    tentative?: boolean;
    blockedBy?: string[];
    artifacts?: TaskArtifact[];
    reviewStatus?: ReviewStatus;
    archived?: boolean;
    archivedAt?: string | null;
}
/**
 * 軽量版タスク（summaryOnly: true 時に返却）
 */
export interface TaskSummary {
    id: string;
    parentId: string | null;
    title: string;
    status: TaskStatus;
    priority: "high" | "medium" | "low";
    category: TaskCategory;
    assignees: Assignee[];
}
export interface TasksData {
    lastTaskNumber: number;
    tasks: Task[];
}
export interface CreateTaskParams {
    title: string;
    description?: string;
    priority?: "high" | "medium" | "low";
    parentId?: string;
    category?: TaskCategory;
    type?: TaskType;
    size?: GoalSize;
    tentative?: boolean;
    blockedBy?: string[];
}
export interface CreateTaskResult {
    taskId: string;
    task: Task;
}
/**
 * タスク作成
 *
 * Note: assigneesはcreate_taskでは指定不可。assign_taskで別途アサインする。
 * 理由: 作業中メイドへのアサインを防ぐガード条件がassign_taskにあるため。
 */
export declare function executeCreateTask(projectPath: string, params: CreateTaskParams): Promise<CreateTaskResult>;
export interface GetTaskParams {
    taskId: string;
    includeSubtasks?: boolean;
    summaryOnly?: boolean;
}
export interface GetTaskResult {
    task: Task | TaskSummary | null;
    subtasks?: (Task | TaskSummary)[];
}
/**
 * タスク取得
 */
export declare function executeGetTask(projectPath: string, params: GetTaskParams): Promise<GetTaskResult>;
export interface ListTasksParams {
    status?: TaskStatus[];
    assignee?: string;
    parentId?: string | null;
    category?: TaskCategory[];
    reviewed?: boolean;
    starred?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
    sortField?: "createdAt" | "completedAt" | "priority" | "status" | "id" | "updatedAt";
    sortOrder?: "asc" | "desc";
    summaryOnly?: boolean;
}
export interface ListTasksResult {
    tasks: (Task | TaskSummary)[];
    total: number;
    hasMore: boolean;
}
/**
 * タスクIDを数値的に比較する
 * 例: "048" < "048-1" < "048-2" < "048-10" (文字列比較だと "048-10" < "048-2" になる)
 */
export declare function compareTaskIds(a: string, b: string): number;
/**
 * タスク一覧取得
 */
export declare function executeListTasks(projectPath: string, params?: ListTasksParams): Promise<ListTasksResult>;
export interface UpdateTaskParams {
    taskId: string;
    status?: TaskStatus;
    substatus?: string;
    category?: TaskCategory;
    assignees?: Assignee[];
    summary?: string;
    reportPath?: string;
    reviewed?: boolean;
    starred?: boolean;
    escalation?: boolean;
    description?: string;
    targetPath?: string;
    agentId?: string;
    mainStatus?: TaskMainStatus;
    v2Substatus?: TaskSubstatus;
    type?: TaskType;
    size?: GoalSize;
    tentative?: boolean;
    blockedBy?: string[];
    artifacts?: TaskArtifact[];
    artifactAdd?: TaskArtifact;
    reviewStatus?: ReviewStatus;
    archived?: boolean;
}
export interface SideEffectResults {
    maidYamlSynced?: boolean;
    reportArchived?: boolean;
    reportArchiveSkipped?: boolean;
    archiveSkipReason?: string;
    reportTemplatized?: boolean;
    archivePath?: string;
    dependencyResolved?: boolean;
    unblockedTasks?: Array<{
        taskId: string;
        assignees: string[];
        previousSubstatus: string;
    }>;
    goalAutoClosed?: string;
}
export interface UpdateTaskResult {
    success: boolean;
    task: Task | null;
    sideEffects?: SideEffectResults;
}
/**
 * タスク更新
 *
 * unified-task-state-gateway: 唯一の書き込みゲートウェイ。
 * tasks.yaml 更新後、副作用（maid yaml同期・レポートアーカイブ・テンプレート初期化）を実行。
 */
export declare function executeUpdateTask(projectPath: string, params: UpdateTaskParams): Promise<UpdateTaskResult>;
/**
 * 依存解消時の自動更新結果
 */
export interface DependencyResolutionResult {
    unblockedTasks: Array<{
        taskId: string;
        assignees: string[];
        previousSubstatus: string;
    }>;
}
/**
 * タスク完了時に依存しているタスクを自動的に waiting → active に更新
 *
 * V2.1 設計書より:
 * 1. タスクA完了: maidctl my-status completed
 * 2. システムが blockedBy を検索
 * 3. タスクBが blockedBy: ["A"] を持つ場合
 *    → タスクBの担当者に自動通知
 *    → タスクBの substatus を waiting → active に更新
 */
export declare function resolveBlockedTasks(projectPath: string, completedTaskId: string): Promise<DependencyResolutionResult>;
/**
 * V2.1: タスク種別の判定（後方互換）
 * type が未設定の場合、parentId の有無で推定
 */
export declare function inferTaskType(task: Task): TaskType;
/**
 * V2.1: ステータス変換（旧 → 新）
 */
export declare function convertToV2Status(task: Task): {
    mainStatus: TaskMainStatus;
    substatus: TaskSubstatus;
};
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
}>): {
    displayStatus: string;
    displayIcon: string;
};
/**
 * V2.1: Goal の自動クローズ判定
 *
 * 条件:
 * - 全Phaseが completed
 * - レビューPhaseが存在する場合は approved
 * - 除外カテゴリなし (skill_candidate, improvement, action_required)
 */
export declare function checkGoalAutoClose(projectPath: string, goalId: string): Promise<{
    canAutoClose: boolean;
    reason?: string;
}>;
/**
 * V2.1 ダッシュボードデータ
 */
export interface V2DashboardData {
    v2Goals: V2GoalData[];
    v2ReviewQueue: V2ReviewTaskData[];
    v2Artifacts: V2ArtifactData[];
    v2Stats: V2StatsData;
}
export interface V2ActionData {
    id: string;
    title: string;
    type: "action";
    mainStatus: string;
    v2Substatus: string;
    assignees?: Array<{
        agentId: string;
    }>;
}
export interface V2PhaseData {
    id: string;
    title: string;
    type: "phase";
    mainStatus: string;
    v2Substatus: string;
    reviewStatus?: string;
    actions: V2ActionData[];
}
export interface V2GoalData {
    id: string;
    title: string;
    type: "goal";
    mainStatus: string;
    v2Substatus: string;
    size?: string;
    reviewStatus?: string;
    assignees: Array<{
        agentId: string;
    }>;
    phases: V2PhaseData[];
    displayStatus?: string;
    displayIcon?: string;
}
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
    goalCount: number;
    phaseCount: number;
    actionCount: number;
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
}
/**
 * タスク一覧からV2.1ダッシュボードデータを生成
 */
export declare function generateV2DashboardData(projectPath: string, options?: V2DashboardOptions): Promise<V2DashboardData>;
/**
 * 旧ステータスから V2.1 ステータスへのマッピング
 *
 * 実装計画書 3.2 準拠
 */
export declare function mapLegacyToV2Status(legacyStatus: TaskStatus, legacySubstatus: string | null): {
    mainStatus: TaskMainStatus;
    v2Substatus: TaskSubstatus;
};
/**
 * 単一タスクを V2.1 形式にマイグレーション
 *
 * 実装計画書 3.6 準拠
 * - 既に V2.1 形式の場合はそのまま返す
 * - archivedフラグを独立フラグとして設定
 */
export declare function migrateTaskToV2(task: Task): Task;
/**
 * マイグレーション結果
 */
export interface MigrationResult {
    totalTasks: number;
    migratedTasks: number;
    skippedTasks: number;
    details: Array<{
        taskId: string;
        action: "migrated" | "skipped";
        changes?: Record<string, unknown>;
        reason?: string;
    }>;
}
/**
 * 既存タスクを V2.1 形式にマイグレーション
 *
 * 設計書より:
 * 1. 既存タスクに type: action を付与（デフォルト）
 * 2. 親タスクを type: goal に変更
 * 3. サブタスクグループを type: phase に変更（直接の親が goal の場合）
 * 4. 調査系タスクを type: investigation に変更
 * 5. mainStatus/v2Substatus を旧 status から変換
 */
export declare function migrateToV2(projectPath: string, options?: {
    dryRun?: boolean;
}): Promise<MigrationResult>;
/**
 * V2.1 マイグレーション状況の確認
 */
export declare function checkMigrationStatus(projectPath: string): Promise<{
    totalTasks: number;
    v2Tasks: number;
    legacyTasks: number;
    migrationRequired: boolean;
}>;
