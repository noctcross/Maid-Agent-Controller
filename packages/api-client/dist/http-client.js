/**
 * HTTP Client
 *
 * @maid-agent/api-client - REST API client
 */
import { MaidAgentError, NetworkError, TimeoutError, HttpError, UnauthorizedError, NotFoundError, ServerError, } from "./errors.js";
import { ENDPOINTS, } from "./endpoints.js";
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
    baseUrl;
    projectPath;
    timeout;
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.projectPath = config.projectPath;
        this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    }
    /**
     * ベースURLを変更
     */
    setBaseUrl(url) {
        this.baseUrl = url;
    }
    /**
     * プロジェクトパスを変更
     */
    setProjectPath(path) {
        this.projectPath = path;
    }
    /**
     * 現在のベースURLを取得
     */
    getBaseUrl() {
        return this.baseUrl;
    }
    /**
     * 現在のプロジェクトパスを取得
     */
    getProjectPath() {
        return this.projectPath;
    }
    /**
     * HTTPリクエストを実行
     */
    async request(endpoint, options = {}) {
        const { method = "GET", body, headers = {}, timeout = this.timeout, } = options;
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
        }
        catch (error) {
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
    async handleErrorResponse(response) {
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
            return new HttpError(status, errorData.code || "UNKNOWN_ERROR", errorData.message || `HTTP ${status}`, errorData.details);
        }
        catch {
            return new HttpError(status, "UNKNOWN_ERROR", `HTTP ${status}`);
        }
    }
    // ========================================
    // Convenience methods
    // ========================================
    get(endpoint, options) {
        return this.request(endpoint, { ...options, method: "GET" });
    }
    post(endpoint, body, options) {
        return this.request(endpoint, { ...options, method: "POST", body });
    }
    patch(endpoint, body, options) {
        return this.request(endpoint, { ...options, method: "PATCH", body });
    }
    put(endpoint, body, options) {
        return this.request(endpoint, { ...options, method: "PUT", body });
    }
    delete(endpoint, options) {
        return this.request(endpoint, { ...options, method: "DELETE" });
    }
    // ========================================
    // Dashboard API
    // ========================================
    /**
     * ダッシュボードデータを取得
     */
    getDashboard(options) {
        const endpoint = ENDPOINTS.dashboard.data(this.projectPath, options);
        return this.get(endpoint);
    }
    // ========================================
    // Tasks API
    // ========================================
    /**
     * タスク一覧を取得
     */
    getTasks() {
        const endpoint = ENDPOINTS.tasks.list(this.projectPath);
        return this.get(endpoint);
    }
    /**
     * タスク詳細を取得
     */
    getTask(id) {
        const endpoint = ENDPOINTS.tasks.detail(id, this.projectPath);
        return this.get(endpoint);
    }
    /**
     * タスクを更新
     */
    updateTask(id, params) {
        const endpoint = ENDPOINTS.tasks.detail(id, this.projectPath);
        return this.patch(endpoint, params);
    }
    /**
     * タスクを作成
     */
    createTask(params) {
        return this.post(ENDPOINTS.tasks.create, params);
    }
    /**
     * タスクをアーカイブ/アーカイブ解除
     */
    archiveTask(id, archived) {
        const endpoint = ENDPOINTS.tasks.archive(id, this.projectPath);
        return this.patch(endpoint, { archived });
    }
    // ========================================
    // Report API
    // ========================================
    /**
     * 報告書を取得
     */
    getReport(taskId) {
        const endpoint = ENDPOINTS.tasks.report(taskId, this.projectPath);
        return this.get(endpoint);
    }
    // ========================================
    // Files API
    // ========================================
    /**
     * ファイル一覧を取得
     */
    getFiles(path) {
        const endpoint = ENDPOINTS.files.list(path, this.projectPath);
        return this.get(endpoint);
    }
    /**
     * ファイル内容を取得
     */
    getFileContent(path) {
        const endpoint = ENDPOINTS.files.content(path, this.projectPath);
        return this.get(endpoint);
    }
    /**
     * ファイルのRAW URLを取得
     */
    getFileRawUrl(path) {
        return `${this.baseUrl}${ENDPOINTS.files.raw(path, this.projectPath)}`;
    }
    // ========================================
    // Notifications API
    // ========================================
    /**
     * 通知一覧を取得
     */
    getNotifications(options) {
        const endpoint = ENDPOINTS.notifications.list(this.projectPath, options);
        return this.get(endpoint);
    }
    /**
     * 通知を送信
     */
    sendNotification(params) {
        const endpoint = ENDPOINTS.notifications.send(this.projectPath);
        return this.post(endpoint, params);
    }
    // ========================================
    // Responses API
    // ========================================
    /**
     * エージェント応答一覧を取得
     */
    getResponses(options) {
        const endpoint = ENDPOINTS.responses.list(this.projectPath, options);
        return this.get(endpoint);
    }
    /**
     * エージェントセッション情報を取得
     */
    getSessions() {
        const endpoint = ENDPOINTS.agents.sessions(this.projectPath);
        return this.get(endpoint);
    }
}
