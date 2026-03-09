/**
 * HTTP Client
 *
 * @maid-agent/api-client - REST API client
 */
import type { Task, DashboardResponse, TaskListResponse, CreateTaskRequest, CreateTaskResponse, ReportResponse, FilesListResponse, FileContentResponse, NotificationResponse, SendNotificationRequest, SendNotificationResponse, AgentResponsesResponse, AgentSessionsResponse } from "@maid-agent/types";
import { type DashboardOptions, type NotificationListOptions, type ResponsesListOptions } from "./endpoints.js";
/**
 * HTTPリクエストオプション
 */
export interface RequestOptions {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
}
/**
 * APIクライアント設定
 */
export interface ApiClientConfig {
    baseUrl: string;
    projectPath: string;
    timeout?: number;
}
/**
 * Maid Agent API クライアント
 *
 * HTTPによるREST API通信を行う
 */
export declare class MaidAgentClient {
    private baseUrl;
    private projectPath;
    private timeout;
    constructor(config: ApiClientConfig);
    /**
     * ベースURLを変更
     */
    setBaseUrl(url: string): void;
    /**
     * プロジェクトパスを変更
     */
    setProjectPath(path: string): void;
    /**
     * 現在のベースURLを取得
     */
    getBaseUrl(): string;
    /**
     * 現在のプロジェクトパスを取得
     */
    getProjectPath(): string;
    /**
     * HTTPリクエストを実行
     */
    request<T>(endpoint: string, options?: RequestOptions): Promise<T>;
    /**
     * エラーレスポンスを処理
     */
    private handleErrorResponse;
    get<T>(endpoint: string, options?: Omit<RequestOptions, "method">): Promise<T>;
    post<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
    patch<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
    put<T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
    delete<T>(endpoint: string, options?: Omit<RequestOptions, "method">): Promise<T>;
    /**
     * ダッシュボードデータを取得
     */
    getDashboard(options?: DashboardOptions): Promise<DashboardResponse>;
    /**
     * タスク一覧を取得
     */
    getTasks(): Promise<TaskListResponse>;
    /**
     * タスク詳細を取得
     */
    getTask(id: string): Promise<{
        task: Task;
    }>;
    /**
     * タスクを更新
     */
    updateTask(id: string, params: Partial<Task>): Promise<{
        success: boolean;
        task?: Task;
    }>;
    /**
     * タスクを作成
     */
    createTask(params: CreateTaskRequest): Promise<CreateTaskResponse>;
    /**
     * タスクをアーカイブ/アーカイブ解除
     */
    archiveTask(id: string, archived: boolean): Promise<{
        success: boolean;
        archived?: boolean;
    }>;
    /**
     * 報告書を取得
     */
    getReport(taskId: string): Promise<ReportResponse>;
    /**
     * ファイル一覧を取得
     */
    getFiles(path: string): Promise<FilesListResponse>;
    /**
     * ファイル内容を取得
     */
    getFileContent(path: string): Promise<FileContentResponse>;
    /**
     * ファイルのRAW URLを取得
     */
    getFileRawUrl(path: string): string;
    /**
     * 通知一覧を取得
     */
    getNotifications(options?: NotificationListOptions): Promise<NotificationResponse>;
    /**
     * 通知を送信
     */
    sendNotification(params: SendNotificationRequest): Promise<SendNotificationResponse>;
    /**
     * エージェント応答一覧を取得
     */
    getResponses(options: ResponsesListOptions): Promise<AgentResponsesResponse>;
    /**
     * エージェントセッション情報を取得
     */
    getSessions(): Promise<AgentSessionsResponse>;
}
//# sourceMappingURL=http-client.d.ts.map