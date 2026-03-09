/**
 * @maid-agent/api-client
 *
 * HTTP/WebSocket API client for Maid Agent System
 */
export { MaidAgentClient, type ApiClientConfig, type RequestOptions } from "./http-client.js";
export { DashboardWebSocket, NotificationWebSocket, type WebSocketClientConfig, type WSEventHandler, type ConnectionStateHandler, } from "./ws-client.js";
export { ENDPOINTS, buildWebSocketUrl, type DashboardOptions, type NotificationListOptions, type ResponsesListOptions, } from "./endpoints.js";
export { MaidAgentError, NetworkError, TimeoutError, HttpError, UnauthorizedError, NotFoundError, ServerError, ValidationError, } from "./errors.js";
//# sourceMappingURL=index.d.ts.map