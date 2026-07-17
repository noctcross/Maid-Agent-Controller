/**
 * タスク関連の型定義
 *
 * @maid-agent/types - Task types
 */

// 後方互換: 旧ステータス
export type TaskStatus =
  | "pending"
  | "assigned"
  | "working"
  | "completed"
  | "blocked"
  | "cancelled";

// V2.1: タスク種別
export type TaskType = "task" | "work" | "step" | "investigation";

// V2.1: メインステータス（open/closed/cancelled）
export type TaskMainStatus = "open" | "closed" | "cancelled";

// V2.1: サブステータス
export type TaskSubstatus =
  | "pending"
  | "assigned"
  | "working"
  | "checkpoint"
  | "waiting"
  | "completed"
  | "archived";

// V2.1: Task サイズ
export type TaskSize = "simple" | "standard" | "complex";

// V2.1: レビューステータス
export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected";

// V2.1: 操作者の役割
export type OperatorRole = "maid" | "chief" | "butler" | "master";

// V2.1: ステータス遷移バリデーション結果
export interface StatusTransitionValidation {
  valid: boolean;
  error?: string;
}

// V2.1: Retention レベル
export type RetentionLevel = "L1" | "L2" | "L3";

// V2.1: 成果物
export interface TaskArtifact {
  type: string; // summary, design, report, etc.
  path: string; // 相対パス
  base?: "temporary" | "permanent"; // ベースディレクトリ
  retention: RetentionLevel;
}

// V2.1: エスカレーション情報
export interface EscalationInfo {
  title: string; // エスカレーション件名
  detail?: string; // 詳細・背景（省略可）
}

// C-1: Type B（通過型チェックポイント）記録エントリ
export interface CheckpointPassEntry {
  timestamp: string; // 記録日時
  summary: string; // 暫定判断の内容と根拠
  agentId: string; // 記録したエージェントID
  // task-1637-9 (W-CP): 検討した選択肢（省略可）。CodeLodis側「判断変更」モーダルで
  // ボタン化して提示するために使う（W-B1）。省略時はエントリにキー自体を含めない。
  options?: string[];
}

export type TaskCategory = "task" | "skill_candidate" | "improvement";

export interface Assignee {
  agentId: string;
  role: string | null;
  subTaskId: string | null;
}

export interface Task {
  id: string;
  parentId: string | null;
  title: string; // タスクタイトル（短い概要）
  description: string; // タスク説明（詳細）
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  substatus: string | null;
  category: TaskCategory;
  assignees: Assignee[];
  targetPath?: string | null; // 作業対象パス（optional for backward compat）
  createdAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string; // 最終更新日時
  reportPaths: string[];
  summary: string | null;
  actionRequired?: boolean; // ご主人様対応必要フラグ
  actionRequiredAt?: string | null; // 対応必要フラグ設定日時

  // === V2.1 拡張フィールド ===
  type?: TaskType; // goal/phase/action/investigation (default: action)
  mainStatus?: TaskMainStatus; // open/closed (V2.1ステータス)
  subStatus?: TaskSubstatus; // V2.1サブステータス
  size?: TaskSize; // simple/standard/complex (Task only)
  tentative?: boolean; // 暫定Task (Task only)
  blockedBy?: string[]; // 依存先タスクID (waiting時)
  artifacts?: TaskArtifact[]; // 成果物リスト
  reviewStatus?: ReviewStatus; // pending/in_review/approved/rejected

  // === V2.1: アーカイブフラグ（独立フラグ） ===
  archived?: boolean; // アーカイブ済み（デフォルト: false）
  archivedAt?: string | null; // アーカイブ日時

  // === V2.1: 自動クローズ制御 ===
  stepRequired?: boolean; // Step必須フラグ（trueの場合、自動クローズ対象外）

  // === V2.1: エスカレーション情報 ===
  escalation?: EscalationInfo; // エスカレーション情報（checkpoint時）

  // === C-1: Type B（通過型チェックポイント）記録 ===
  checkpointPassed?: CheckpointPassEntry[]; // 通過型チェックポイントの記録一覧
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
  // --- 既存 ---
  status?: TaskStatus;
  substatus?: string;
  category?: TaskCategory;
  assignees?: Assignee[];
  summary?: string;
  reportPath?: string;
  actionRequired?: boolean; // ご主人様対応必要フラグ
  // --- 追加: unified-task-state-gateway ---
  title?: string; // タスクタイトル変更
  description?: string; // タスク説明（assign_task が独自の詳細説明を渡す場合に使用）
  priority?: "high" | "medium" | "low"; // 優先度変更
  targetPath?: string; // 作業対象パス（assign_task からの伝達用）
  agentId?: string; // 操作元メイドID（update_status からの伝達用）

  // === V2.1 拡張パラメータ ===
  mainStatus?: TaskMainStatus; // open/closed
  subStatus?: TaskSubstatus; // V2.1サブステータス
  type?: TaskType; // goal/phase/action/investigation
  size?: TaskSize; // simple/standard/complex (Task only)
  tentative?: boolean; // 暫定Task (Task only)
  blockedBy?: string[]; // 依存先タスクID
  artifacts?: TaskArtifact[]; // 成果物リスト
  artifactAdd?: TaskArtifact; // 成果物追加
  reviewStatus?: ReviewStatus; // pending/in_review/approved/rejected
  archived?: boolean; // アーカイブフラグ（独立フラグ）

  // === 子タスクチェック制御 ===
  force?: boolean; // 子タスクチェックをスキップ（未完了子がいても完了可能）

  // === V2.1: エスカレーション情報 ===
  escalation?: EscalationInfo; // エスカレーション情報（checkpoint時）

  // === C-1: Type B（通過型チェックポイント）記録 ===
  checkpointPassAdd?: { summary: string; agentId: string; options?: string[] }; // 通過型チェックポイント記録追加（timestampはサーバー側で付与）
}

export interface SideEffectResults {
  maidYamlSynced?: boolean;
  reportArchived?: boolean;
  reportArchiveSkipped?: boolean;
  archiveSkipReason?: string;
  reportTemplatized?: boolean;
  archivePath?: string;
  // V2.1: 依存解消結果
  dependencyResolved?: boolean;
  unblockedTasks?: Array<{
    taskId: string;
    assignees: string[];
    previousSubstatus: string;
  }>;
  // V2.1: Goal自動クローズ結果（後方互換）
  goalAutoClosed?: string;
  // V2.1: 親タスク自動クローズ結果（再帰的）
  autoClosedParents?: string[];
}

export interface UpdateTaskResult {
  success: boolean;
  task: Task | null;
  sideEffects?: SideEffectResults;
  error?: string; // エラーメッセージ（success=false時）
}
