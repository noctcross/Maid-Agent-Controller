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
export declare const ENDPOINTS: {
    readonly dashboard: {
        readonly data: (projectPath: string, options?: DashboardOptions) => string;
    };
    readonly tasks: {
        readonly list: (projectPath: string) => string;
        readonly detail: (id: string, projectPath: string) => string;
        readonly report: (id: string, projectPath: string) => string;
        readonly archive: (id: string, projectPath: string) => string;
        readonly create: "/api/tasks";
    };
    readonly files: {
        readonly list: (path: string, projectPath: string) => string;
        readonly content: (path: string, projectPath: string) => string;
        readonly raw: (path: string, projectPath: string) => string;
    };
    readonly notifications: {
        readonly list: (projectPath: string, options?: NotificationListOptions) => string;
        readonly send: (projectPath: string) => string;
    };
    readonly agents: {
        readonly status: "/api/agents/status";
        readonly sessions: (projectPath: string) => string;
    };
    readonly responses: {
        readonly list: (projectPath: string, options: ResponsesListOptions) => string;
    };
    readonly websocket: {
        readonly dashboard: "/dashboard/ws";
        readonly notifications: "/ws/notifications";
    };
};
/**
 * プロジェクトパス付きのWebSocket URLを生成
 */
export declare function buildWebSocketUrl(baseUrl: string, endpoint: string, projectPath: string): string;
//# sourceMappingURL=endpoints.d.ts.map