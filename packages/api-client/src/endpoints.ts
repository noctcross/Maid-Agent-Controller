/**
 * API Endpoints
 *
 * @maid-agent/api-client - Endpoint definitions
 */

/**
 * ダッシュボードAPIオプション
 */
export interface DashboardOptions {
  statusFilter?: "open" | "closed" | "all";
  showArchived?: boolean;
  limit?: number;
  offset?: number;
  sortField?: "id" | "updatedAt";
  sortOrder?: "asc" | "desc";
  search?: string;
  priority?: "high" | "medium" | "low";
  assignee?: string;
  includeTeamStatus?: boolean;
}

/**
 * ダッシュボードデータ取得オプション
 */
export interface DashboardDataOptions {
  completedLimit?: number;
  completedOffset?: number;
  completedHash?: string;
  completedSortField?: string;
}

/**
 * V2 ゴール取得オプション
 */
export interface V2GoalsOptions {
  status: "open" | "closed";
  archived?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * 完了タスク取得オプション
 */
export interface CompletedTasksOptions {
  offset?: number;
  limit?: number;
  completedSortField?: string;
}

/**
 * 通知一覧オプション
 */
export interface NotificationListOptions {
  limit?: number;
  before?: string;
  agent?: string;
}

/**
 * 応答一覧オプション
 */
export interface ResponsesListOptions {
  agent: string;
  limit?: number;
}

/**
 * APIエンドポイント定義
 */
export const ENDPOINTS = {
  // ダッシュボード
  dashboard: {
    /** ダッシュボードJSON API */
    data: (projectPath: string, options?: DashboardOptions): string => {
      const params = new URLSearchParams({ project: projectPath });
      if (options?.statusFilter) params.set("statusFilter", options.statusFilter);
      if (options?.showArchived) params.set("showArchived", "true");
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.sortField) params.set("sortField", options.sortField);
      if (options?.sortOrder) params.set("sortOrder", options.sortOrder);
      if (options?.search) params.set("search", options.search);
      if (options?.priority) params.set("priority", options.priority);
      if (options?.assignee) params.set("assignee", options.assignee);
      if (options?.includeTeamStatus) params.set("includeTeamStatus", "true");
      return `/api/dashboard?${params.toString()}`;
    },
    /** 旧ダッシュボードデータ API（IDE統合用） */
    legacyData: (projectPath: string, options?: DashboardDataOptions): string => {
      const params = new URLSearchParams({ project: projectPath });
      if (options?.completedLimit) params.set("completedLimit", String(options.completedLimit));
      if (options?.completedOffset) params.set("completedOffset", String(options.completedOffset));
      if (options?.completedHash) params.set("completedHash", options.completedHash);
      if (options?.completedSortField) params.set("completedSortField", options.completedSortField);
      return `/dashboard/data?${params.toString()}`;
    },
    /** SPA版HTML取得 */
    spa: (projectPath: string): string =>
      `/dashboard?project=${encodeURIComponent(projectPath)}`,
    /** V2 ゴール取得 */
    v2Goals: (projectPath: string, options: V2GoalsOptions): string => {
      const params = new URLSearchParams({ project: projectPath, status: options.status });
      if (options.archived !== undefined) params.set("archived", String(options.archived));
      if (options.limit) params.set("limit", String(options.limit));
      if (options.offset) params.set("offset", String(options.offset));
      return `/dashboard/v2/goals?${params.toString()}`;
    },
    /** 完了タスク一覧（ページネーション） */
    completed: (projectPath: string, options?: CompletedTasksOptions): string => {
      const params = new URLSearchParams({ project: projectPath });
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.completedSortField) params.set("completedSortField", options.completedSortField);
      return `/dashboard/completed?${params.toString()}`;
    },
  },

  // タスク
  tasks: {
    list: (projectPath: string): string =>
      `/api/tasks?project=${encodeURIComponent(projectPath)}`,
    detail: (id: string, projectPath: string): string =>
      `/api/tasks/${id}?project=${encodeURIComponent(projectPath)}`,
    report: (id: string, projectPath: string): string =>
      `/api/tasks/${id}/report?project=${encodeURIComponent(projectPath)}`,
    archive: (id: string, projectPath: string): string =>
      `/dashboard/tasks/${id}/archive?project=${encodeURIComponent(projectPath)}`,
    create: "/api/tasks",
  },

  // ファイル
  files: {
    list: (path: string, projectPath: string): string =>
      `/api/files?path=${encodeURIComponent(path)}&project=${encodeURIComponent(projectPath)}`,
    content: (path: string, projectPath: string): string =>
      `/api/files/content?path=${encodeURIComponent(path)}&project=${encodeURIComponent(projectPath)}`,
    raw: (path: string, projectPath: string): string =>
      `/api/files/raw?path=${encodeURIComponent(path)}&project=${encodeURIComponent(projectPath)}`,
    /** ファイルビュー（レンダリング済みHTML取得） */
    view: (path: string, projectPath: string): string =>
      `/file?path=${encodeURIComponent(path)}&project=${encodeURIComponent(projectPath)}`,
  },

  // 通知
  notifications: {
    list: (projectPath: string, options?: NotificationListOptions): string => {
      const params = new URLSearchParams({ project: projectPath });
      if (options?.limit) params.set("limit", options.limit.toString());
      if (options?.before) params.set("before", options.before);
      if (options?.agent) params.set("agent", options.agent);
      return `/api/notifications?${params.toString()}`;
    },
    send: (projectPath: string): string =>
      `/api/notifications?project=${encodeURIComponent(projectPath)}`,
  },

  // エージェント
  agents: {
    status: "/api/agents/status",
    sessions: (projectPath: string): string =>
      `/api/agents/sessions?project=${encodeURIComponent(projectPath)}`,
  },

  // Claude Code応答
  responses: {
    list: (projectPath: string, options: ResponsesListOptions): string => {
      const params = new URLSearchParams({
        project: projectPath,
        agent: options.agent,
      });
      if (options.limit) params.set("limit", options.limit.toString());
      return `/api/responses?${params.toString()}`;
    },
  },

  // WebSocket
  websocket: {
    dashboard: "/dashboard/ws",
    notifications: "/ws/notifications",
  },
} as const;

/**
 * プロジェクトパス付きのWebSocket URLを生成
 */
export function buildWebSocketUrl(
  baseUrl: string,
  endpoint: string,
  projectPath: string
): string {
  // http:// -> ws://, https:// -> wss://
  const wsBase = baseUrl.replace(/^http/, "ws");
  const params = new URLSearchParams({ project: projectPath });
  return `${wsBase}${endpoint}?${params.toString()}`;
}
