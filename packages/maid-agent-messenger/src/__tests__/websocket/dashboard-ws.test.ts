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

  // Phase6: エスカレーション通知テスト
  describe("Escalation Notification", () => {
    it("broadcastEscalationでエスカレーション通知を送信できる", (done) => {
      const ws = new WebSocket(
        `ws://localhost:${TEST_PORT}/dashboard/ws?project=/test/path`
      );

      let connected = false;

      ws.on("message", (data) => {
        const event = JSON.parse(data.toString());
        if (event.type === "connected") {
          connected = true;
          // 少し待ってからエスカレーション通知を送信
          setTimeout(() => {
            wsServer.broadcastEscalation("/test/path", {
              taskId: "task-123",
              title: "緊急: APIエラー発生",
              severity: "high",
              agentId: "emma",
              message: "外部API連携でタイムアウトが発生しています",
              timestamp: new Date().toISOString(),
            });
          }, 100);
        } else if (event.type === "escalation" && connected) {
          expect(event.data.taskId).toBe("task-123");
          expect(event.data.title).toBe("緊急: APIエラー発生");
          expect(event.data.severity).toBe("high");
          expect(event.data.agentId).toBe("emma");
          expect(event.data.message).toBe("外部API連携でタイムアウトが発生しています");
          ws.close();
          done();
        }
      });

      ws.on("error", (err) => {
        done(err);
      });
    });

    it("異なるプロジェクトにはエスカレーション通知が届かない", (done) => {
      const ws = new WebSocket(
        `ws://localhost:${TEST_PORT}/dashboard/ws?project=/other/path`
      );

      let receivedEscalation = false;

      ws.on("message", (data) => {
        const event = JSON.parse(data.toString());
        if (event.type === "connected") {
          // 別プロジェクトにエスカレーション通知
          wsServer.broadcastEscalation("/test/path", {
            taskId: "task-456",
            title: "テスト通知",
            severity: "medium",
            agentId: "lily",
            message: "テストメッセージ",
            timestamp: new Date().toISOString(),
          });
          // 少し待っても届かないことを確認
          setTimeout(() => {
            expect(receivedEscalation).toBe(false);
            ws.close();
            done();
          }, 200);
        } else if (event.type === "escalation") {
          receivedEscalation = true;
        }
      });

      ws.on("error", (err) => {
        done(err);
      });
    });

    it("broadcastAllEscalationで全クライアントに通知できる", (done) => {
      const ws1 = new WebSocket(
        `ws://localhost:${TEST_PORT}/dashboard/ws?project=/path1`
      );
      const ws2 = new WebSocket(
        `ws://localhost:${TEST_PORT}/dashboard/ws?project=/path2`
      );

      let connectedCount = 0;
      let receivedCount = 0;

      const handleMessage = (data: WebSocket.RawData) => {
        const event = JSON.parse(data.toString());
        if (event.type === "connected") {
          connectedCount++;
          if (connectedCount === 2) {
            // 両方接続されたら全体通知
            setTimeout(() => {
              wsServer.broadcastAllEscalation({
                taskId: "task-789",
                title: "システム全体通知",
                severity: "critical",
                agentId: "system",
                message: "メンテナンス開始",
                timestamp: new Date().toISOString(),
              });
            }, 100);
          }
        } else if (event.type === "escalation") {
          receivedCount++;
          expect(event.data.taskId).toBe("task-789");
          if (receivedCount === 2) {
            ws1.close();
            ws2.close();
            done();
          }
        }
      };

      ws1.on("message", handleMessage);
      ws2.on("message", handleMessage);

      ws1.on("error", (err) => done(err));
      ws2.on("error", (err) => done(err));
    });
  });
});
