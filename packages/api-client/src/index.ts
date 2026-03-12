/**
 * @maid-agent/api-client
 *
 * HTTP/WebSocket API client for Maid Agent System
 */

// HTTP Client
export { MaidAgentClient, type ApiClientConfig, type RequestOptions } from "./http-client";

// WebSocket Clients
export {
  DashboardWebSocket,
  NotificationWebSocket,
  type WebSocketClientConfig,
  type WSEventHandler,
  type ConnectionStateHandler,
} from "./ws-client";

// Endpoints
export {
  ENDPOINTS,
  buildWebSocketUrl,
  type DashboardOptions,
  type DashboardDataOptions,
  type V2GoalsOptions,
  type CompletedTasksOptions,
  type NotificationListOptions,
  type ResponsesListOptions,
} from "./endpoints";

// Errors
export {
  MaidAgentError,
  NetworkError,
  TimeoutError,
  HttpError,
  UnauthorizedError,
  NotFoundError,
  ServerError,
  ValidationError,
} from "./errors";
