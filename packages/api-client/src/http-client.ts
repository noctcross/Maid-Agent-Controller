/**
 * HTTP Client
 *
 * @maid-agent/api-client - REST API client
 */

import type {
  Task,
  DashboardResponse,
  TaskListResponse,
  CreateTaskRequest,
  CreateTaskResponse,
  ReportResponse,
  FilesListResponse,
  FileContentResponse,
  NotificationResponse,
  SendNotificationRequest,
  SendNotificationResponse,
  AgentResponsesResponse,
  AgentSessionsResponse,
} from "@maid-agent/types";
import {
  MaidAgentError,
  NetworkError,
  TimeoutError,
  HttpError,
  UnauthorizedError,
  NotFoundError,
  ServerError,
} from "./errors.js";
import {
  ENDPOINTS,
  type DashboardOptions,
  type NotificationListOptions,
  type ResponsesListOptions,
} from "./endpoints.js";

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
 * デフォルトタイムアウト（ミリ秒）
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Maid Agent API クライアント
 *
 * HTTPによるREST API通信を行う
 */
export class MaidAgentClient {
  private baseUrl: string;
  private projectPath: string;
  private timeout: number;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.projectPath = config.projectPath;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * ベースURLを変更
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * プロジェクトパスを変更
   */
  setProjectPath(path: string): void {
    this.projectPath = path;
  }

  /**
   * 現在のベースURLを取得
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * 現在のプロジェクトパスを取得
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * HTTPリクエストを実行
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = "GET",
      body,
      headers = {},
      timeout = this.timeout,
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Maid-Project-Path": this.projectPath,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof MaidAgentError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new TimeoutError();
        }
        if (error.message.includes("fetch") || error.message.includes("network")) {
          throw new NetworkError(error.message);
        }
      }

      throw error;
    }
  }

  /**
   * エラーレスポンスを処理
   */
  private async handleErrorResponse(response: Response): Promise<HttpError> {
    const status = response.status;

    if (status === 401) {
      return new UnauthorizedError();
    }
    if (status === 404) {
      return new NotFoundError();
    }
    if (status >= 500) {
      return new ServerError(`Server error: ${status}`, status);
    }

    try {
      const errorData = await response.json();
      return new HttpError(
        status,
        errorData.code || "UNKNOWN_ERROR",
        errorData.message || `HTTP ${status}`,
        errorData.details
      );
    } catch {
      return new HttpError(status, "UNKNOWN_ERROR", `HTTP ${status}`);
    }
  }

  // ========================================
  // Convenience methods
  // ========================================

  get<T>(endpoint: string, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  post<T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "POST", body });
  }

  patch<T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PATCH", body });
  }

  put<T>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PUT", body });
  }

  delete<T>(endpoint: string, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }

  // ========================================
  // Dashboard API
  // ========================================

  /**
   * ダッシュボードデータを取得
   */
  getDashboard(options?: DashboardOptions): Promise<DashboardResponse> {
    const endpoint = ENDPOINTS.dashboard.data(this.projectPath, options);
    return this.get<DashboardResponse>(endpoint);
  }

  // ========================================
  // Tasks API
  // ========================================

  /**
   * タスク一覧を取得
   */
  getTasks(): Promise<TaskListResponse> {
    const endpoint = ENDPOINTS.tasks.list(this.projectPath);
    return this.get<TaskListResponse>(endpoint);
  }

  /**
   * タスク詳細を取得
   */
  getTask(id: string): Promise<{ task: Task }> {
    const endpoint = ENDPOINTS.tasks.detail(id, this.projectPath);
    return this.get<{ task: Task }>(endpoint);
  }

  /**
   * タスクを更新
   */
  updateTask(id: string, params: Partial<Task>): Promise<{ success: boolean; task?: Task }> {
    const endpoint = ENDPOINTS.tasks.detail(id, this.projectPath);
    return this.patch<{ success: boolean; task?: Task }>(endpoint, params);
  }

  /**
   * タスクを作成
   */
  createTask(params: CreateTaskRequest): Promise<CreateTaskResponse> {
    return this.post<CreateTaskResponse>(ENDPOINTS.tasks.create, params);
  }

  /**
   * タスクをアーカイブ/アーカイブ解除
   */
  archiveTask(id: string, archived: boolean): Promise<{ success: boolean; archived?: boolean }> {
    const endpoint = ENDPOINTS.tasks.archive(id, this.projectPath);
    return this.patch<{ success: boolean; archived?: boolean }>(endpoint, { archived });
  }

  // ========================================
  // Report API
  // ========================================

  /**
   * 報告書を取得
   */
  getReport(taskId: string): Promise<ReportResponse> {
    const endpoint = ENDPOINTS.tasks.report(taskId, this.projectPath);
    return this.get<ReportResponse>(endpoint);
  }

  // ========================================
  // Files API
  // ========================================

  /**
   * ファイル一覧を取得
   */
  getFiles(path: string): Promise<FilesListResponse> {
    const endpoint = ENDPOINTS.files.list(path, this.projectPath);
    return this.get<FilesListResponse>(endpoint);
  }

  /**
   * ファイル内容を取得
   */
  getFileContent(path: string): Promise<FileContentResponse> {
    const endpoint = ENDPOINTS.files.content(path, this.projectPath);
    return this.get<FileContentResponse>(endpoint);
  }

  /**
   * ファイルのRAW URLを取得
   */
  getFileRawUrl(path: string): string {
    return `${this.baseUrl}${ENDPOINTS.files.raw(path, this.projectPath)}`;
  }

  // ========================================
  // Notifications API
  // ========================================

  /**
   * 通知一覧を取得
   */
  getNotifications(options?: NotificationListOptions): Promise<NotificationResponse> {
    const endpoint = ENDPOINTS.notifications.list(this.projectPath, options);
    return this.get<NotificationResponse>(endpoint);
  }

  /**
   * 通知を送信
   */
  sendNotification(params: SendNotificationRequest): Promise<SendNotificationResponse> {
    const endpoint = ENDPOINTS.notifications.send(this.projectPath);
    return this.post<SendNotificationResponse>(endpoint, params);
  }

  // ========================================
  // Responses API
  // ========================================

  /**
   * エージェント応答一覧を取得
   */
  getResponses(options: ResponsesListOptions): Promise<AgentResponsesResponse> {
    const endpoint = ENDPOINTS.responses.list(this.projectPath, options);
    return this.get<AgentResponsesResponse>(endpoint);
  }

  /**
   * エージェントセッション情報を取得
   */
  getSessions(): Promise<AgentSessionsResponse> {
    const endpoint = ENDPOINTS.agents.sessions(this.projectPath);
    return this.get<AgentSessionsResponse>(endpoint);
  }
}
