/**
 * task-manager / task-side-effects 共通型定義
 *
 * 循環参照解消のため、task-manager.ts から分離。
 * task-manager.ts と task-side-effects.ts の両方からインポートされる。
 *
 * V5.0.0: @maid-agent/types からの re-export に変更
 */

// @maid-agent/types からすべての型を re-export
export type {
  // Task status types
  TaskStatus,
  TaskType,
  TaskMainStatus,
  TaskSubstatus,
  TaskSize,
  ReviewStatus,
  OperatorRole,
  StatusTransitionValidation,
  RetentionLevel,

  // Task data types
  TaskArtifact,
  EscalationInfo,
  TaskCategory,
  Assignee,
  Task,
  TaskSummary,
  TasksData,
  UpdateTaskParams,
  SideEffectResults,
  UpdateTaskResult,
} from "@maid-agent/types";
