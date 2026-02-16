/**
 * DashboardWebSocketServer 単体テスト
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import http from "http";
import WebSocket from "ws";
import { DashboardWebSocketServer } from "../../websocket/dashboard-ws.js";

describe("DashboardWebSocketServer", () => {
  let server: http.Server;
  let wsServer: DashboardWebSocketServer;
  const TEST_PORT = 3199;

  beforeEach((done) => {
    server = http.createServer();
    wsServer = new DashboardWebSocketServer(server, {
      pingInterval: 1000, // テスト用に短縮
      pongTimeout: 500,
    });
    server.listen(TEST_PORT, done);
  });

  afterEach((done) => {
    wsServer.close();
    server.close(done);
  });

  it("projectパラメータ付きで接続できる", (done) => {
    const ws = new WebSocket(
      `ws://localhost:${TEST_PORT}/dashboard/ws?project=/test/path`
    );

    ws.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === "connected") {
        expect(event.sessionId).toBeDefined();
        ws.close();
        done();
      }
    });

    ws.on("error", (err) => {
      done(err);
    });
  });

  it("projectパラメータなしで接続すると切断される", (done) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/dashboard/ws`);

    ws.on("close", (code) => {
      expect(code).toBe(4001);
      done();
    });

    ws.on("error", () => {
      // エラーは無視（close イベントで処理）
    });
  });

  it("broadcastで特定プロジェクトにメッセージを送信できる", (done) => {
    const ws = new WebSocket(
      `ws://localhost:${TEST_PORT}/dashboard/ws?project=/test/path`
    );

    let connected = false;

    ws.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === "connected") {
        connected = true;
        // 少し待ってからブロードキャスト
        setTimeout(() => {
          wsServer.broadcast("/test/path", {
            type: "stats",
            data: {
              pendingCount: 5,
              workingCount: 2,
              masterWaitingCount: 1,
              completedTodayCount: 10,
              timestamp: new Date().toISOString(),
            },
          });
        }, 100);
      } else if (event.type === "stats" && connected) {
        expect(event.data.pendingCount).toBe(5);
        ws.close();
        done();
      }
    });

    ws.on("error", (err) => {
      done(err);
    });
  });

  it("異なるプロジェクトにはブロードキャストが届かない", (done) => {
    const ws = new WebSocket(
      `ws://localhost:${TEST_PORT}/dashboard/ws?project=/other/path`
    );

    let receivedStats = false;

    ws.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === "connected") {
        // 別プロジェクトにブロードキャスト
        wsServer.broadcast("/test/path", {
          type: "stats",
          data: {
            pendingCount: 5,
            workingCount: 2,
            masterWaitingCount: 1,
            completedTodayCount: 10,
            timestamp: new Date().toISOString(),
          },
        });
        // 少し待っても届かないことを確認
        setTimeout(() => {
          expect(receivedStats).toBe(false);
          ws.close();
          done();
        }, 200);
      } else if (event.type === "stats") {
        receivedStats = true;
      }
    });

    ws.on("error", (err) => {
      done(err);
    });
  });

  it("getClientCountで接続数を取得できる", (done) => {
    const ws = new WebSocket(
      `ws://localhost:${TEST_PORT}/dashboard/ws?project=/test/path`
    );

    ws.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === "connected") {
        expect(wsServer.getClientCount()).toBe(1);
        expect(wsServer.getClientCountByProject("/test/path")).toBe(1);
        expect(wsServer.getClientCountByProject("/other/path")).toBe(0);
        ws.close();
        done();
      }
    });

    ws.on("error", (err) => {
      done(err);
    });
  });

  it("切断後にクライアント数が減る", (done) => {
    const ws = new WebSocket(
      `ws://localhost:${TEST_PORT}/dashboard/ws?project=/test/path`
    );

    ws.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === "connected") {
        expect(wsServer.getClientCount()).toBe(1);
        ws.close();
      }
    });

    ws.on("close", () => {
      // 少し待ってから確認（切断処理の完了を待つ）
      setTimeout(() => {
        expect(wsServer.getClientCount()).toBe(0);
        done();
      }, 100);
    });

    ws.on("error", (err) => {
      done(err);
    });
  });
});
