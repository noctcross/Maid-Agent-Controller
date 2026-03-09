/**
 * @maid-agent/api-client
 *
 * HTTP/WebSocket API client for Maid Agent System
 */

// HTTP Client
export { MaidAgentClient, type ApiClientConfig, type RequestOptions } from "./http-client.js";

// WebSocket Clients
export {
  DashboardWebSocket,
  NotificationWebSocket,
  type WebSocketClientConfig,
  type WSEventHandler,
  type ConnectionStateHandler,
} from "./ws-client.js";

// Endpoints
export {
  ENDPOINTS,
  buildWebSocketUrl,
  type DashboardOptions,
  type NotificationListOptions,
  type ResponsesListOptions,
} from "./endpoints.js";

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
} from "./errors.js";
