/**
 * API Client Errors
 *
 * @maid-agent/api-client - Error handling
 */
import type { APIError } from "@maid-agent/types";
/**
 * API通信エラークラス
 */
export declare class MaidAgentError extends Error implements APIError {
    readonly code: string;
    readonly details?: unknown;
    constructor(code: string, message: string, details?: unknown);
    toJSON(): APIError;
}
/**
 * ネットワークエラー
 */
export declare class NetworkError extends MaidAgentError {
    constructor(message?: string);
}
/**
 * タイムアウトエラー
 */
export declare class TimeoutError extends MaidAgentError {
    constructor(message?: string);
}
/**
 * HTTPエラー
 */
export declare class HttpError extends MaidAgentError {
    readonly status: number;
    constructor(status: number, code: string, message: string, details?: unknown);
}
/**
 * 認証エラー
 */
export declare class UnauthorizedError extends HttpError {
    constructor(message?: string);
}
/**
 * 404エラー
 */
export declare class NotFoundError extends HttpError {
    constructor(message?: string);
}
/**
 * サーバーエラー
 */
export declare class ServerError extends HttpError {
    constructor(message?: string, status?: number);
}
/**
 * バリデーションエラー
 */
export declare class ValidationError extends MaidAgentError {
    constructor(message: string, details?: unknown);
}
//# sourceMappingURL=errors.d.ts.map