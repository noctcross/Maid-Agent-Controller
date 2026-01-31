/**
 * Connection Manager
 *
 * ハイブリッド方式の接続管理
 * - 中央サーバー（HTTP）への接続を優先
 * - 失敗時はローカルサーバー（STDIO）にフォールバック
 * - 中央サーバー復旧時は自動的に切り替え
 */
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
/**
 * HTTP経由でツールを呼び出す
 */
async function callToolViaHttp(baseUrl, toolName, params, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(`${baseUrl}/tools/${toolName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
            signal: controller.signal,
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }
        return await response.json();
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * ヘルスチェック
 */
async function checkHealth(baseUrl, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(`${baseUrl}/health`, {
            signal: controller.signal,
        });
        return response.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export class ConnectionManager {
    config = null;
    mode = "disconnected";
    baseUrl = "";
    localServer = null;
    reconnectTimer = null;
    /**
     * 初期化と接続
     */
    async connect() {
        this.config = await loadConfig();
        this.baseUrl = getServerUrl(this.config);
        // モードに応じて接続
        switch (this.config.server.mode) {
            case "central":
                return this.connectToCentral();
            case "local":
                return this.startLocalServer();
            case "hybrid":
            default:
                return this.connectHybrid();
        }
    }
    /**
     * ハイブリッド接続（中央優先、フォールバックあり）
     */
    async connectHybrid() {
        // 中央サーバーに接続試行
        const isHealthy = await checkHealth(this.baseUrl, this.config.central.connection_timeout);
        if (isHealthy) {
            this.mode = "central";
            console.log(`Connected to central server: ${this.baseUrl}`);
            return this.getStatus();
        }
        // フォールバックが無効なら失敗
        if (!this.config.fallback.enabled) {
            this.mode = "disconnected";
            return {
                mode: "disconnected",
                lastCheck: new Date().toISOString(),
                error: "Central server unavailable and fallback disabled",
            };
        }
        // ローカルサーバーを起動
        console.log("Central server unavailable, starting local server...");
        const status = await this.startLocalServer();
        // 自動復旧が有効なら再接続をスケジュール
        if (this.config.fallback.auto_recover) {
            this.scheduleReconnect();
        }
        return status;
    }
    /**
     * 中央サーバーに接続
     */
    async connectToCentral() {
        const isHealthy = await checkHealth(this.baseUrl, this.config.central.connection_timeout);
        if (isHealthy) {
            this.mode = "central";
            return this.getStatus();
        }
        this.mode = "disconnected";
        return {
            mode: "disconnected",
            lastCheck: new Date().toISOString(),
            error: "Central server unavailable",
        };
    }
    /**
     * ローカルサーバーを起動
     */
    async startLocalServer() {
        // 既存のローカルサーバーがあれば停止
        if (this.localServer) {
            this.localServer.kill();
            this.localServer = null;
        }
        try {
            // STDIOモードでローカルサーバーを起動
            // 注: 実際にはClaude CodeがSTDIOで起動するため、ここでは起動しない
            // この関数はモードの切り替えを行う
            this.mode = "local";
            console.log("Switched to local STDIO mode");
            return this.getStatus();
        }
        catch (error) {
            this.mode = "disconnected";
            const message = error instanceof Error ? error.message : "Unknown error";
            return {
                mode: "disconnected",
                lastCheck: new Date().toISOString(),
                error: `Failed to start local server: ${message}`,
            };
        }
    }
    /**
     * 再接続をスケジュール
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
        }
        const interval = this.config.central.reconnect_interval;
        this.reconnectTimer = setInterval(async () => {
            if (this.mode !== "local") {
                return;
            }
            console.log("Attempting to reconnect to central server...");
            const isHealthy = await checkHealth(this.baseUrl, this.config.central.connection_timeout);
            if (isHealthy) {
                this.mode = "central";
                console.log("Reconnected to central server");
                // ローカルサーバーを停止
                if (this.localServer) {
                    this.localServer.kill();
                    this.localServer = null;
                }
                // 再接続タイマーを停止
                if (this.reconnectTimer) {
                    clearInterval(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
            }
        }, interval);
    }
    /**
     * ツールを呼び出す
     */
    async callTool(toolName, params) {
        if (this.mode === "disconnected") {
            throw new Error("Not connected to any server");
        }
        if (this.mode === "central") {
            return callToolViaHttp(this.baseUrl, toolName, params, this.config.central.connection_timeout);
        }
        // ローカルモードの場合はエラー
        // 注: ローカルモードではClaude CodeがSTDIOで直接通信する
        throw new Error("Local mode requires STDIO communication");
    }
    /**
     * 接続ステータスを取得
     */
    getStatus() {
        return {
            mode: this.mode,
            url: this.mode === "central" ? this.baseUrl : undefined,
            lastCheck: new Date().toISOString(),
        };
    }
    /**
     * 現在のモードを取得
     */
    getMode() {
        return this.mode;
    }
    /**
     * 切断
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.localServer) {
            this.localServer.kill();
            this.localServer = null;
        }
        this.mode = "disconnected";
    }
}
// シングルトンインスタンス
export const connectionManager = new ConnectionManager();
