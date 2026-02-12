/**
 * タスク管理サービス
 *
 * MCPタスク管理システムのコアロジック
 * tasks.yaml を単一ファイルで管理
 */
export type TaskStatus = "pending" | "assigned" | "working" | "completed" | "blocked" | "cancelled";
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
    assignees?: string[];
    category?: TaskCategory;
}
export interface CreateTaskResult {
    taskId: string;
    task: Task;
}
/**
 * タスク作成
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
}
export interface SideEffectResults {
    maidYamlSynced?: boolean;
    reportArchived?: boolean;
    reportTemplatized?: boolean;
    archivePath?: string;
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
