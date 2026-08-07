/**
 * resume_parked_task ビジネスロジック（task-1688-2・案B）
 *
 * パーク中タスクを maid yaml のアクティブスロットへ再開（昇格）する。
 * tasks.yaml 側のstatus遷移（blocked→working）は対象外——それは引き続き
 * メイド自身が `maidctl set my-status working` で行う（update-status.ts は無改修）。
 * 本関数は「メイドのアクティブスロットがどのタスクを指すか」というローカルな
 * スワップ・昇格のみを担う。
 *
 * 優先順位のブレ防止: 自動昇格は一切行わない。チーフが明示的にこの関数（コマンド）を
 * 呼んだときのみ再開が発生する。
 */
export interface ResumeParkedTaskParams {
    queueMaidPath: string;
    projectPath: string;
    agentId: string;
    /** 再開対象のパーク中タスクID */
    taskId: string;
}
export interface ResumeParkedTaskOutput {
    success: boolean;
    agent_id: string;
    task_id: string;
    error?: string;
}
export declare function executeResumeParkedTask(params: ResumeParkedTaskParams): Promise<ResumeParkedTaskOutput>;
