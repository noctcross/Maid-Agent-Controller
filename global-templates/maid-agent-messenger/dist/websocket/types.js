/**
 * WebSocket イベント型定義
 */
import { TIMEOUTS } from "../utils/constants.js";
export const DEFAULT_WS_CONFIG = {
    pingInterval: TIMEOUTS.PING_INTERVAL,
    pongTimeout: 10000,
    maxClients: 100,
};
