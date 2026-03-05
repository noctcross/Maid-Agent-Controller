/**
 * task-manager / task-side-effects 共通型定義
 *
 * 循環参照解消のため、task-manager.ts から分離。
 * task-manager.ts と task-side-effects.ts の両方からインポートされる。
 */
export type TaskStatus = "pending" | "assigned" | "working" | "completed" | "blocked" | "cancelled";
export type TaskType = "task" | "work" | "step" | "investigation";
export type TaskMainStatus = "open" | "closed" | "cancelled";
export type TaskSubstatus = "pending" | "assigned" | "working" | "checkpoint" | "waiting" | "completed" | "archived";
export type TaskSize = "simple" | "standard" | "complex";
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected";
export type OperatorRole = "maid" | "chief" | "butler" | "master";
export interface StatusTransitionValidation {
    valid: boolean;
    error?: string;
}
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
export interface EscalationInfo {
    title: string;
    detail?: string;
}
export type TaskCategory = "task" | "skill_candidate" | "improvement";
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
    actionRequired?: boolean;
    actionRequiredAt?: string | null;
    type?: TaskType;
    mainStatus?: TaskMainStatus;
    v2Substatus?: TaskSubstatus;
    size?: TaskSize;
    tentative?: boolean;
    blockedBy?: string[];
    artifacts?: TaskArtifact[];
    reviewStatus?: ReviewStatus;
    archived?: boolean;
    archivedAt?: string | null;
    stepRequired?: boolean;
    escalation?: EscalationInfo;
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
    actionRequired?: boolean;
    title?: string;
    description?: string;
    priority?: "high" | "medium" | "low";
    targetPath?: string;
    agentId?: string;
    mainStatus?: TaskMainStatus;
    v2Substatus?: TaskSubstatus;
    type?: TaskType;
    size?: TaskSize;
    tentative?: boolean;
    blockedBy?: string[];
    artifacts?: TaskArtifact[];
    artifactAdd?: TaskArtifact;
    reviewStatus?: ReviewStatus;
    archived?: boolean;
    force?: boolean;
    escalation?: EscalationInfo;
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
    autoClosedParents?: string[];
}
export interface UpdateTaskResult {
    success: boolean;
    task: Task | null;
    sideEffects?: SideEffectResults;
    error?: string;
}
