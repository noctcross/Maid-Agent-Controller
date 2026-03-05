/**
 * タスク統計・ダッシュボードデータ生成
 *
 * V2.1 ダッシュボードデータの生成処理を提供。
 * task-manager.ts から責務分割のため分離。
 */

import type {
  Task,
  TaskType,
} from "../types/task-manager-types.js";
import { loadTasksReadOnly } from "./task-core.js";
import { inferTaskType, convertToV2Status } from "./task-v2-migration.js";
import { logger } from "../utils/logger.js";

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
export function computeGoalDisplayStatus(
  goalSubstatus: string,
  phases: Array<{ v2Substatus: string; mainStatus?: string }>,
  goalMainStatus?: string
): { displayStatus: string; displayIcon: string } {
  // Goal自身が closed/completed の場合は「完了」を返す
  if (goalMainStatus === "closed" || goalSubstatus === "completed") {
    return { displayStatus: "完了", displayIcon: "✅" };
  }

  // Phaseがない場合はGoal自身のステータスを使用
  if (phases.length === 0) {
    return mapSubstatusToDisplay(goalSubstatus);
  }

  const substatuses = phases.map((p) => p.v2Substatus);

  // ブロック中（waiting/checkpoint）を最優先
  if (substatuses.some((s) => s === "waiting" || s === "checkpoint")) {
    return { displayStatus: "ブロック中", displayIcon: "⚠️" };
  }

  // 全Phase完了（Goalがまだopenの場合）
  if (phases.every((p) => p.v2Substatus === "completed" || p.mainStatus === "closed")) {
    return { displayStatus: "完了可能", displayIcon: "✅" };
  }

  // いずれかPhase working（active は後方互換）
  if (substatuses.some((s) => s === "working" || s === "active")) {
    return { displayStatus: "進行中", displayIcon: "🔵" };
  }

  // いずれかPhase assigned
  if (substatuses.some((s) => s === "assigned")) {
    return { displayStatus: "準備中", displayIcon: "📋" };
  }

  // 全Phase pending（paused は後方互換）
  if (substatuses.every((s) => s === "pending" || s === "paused")) {
    return { displayStatus: "未着手", displayIcon: "⏸️" };
  }

  // フォールバック
  logger.warn(`Unexpected phase states: ${substatuses.join(", ")}, defaulting to 進行中`);
  return { displayStatus: "進行中", displayIcon: "🔵" };
}

/**
 * substatusを表示用ステータスにマッピング
 */
function mapSubstatusToDisplay(substatus: string): { displayStatus: string; displayIcon: string } {
  switch (substatus) {
    case "pending":
    case "paused":  // 後方互換: paused → pending
      return { displayStatus: "未着手", displayIcon: "⏸️" };
    case "assigned":
      return { displayStatus: "準備中", displayIcon: "📋" };
    case "working":
    case "active":  // 後方互換: active → working
      return { displayStatus: "進行中", displayIcon: "🔵" };
    case "waiting":
      return { displayStatus: "依存待ち", displayIcon: "⏳" };
    case "checkpoint":
      return { displayStatus: "確認待ち", displayIcon: "🔶" };
    case "completed":
      return { displayStatus: "完了", displayIcon: "✅" };
    case "archived":
      return { displayStatus: "アーカイブ", displayIcon: "📦" };
    default:
      return { displayStatus: "進行中", displayIcon: "🔵" };
  }
}

// =============================================================================
// V2.1: ダッシュボードデータ生成
// =============================================================================

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
  assignees?: Array<{ agentId: string }>;
  updatedAt?: string;
  // 報告書有無フラグ
  hasReport?: boolean;
}

export interface V2WorkData {
  id: string;
  title: string;
  description?: string;
  type: "work";
  mainStatus: string;
  v2Substatus: string;
  reviewStatus?: string;
  assignees?: Array<{ agentId: string }>;
  steps: V2StepData[];
  updatedAt?: string;
  // 報告書有無フラグ
  hasReport?: boolean;
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
  assignees: Array<{ agentId: string }>;
  works: V2WorkData[];
  // Task階層連動: 子Workの状態から計算された表示用ステータス
  displayStatus?: string;
  displayIcon?: string;
  // V2.1: アーカイブフラグ
  archived?: boolean;
  // V2.1: 更新日時（表示用：Task自身の更新日時）
  updatedAt?: string;
  // V2.1: 最新更新日時（ソート用：配下のWork/Stepを含む最新日時）
  latestUpdatedAt?: string;
  // 報告書有無フラグ
  hasReport?: boolean;
}

// 後方互換エイリアス
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
  assignees: Array<{ agentId: string }>;
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
  showArchived?: boolean;                      // アーカイブ済みを表示（デフォルト: false）
  statusFilter?: "open" | "closed" | "all";    // ステータスフィルタ（デフォルト: "open"）
  offset?: number;                              // ページネーション: オフセット
  limit?: number;                               // ページネーション: 件数（デフォルト: 10）
  sortField?: "id" | "updatedAt";              // ソートフィールド（デフォルト: "id"）
  sortOrder?: "asc" | "desc";                   // ソート順（デフォルト: "desc"）
  sortBy?: "id" | "updated";                    // Work/Stepのソート: "id"=ID昇順, "updated"=updatedAt降順（デフォルト: "updated"）
  // 検索・絞り込みフィルター
  search?: string;                              // タスクID/タイトル検索（部分一致）
  priority?: "high" | "medium" | "low";         // 優先度フィルター
  assignee?: string;                            // 担当者フィルター（agentId）
}

/**
 * タスク一覧からV2.1ダッシュボードデータを生成
 */
export async function generateV2DashboardData(
  projectPath: string,
  options: V2DashboardOptions = {}
): Promise<V2DashboardData> {
  const {
    showArchived = false,
    statusFilter = "open",
    offset = 0,
    limit = 10,
    sortField = "id",
    sortOrder = "desc",
    sortBy = "updated",
    search,
    priority,
    assignee,
  } = options;
  const data = await loadTasksReadOnly(projectPath);
  const tasks = data.tasks;

  // タスクのMapを作成（親タスク参照用）
  const taskMap = new Map<string, Task>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  /**
   * タスク種別を判定（親タスクの情報も使用）
   * 1. type が 'goal', 'phase', 'investigation' の場合はそのまま使用
   * 2. type が 'step' または未設定の場合は親タスク構造で判定:
   *    - parentId がない → task
   *    - parentId があり、親の parentId がない → work（Taskの直接の子）
   *    - parentId があり、親の parentId もある → step（孫タスク）
   */
  function inferTypeWithContext(task: Task): TaskType {
    // type が 'task', 'work', 'investigation' の場合はそのまま使用
    if (task.type === "task" || task.type === "work" || task.type === "investigation") {
      return task.type;
    }
    // type が 'step' または未設定の場合は親タスク構造で判定
    if (!task.parentId) return "task";
    // 親タスクを取得
    const parent = taskMap.get(task.parentId);
    // 親タスクが存在し、その親がない場合はwork（Taskの直接の子）
    if (parent && !parent.parentId) return "work";
    // それ以外はstep（孫タスク）
    return "step";
  }

  // Task/Work/Step を分類
  const goals: Task[] = [];
  const phases: Task[] = [];
  const actions: Task[] = [];
  const investigations: Task[] = [];

  // Task階層から除外するカテゴリ（提案は別パネルで表示、actionRequired はフラグで管理）
  const excludedCategories = ["skill_candidate", "improvement"];

  for (const task of tasks) {
    const taskType = inferTypeWithContext(task);
    switch (taskType) {
      case "task":
        // 提案・要対応カテゴリはTask階層から除外
        if (!excludedCategories.includes(task.category || "task")) {
          goals.push(task);
        }
        break;
      case "work":
        phases.push(task);
        break;
      case "step":
        actions.push(task);
        break;
      case "investigation":
        investigations.push(task);
        break;
    }
  }

  // タスクID比較用ヘルパー（数値部分を考慮）
  const compareTaskIds = (idA: string, idB: string): number => {
    const partsA = idA.split("-");
    const partsB = idB.split("-");
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const pa = i < partsA.length ? parseInt(partsA[i], 10) : -1;
      const pb = i < partsB.length ? parseInt(partsB[i], 10) : -1;
      const numA = isNaN(pa) ? -1 : pa;
      const numB = isNaN(pb) ? -1 : pb;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  };

  // 検索・フィルター用ヘルパー関数
  const matchesSearch = (task: Task, searchTerm: string): boolean => {
    const term = searchTerm.toLowerCase();
    const idMatch = task.id.toLowerCase().includes(term);
    const titleMatch = (task.title || "").toLowerCase().includes(term);
    return idMatch || titleMatch;
  };

  const hasAssignee = (task: Task, targetAssignee: string): boolean => {
    return task.assignees?.some((a) => a.agentId === targetAssignee) ?? false;
  };

  // 階層全体で検索・担当者がマッチするか判定
  const matchesHierarchy = (
    goal: Task,
    searchTerm: string | undefined,
    targetAssignee: string | undefined
  ): boolean => {
    // Goalレベルでマッチ
    if (searchTerm && matchesSearch(goal, searchTerm)) return true;
    if (targetAssignee && hasAssignee(goal, targetAssignee)) return true;

    // Work/Stepレベルでマッチを検索
    const goalWorks = phases.filter((p) => p.parentId === goal.id);
    for (const work of goalWorks) {
      if (searchTerm && matchesSearch(work, searchTerm)) return true;
      if (targetAssignee && hasAssignee(work, targetAssignee)) return true;

      const workSteps = actions.filter((a) => a.parentId === work.id);
      for (const step of workSteps) {
        if (searchTerm && matchesSearch(step, searchTerm)) return true;
        if (targetAssignee && hasAssignee(step, targetAssignee)) return true;
      }
    }

    // searchTermもtargetAssigneeも指定なしの場合はtrue
    return !searchTerm && !targetAssignee;
  };

  // V2Goals: Goal階層構造を構築（フィルタ → 変換 → ソートの順で処理）
  const v2Goals: V2GoalData[] = goals
    // archivedフィルタ: デフォルトでarchivedを除外
    .filter((g) => showArchived || g.archived !== true)
    // statusフィルタ: open/closed/all
    .filter((g) => {
      if (statusFilter === "all") return true;
      const { mainStatus } = convertToV2Status(g);
      if (statusFilter === "open") return mainStatus === "open";
      if (statusFilter === "closed") return mainStatus === "closed";
      return true;
    })
    // 優先度フィルタ
    .filter((g) => !priority || g.priority === priority)
    // 検索・担当者フィルタ（階層全体で検索）
    .filter((g) => matchesHierarchy(g, search, assignee))
    .map((goal) => {
      const { mainStatus, substatus } = convertToV2Status(goal);

      // このGoalに属するPhaseを取得（sortByに応じてソート）
      const goalPhases = phases
        .filter((p) => p.parentId === goal.id)
        .sort((a, b) => {
          if (sortBy === "id") {
            // ID順（昇順）
            return compareTaskIds(a.id, b.id);
          } else {
            // updatedAt順（降順）
            const aTime = a.updatedAt || a.createdAt || "";
            const bTime = b.updatedAt || b.createdAt || "";
            return bTime.localeCompare(aTime);
          }
        });

      const v2Works: V2WorkData[] = goalPhases.map((phase) => {
        const phaseStatus = convertToV2Status(phase);

        // このWorkに属するStepを取得（sortByに応じてソート）
        const phaseActions = actions
          .filter((a) => a.parentId === phase.id)
          .sort((a, b) => {
            if (sortBy === "id") {
              // ID順（昇順）
              return compareTaskIds(a.id, b.id);
            } else {
              // updatedAt順（降順）
              const aTime = a.updatedAt || a.createdAt || "";
              const bTime = b.updatedAt || b.createdAt || "";
              return bTime.localeCompare(aTime);
            }
          });

        const v2Steps: V2StepData[] = phaseActions.map((action) => {
          const actionStatus = convertToV2Status(action);
          return {
            id: action.id,
            title: action.title || `Step #${action.id}`,
            description: action.description,
            type: "step" as const,
            mainStatus: actionStatus.mainStatus,
            v2Substatus: actionStatus.substatus,
            assignees: action.assignees?.map((a) => ({ agentId: a.agentId })),
            updatedAt: action.updatedAt,
            hasReport: (action.reportPaths?.length ?? 0) > 0,
          };
        });

        return {
          id: phase.id,
          title: phase.title || `Work #${phase.id}`,
          description: phase.description,
          type: "work" as const,
          mainStatus: phaseStatus.mainStatus,
          v2Substatus: phaseStatus.substatus,
          reviewStatus: phase.reviewStatus,
          assignees: phase.assignees?.map((a) => ({ agentId: a.agentId })),
          steps: v2Steps,
          updatedAt: phase.updatedAt,
          hasReport: (phase.reportPaths?.length ?? 0) > 0,
        };
      });

      // Task階層連動: 子Workの状態から表示ステータスを計算
      // Task自身が closed の場合は「完了」を返す
      const { displayStatus, displayIcon } = computeGoalDisplayStatus(
        substatus,
        v2Works.map((w) => ({ v2Substatus: w.v2Substatus, mainStatus: w.mainStatus })),
        mainStatus
      );

      // 最新更新日時を計算（Task自身 + 配下のWork/Step）
      const childUpdates = v2Works.flatMap((w) =>
        [w.updatedAt, ...w.steps.map((s) => s.updatedAt)]
      ).filter((d): d is string => Boolean(d));
      const allUpdates = [goal.updatedAt, ...childUpdates].filter((d): d is string => Boolean(d));
      const latestUpdatedAt = allUpdates.length > 0
        ? allUpdates.sort().pop()
        : goal.updatedAt;

      return {
        id: goal.id,
        title: goal.title || `Task #${goal.id}`,
        description: goal.description,
        type: "task" as const,
        mainStatus,
        v2Substatus: substatus,
        size: goal.size,
        reviewStatus: goal.reviewStatus,
        assignees: goal.assignees?.map((a) => ({ agentId: a.agentId })) || [],
        works: v2Works,
        displayStatus,
        displayIcon,
        archived: goal.archived || substatus === "archived",
        updatedAt: goal.updatedAt,
        latestUpdatedAt,
        hasReport: (goal.reportPaths?.length ?? 0) > 0,
      };
    })
    // ソート: latestUpdatedAt を使用（子タスクの最新日時を含む）
    .sort((a, b) => {
      let cmp: number;
      if (sortField === "updatedAt") {
        const aTime = a.latestUpdatedAt || a.updatedAt || "";
        const bTime = b.latestUpdatedAt || b.updatedAt || "";
        cmp = aTime.localeCompare(bTime);
      } else {
        // デフォルト: id でソート
        cmp = compareTaskIds(a.id, b.id);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

  // ページネーション: totalGoals はフィルタリング後の件数
  const totalGoals = v2Goals.length;
  const paginatedV2Goals = v2Goals.slice(offset, offset + limit);

  // V2ReviewQueue: レビュー待ちタスク（updatedAt降順でソート）
  const v2ReviewQueue: V2ReviewTaskData[] = tasks
    .filter((t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review")
    .sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt || "";
      const bTime = b.updatedAt || b.createdAt || "";
      return bTime.localeCompare(aTime);
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      type: inferTaskType(task),
      reviewStatus: task.reviewStatus || "pending",
      priority: task.priority || "medium",
      completedAt: task.completedAt || "",
      assignees: task.assignees?.map((a) => ({ agentId: a.agentId })) || [],
    }));

  // V2Artifacts: 成果物一覧（createdAt降順でソート）
  const v2Artifacts: V2ArtifactData[] = [];
  for (const task of tasks) {
    if (task.artifacts && Array.isArray(task.artifacts)) {
      for (const artifact of task.artifacts) {
        v2Artifacts.push({
          path: artifact.path,
          type: artifact.type || "default",
          retention: artifact.retention || "L1",
          taskId: task.id,
          createdAt: task.createdAt,  // TaskArtifact には createdAt がないので task から取得
        });
      }
    }
  }
  // 成果物を作成日時の降順でソート
  v2Artifacts.sort((a, b) => {
    const aTime = a.createdAt || "";
    const bTime = b.createdAt || "";
    return bTime.localeCompare(aTime);
  });

  // V2Stats: 統計情報
  const completedCount = tasks.filter((t) => {
    const status = convertToV2Status(t);
    return status.substatus === "completed" || status.substatus === "archived";
  }).length;

  const actionRequiredCount = tasks.filter(
    (t) => t.actionRequired === true && t.status !== "completed"
  ).length;

  const reviewPendingCount = tasks.filter(
    (t) => t.reviewStatus === "pending" || t.reviewStatus === "in_review"
  ).length;

  // 提案カウント: closed/cancelled/archivedを除外
  const proposalCount = tasks.filter((t) => {
    if (t.category !== "skill_candidate" && t.category !== "improvement") {
      return false;
    }
    // V1ステータスでの除外
    if (t.status === "completed" || t.status === "cancelled") {
      return false;
    }
    // アーカイブ済みを除外
    if (t.archived === true) {
      return false;
    }
    // V2.1ステータスでの除外（mainStatus: closed）
    const { mainStatus } = convertToV2Status(t);
    if (mainStatus === "closed") {
      return false;
    }
    return true;
  }).length;

  const v2Stats: V2StatsData = {
    taskCount: goals.length,
    workCount: phases.length,
    stepCount: actions.length + investigations.length,
    completedCount,
    actionRequiredCount,
    reviewPendingCount,
    proposalCount,
  };

  return {
    v2Goals: paginatedV2Goals,
    v2ReviewQueue,
    v2Artifacts,
    v2Stats,
    totalGoals,
  };
}
