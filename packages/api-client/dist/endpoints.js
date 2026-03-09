/**
 * API Endpoints
 *
 * @maid-agent/api-client - Endpoint definitions
 */
/**
 * APIエンドポイント定義
 */
export const ENDPOINTS = {
    // ダッシュボード
    dashboard: {
        data: (projectPath, options) => {
            const params = new URLSearchParams({ project: projectPath });
            if (options?.statusFilter)
                params.set("statusFilter", options.statusFilter);
            if (options?.showArchived)
                params.set("showArchived", "true");
            if (options?.limit)
                params.set("limit", String(options.limit));
            if (options?.offset)
                params.set("offset", String(options.offset));
            if (options?.sortField)
                params.set("sortField", options.sortField);
            if (options?.sortOrder)
                params.set("sortOrder", options.sortOrder);
            if (options?.search)
                params.set("search", options.search);
            if (options?.priority)
                params.set("priority", options.priority);
            if (options?.assignee)
                params.set("assignee", options.assignee);
            if (options?.includeTeamStatus)
                params.set("includeTeamStatus", "true");
            return `/api/dashboard?${params.toString()}`;
        },
    },
    // タスク
    tasks: {
        list: (projectPath) => `/api/tasks?project=${encodeURIComponent(projectPath)}`,
        detail: (id, projectPath) => `/api/tasks/${id}?project=${encodeURIComponent(projectPath)}`,
        report: (id, projectPath) => `/api/tasks/${id}/report?project=${encodeURIComponent(projectPath)}`,
        archive: (id, projectPath) => `/dashboard/tasks/${id}/archive?project=${encodeURIComponent(projectPath)}`,
        create: "/api/tasks",
    },
    // ファイル
    files: {
        list: (path, projectPath) => `/api/files?path=${encodeURIComponent(path)}&project=${encodeURIComponent(projectPath)}`,
        content: (path, projectPath) => `/api/files/content?path=${encodeURIComponent(path)}&project=${encodeURIComponent(projectPath)}`,
        raw: (path, projectPath) => `/api/files/raw?path=${encodeURIComponent(path)}&project=${encodeURIComponent(projectPath)}`,
    },
    // 通知
    notifications: {
        list: (projectPath, options) => {
            const params = new URLSearchParams({ project: projectPath });
            if (options?.limit)
                params.set("limit", options.limit.toString());
            if (options?.before)
                params.set("before", options.before);
            if (options?.agent)
                params.set("agent", options.agent);
            return `/api/notifications?${params.toString()}`;
        },
        send: (projectPath) => `/api/notifications?project=${encodeURIComponent(projectPath)}`,
    },
    // エージェント
    agents: {
        status: "/api/agents/status",
        sessions: (projectPath) => `/api/agents/sessions?project=${encodeURIComponent(projectPath)}`,
    },
    // Claude Code応答
    responses: {
        list: (projectPath, options) => {
            const params = new URLSearchParams({
                project: projectPath,
                agent: options.agent,
            });
            if (options.limit)
                params.set("limit", options.limit.toString());
            return `/api/responses?${params.toString()}`;
        },
    },
    // WebSocket
    websocket: {
        dashboard: "/dashboard/ws",
        notifications: "/ws/notifications",
    },
};
/**
 * プロジェクトパス付きのWebSocket URLを生成
 */
export function buildWebSocketUrl(baseUrl, endpoint, projectPath) {
    // http:// -> ws://, https:// -> wss://
    const wsBase = baseUrl.replace(/^http/, "ws");
    const params = new URLSearchParams({ project: projectPath });
    return `${wsBase}${endpoint}?${params.toString()}`;
}
