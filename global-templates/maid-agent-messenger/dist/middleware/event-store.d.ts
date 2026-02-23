/**
 * インメモリ EventStore 実装
 * SSEストリームの再開可能性（resumability）を提供する。
 * クライアントが Last-Event-ID ヘッダーを送信した場合、
 * 切断中に送信されたイベントを再送できる。
 */
import type { EventStore, EventId, StreamId } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
export declare class InMemoryEventStore implements EventStore {
    private streams;
    private eventToStream;
    private counter;
    private readonly maxEventsPerStream;
    constructor(maxEventsPerStream?: number);
    storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId>;
    getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined>;
    replayEventsAfter(lastEventId: EventId, { send }: {
        send: (eventId: EventId, message: JSONRPCMessage) => Promise<void>;
    }): Promise<StreamId>;
    /**
     * ストリームのイベントを削除（セッション終了時のクリーンアップ用）
     */
    cleanupStream(streamId: StreamId): void;
    /**
     * 全イベントを削除（テスト用）
     */
    clear(): void;
    /**
     * 現在の統計（デバッグ用）
     */
    get stats(): {
        streamCount: number;
        totalEvents: number;
    };
}
