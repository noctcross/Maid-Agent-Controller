import { describe, it, expect, beforeEach } from "@jest/globals";

describe("InMemoryEventStore", () => {
  let InMemoryEventStore: typeof import("../../middleware/event-store.js").InMemoryEventStore;
  let store: InstanceType<typeof InMemoryEventStore>;

  beforeEach(async () => {
    const mod = await import("../../middleware/event-store.js");
    InMemoryEventStore = mod.InMemoryEventStore;
    store = new InMemoryEventStore();
  });

  it("storeEvent でイベントを保存しイベントIDを返す", async () => {
    const eventId = await store.storeEvent("stream-1", {
      jsonrpc: "2.0",
      method: "test",
    });
    expect(eventId).toBe("1");
  });

  it("storeEvent で連番のイベントIDを返す", async () => {
    const id1 = await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "a" });
    const id2 = await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "b" });
    expect(id1).toBe("1");
    expect(id2).toBe("2");
  });

  it("getStreamIdForEventId でストリームIDを返す", async () => {
    const eventId = await store.storeEvent("stream-1", {
      jsonrpc: "2.0",
      method: "test",
    });
    const streamId = await store.getStreamIdForEventId(eventId);
    expect(streamId).toBe("stream-1");
  });

  it("getStreamIdForEventId で存在しないIDにundefinedを返す", async () => {
    const streamId = await store.getStreamIdForEventId("non-existent");
    expect(streamId).toBeUndefined();
  });

  it("replayEventsAfter で指定ID以降のイベントを再送する", async () => {
    await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "a" });
    const lastId = await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "b" });
    await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "c" });
    await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "d" });

    const replayed: Array<{ eventId: string; message: unknown }> = [];
    const streamId = await store.replayEventsAfter(lastId, {
      send: async (eventId, message) => {
        replayed.push({ eventId, message });
      },
    });

    expect(streamId).toBe("stream-1");
    expect(replayed).toHaveLength(2);
    expect((replayed[0].message as Record<string, unknown>).method).toBe("c");
    expect((replayed[1].message as Record<string, unknown>).method).toBe("d");
  });

  it("replayEventsAfter で未知のIDにエラーを投げる", async () => {
    await expect(
      store.replayEventsAfter("non-existent", {
        send: async () => {},
      }),
    ).rejects.toThrow("Unknown event ID: non-existent");
  });

  it("maxEventsPerStream を超えると古いイベントが削除される", async () => {
    const smallStore = new InMemoryEventStore(3);

    const id1 = await smallStore.storeEvent("s1", { jsonrpc: "2.0", method: "a" });
    await smallStore.storeEvent("s1", { jsonrpc: "2.0", method: "b" });
    await smallStore.storeEvent("s1", { jsonrpc: "2.0", method: "c" });
    // 4件目で最初のイベント(id1)が削除される
    await smallStore.storeEvent("s1", { jsonrpc: "2.0", method: "d" });

    // id1 は削除されているので undefined
    const streamId = await smallStore.getStreamIdForEventId(id1);
    expect(streamId).toBeUndefined();
  });

  it("cleanupStream でストリームのイベントが全削除される", async () => {
    await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "a" });
    const eventId = await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "b" });

    store.cleanupStream("stream-1");

    const streamId = await store.getStreamIdForEventId(eventId);
    expect(streamId).toBeUndefined();
    expect(store.stats.streamCount).toBe(0);
    expect(store.stats.totalEvents).toBe(0);
  });

  it("clear で全データが削除される", async () => {
    await store.storeEvent("stream-1", { jsonrpc: "2.0", method: "a" });
    await store.storeEvent("stream-2", { jsonrpc: "2.0", method: "b" });

    store.clear();

    expect(store.stats.streamCount).toBe(0);
    expect(store.stats.totalEvents).toBe(0);
  });
});
