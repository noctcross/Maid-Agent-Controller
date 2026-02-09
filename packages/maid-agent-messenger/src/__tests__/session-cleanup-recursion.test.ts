/**
 * セッションクリーンアップ - 無限再帰防止テスト
 * transport.onclose → server.close() → transport.close() → onclose の循環を防止する
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

describe("Session Cleanup - 無限再帰防止", () => {
  it("transport.onclose内のserver.close()で無限再帰が発生しないこと", async () => {
    // server.close()がtransport.close()を呼ぶ→oncloseが再発火する状況をシミュレート
    const sessions = new Map<string, { server: { close: () => Promise<void> } }>();
    let oncloseCallCount = 0;

    const sessionId = "test-session-1";
    const mockTransport = {
      onclose: null as (() => Promise<void>) | null,
      close: async () => {
        if (mockTransport.onclose) {
          await mockTransport.onclose();
        }
      },
    };

    const mockServer = {
      close: async () => {
        // SDK内部の挙動をシミュレート: server.close() → transport.close()
        await mockTransport.close();
      },
    };

    sessions.set(sessionId, { server: mockServer });

    // 修正後のoncloseハンドラ（sessions.delete()を先に実行して再帰防止）
    mockTransport.onclose = async () => {
      oncloseCallCount++;
      const closingSession = sessions.get(sessionId);
      if (!closingSession) return; // 再帰防止ガード

      sessions.delete(sessionId);

      try {
        await closingSession.server.close();
      } catch (e) {
        // エラーハンドリング
      }
    };

    // oncloseを発火
    await mockTransport.onclose();

    // 2回呼ばれるが（初回 + server.close()経由の再帰1回）、無限ループにはならない
    expect(oncloseCallCount).toBe(2);
    expect(sessions.has(sessionId)).toBe(false);
  });

  it("sessions.delete()前にserver.close()を呼ぶと無限再帰が発生すること（修正前の挙動確認）", async () => {
    const sessions = new Map<string, { server: { close: () => Promise<void> } }>();
    let oncloseCallCount = 0;
    const MAX_CALLS = 100; // 安全弁

    const sessionId = "test-session-2";
    const mockTransport = {
      onclose: null as (() => Promise<void>) | null,
      close: async () => {
        if (mockTransport.onclose) {
          await mockTransport.onclose();
        }
      },
    };

    const mockServer = {
      close: async () => {
        await mockTransport.close();
      },
    };

    sessions.set(sessionId, { server: mockServer });

    // 修正前のoncloseハンドラ（sessions.deleteが後 → 無限再帰）
    mockTransport.onclose = async () => {
      oncloseCallCount++;
      if (oncloseCallCount > MAX_CALLS) {
        throw new RangeError("Maximum call stack size exceeded (simulated)");
      }
      const closingSession = sessions.get(sessionId);
      if (closingSession) {
        try {
          await closingSession.server.close(); // ← ここで再帰
        } catch (e) {
          // スタックオーバーフローをキャッチ
        }
        sessions.delete(sessionId); // ← ここに到達しない
      }
    };

    await mockTransport.onclose();

    // 安全弁（MAX_CALLS）に到達することを確認
    expect(oncloseCallCount).toBeGreaterThan(MAX_CALLS);
  });

  it("DELETE /mcp相当: sessions.delete()を先に実行すれば再帰が防止されること", async () => {
    const sessions = new Map<string, { server: { close: () => Promise<void> }; transport: { close: () => Promise<void>; onclose: (() => Promise<void>) | null } }>();
    let oncloseCallCount = 0;

    const sessionId = "delete-test";
    const mockTransport = {
      onclose: null as (() => Promise<void>) | null,
      close: async () => {
        if (mockTransport.onclose) {
          await mockTransport.onclose();
        }
      },
    };

    const mockServer = {
      close: async () => {
        await mockTransport.close();
      },
    };

    sessions.set(sessionId, { server: mockServer, transport: mockTransport });

    // oncloseハンドラ（POST /mcpで設定されるもの）
    mockTransport.onclose = async () => {
      oncloseCallCount++;
      const closingSession = sessions.get(sessionId);
      if (!closingSession) return;
      sessions.delete(sessionId);
      await closingSession.server.close();
    };

    // DELETE /mcp の処理をシミュレート
    const session = sessions.get(sessionId)!;
    sessions.delete(sessionId); // 先に削除
    await session.server.close(); // oncloseは発火するがガードでreturn

    expect(oncloseCallCount).toBe(1); // oncloseは1回発火するが即return
    expect(sessions.has(sessionId)).toBe(false);
  });
});
