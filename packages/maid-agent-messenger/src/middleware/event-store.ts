/**
 * インメモリ EventStore 実装
 * SSEストリームの再開可能性（resumability）を提供する。
 * クライアントが Last-Event-ID ヘッダーを送信した場合、
 * 切断中に送信されたイベントを再送できる。
 */

import type {
  EventStore,
  EventId,
  StreamId,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

interface StoredEvent {
  eventId: EventId;
  message: JSONRPCMessage;
}

const DEFAULT_MAX_EVENTS_PER_STREAM = 500;

export class InMemoryEventStore implements EventStore {
  private streams: Map<StreamId, StoredEvent[]> = new Map();
  private eventToStream: Map<EventId, StreamId> = new Map();
  private counter = 0;
  private readonly maxEventsPerStream: number;

  constructor(maxEventsPerStream: number = DEFAULT_MAX_EVENTS_PER_STREAM) {
    this.maxEventsPerStream = maxEventsPerStream;
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = String(++this.counter);

    if (!this.streams.has(streamId)) {
      this.streams.set(streamId, []);
    }
    const streamEvents = this.streams.get(streamId)!;
    streamEvents.push({ eventId, message });
    this.eventToStream.set(eventId, streamId);

    // メモリ制限: 古いイベントを削除
    if (streamEvents.length > this.maxEventsPerStream) {
      const removed = streamEvents.shift()!;
      this.eventToStream.delete(removed.eventId);
    }

    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.eventToStream.get(eventId);
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    const streamId = this.eventToStream.get(lastEventId);
    if (!streamId) {
      throw new Error(`Unknown event ID: ${lastEventId}`);
    }

    const streamEvents = this.streams.get(streamId) || [];
    const idx = streamEvents.findIndex((e) => e.eventId === lastEventId);

    for (let i = idx + 1; i < streamEvents.length; i++) {
      await send(streamEvents[i].eventId, streamEvents[i].message);
    }

    return streamId;
  }

  /**
   * ストリームのイベントを削除（セッション終了時のクリーンアップ用）
   */
  cleanupStream(streamId: StreamId): void {
    const events = this.streams.get(streamId);
    if (events) {
      for (const e of events) {
        this.eventToStream.delete(e.eventId);
      }
      this.streams.delete(streamId);
    }
  }

  /**
   * 全イベントを削除（テスト用）
   */
  clear(): void {
    this.streams.clear();
    this.eventToStream.clear();
    this.counter = 0;
  }

  /**
   * 現在の統計（デバッグ用）
   */
  get stats(): { streamCount: number; totalEvents: number } {
    let totalEvents = 0;
    for (const events of this.streams.values()) {
      totalEvents += events.length;
    }
    return { streamCount: this.streams.size, totalEvents };
  }
}
