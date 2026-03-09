/**
 * API Client Errors
 *
 * @maid-agent/api-client - Error handling
 */

import type { APIError, ErrorCode } from "@maid-agent/types";

/**
 * API通信エラークラス
 */
export class MaidAgentError extends Error implements APIError {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "MaidAgentError";
    this.code = code;
    this.details = details;
  }

  toJSON(): APIError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * ネットワークエラー
 */
export class NetworkError extends MaidAgentError {
  constructor(message = "Network error") {
    super("NETWORK_ERROR", message);
    this.name = "NetworkError";
  }
}

/**
 * タイムアウトエラー
 */
export class TimeoutError extends MaidAgentError {
  constructor(message = "Request timeout") {
    super("TIMEOUT", message);
    this.name = "TimeoutError";
  }
}

/**
 * HTTPエラー
 */
export class HttpError extends MaidAgentError {
  readonly status: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(code, message, details);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * 認証エラー
 */
export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}

/**
 * 404エラー
 */
export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

/**
 * サーバーエラー
 */
export class ServerError extends HttpError {
  constructor(message = "Server error", status = 500) {
    super(status, "SERVER_ERROR", message);
    this.name = "ServerError";
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends MaidAgentError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}
