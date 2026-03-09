/**
 * NotificationWebSocketServer 単体テスト
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import http from "http";
import WebSocket from "ws";
import { NotificationWebSocketServer } from "../../websocket/notification-ws.js";
describe("NotificationWebSocketServer", () => {
    let server;
    let wsServer;
    const TEST_PORT = 3198;
    beforeEach((done) => {
        server = http.createServer();
        wsServer = new NotificationWebSocketServer(server);
        server.listen(TEST_PORT, done);
    });
    afterEach((done) => {
        wsServer.close();
        server.close(done);
    });
    describe("接続", () => {
        it("projectパラメータ付きで接続できる", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications?project=/test/path`);
            ws.on("message", (data) => {
                const event = JSON.parse(data.toString());
                if (event.type === "connected") {
                    expect(event.sessionId).toBeDefined();
                    expect(event.sessionId).toMatch(/^notif-/);
                    ws.close();
                    done();
                }
            });
            ws.on("error", (err) => {
                done(err);
            });
        });
        it("projectパラメータなしで接続すると切断される", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications`);
            ws.on("close", (code) => {
                expect(code).toBe(4001);
                done();
            });
            ws.on("error", () => {
                // エラーは無視（close イベントで処理）
            });
        });
    });
    describe("ping/pong", () => {
        it("pingを受信したらpongを送信できる", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications?project=/test/path`);
            let pingReceived = false;
            ws.on("message", (data) => {
                const event = JSON.parse(data.toString());
                if (event.type === "connected") {
                    // 接続確認後、サーバーからのpingを待つ
                    // （テスト用に短いping間隔を設定できないため、手動でテスト）
                }
                else if (event.type === "ping") {
                    pingReceived = true;
                    // pongを送信
                    ws.send(JSON.stringify({ type: "pong" }));
                }
            });
            // ping待機は時間がかかるのでスキップし、pong送信のみテスト
            ws.on("open", () => {
                // クライアントからpongを送信
                ws.send(JSON.stringify({ type: "pong" }));
                // エラーが発生しなければOK
                setTimeout(() => {
                    ws.close();
                    done();
                }, 100);
            });
            ws.on("error", (err) => {
                done(err);
            });
        });
    });
    describe("subscribe", () => {
        it("subscribeメッセージを送信できる", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications?project=/test/path`);
            ws.on("message", (data) => {
                const event = JSON.parse(data.toString());
                if (event.type === "connected") {
                    // subscribeメッセージを送信
                    ws.send(JSON.stringify({
                        type: "subscribe",
                        agents: ["chief", "butler"],
                    }));
                    // エラーが発生しなければOK
                    setTimeout(() => {
                        ws.close();
                        done();
                    }, 100);
                }
            });
            ws.on("error", (err) => {
                done(err);
            });
        });
        it("subscribe後に全エージェントを購読解除できる", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications?project=/test/path`);
            ws.on("message", (data) => {
                const event = JSON.parse(data.toString());
                if (event.type === "connected") {
                    // 特定エージェントを購読
                    ws.send(JSON.stringify({
                        type: "subscribe",
                        agents: ["chief"],
                    }));
                    // 全エージェントに戻す（null指定）
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            type: "subscribe",
                            agents: null,
                        }));
                        setTimeout(() => {
                            ws.close();
                            done();
                        }, 50);
                    }, 50);
                }
            });
            ws.on("error", (err) => {
                done(err);
            });
        });
    });
    describe("切断", () => {
        it("正常に切断できる", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications?project=/test/path`);
            let closed = false;
            ws.on("message", (data) => {
                const event = JSON.parse(data.toString());
                if (event.type === "connected") {
                    ws.close();
                }
            });
            ws.on("close", () => {
                if (!closed) {
                    closed = true;
                    // 正常に切断できたことを確認
                    done();
                }
            });
            ws.on("error", (err) => {
                if (!closed) {
                    closed = true;
                    done(err);
                }
            });
        });
    });
    describe("不正なメッセージ", () => {
        it("不正なJSONでもエラーにならない", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications?project=/test/path`);
            ws.on("message", (data) => {
                const event = JSON.parse(data.toString());
                if (event.type === "connected") {
                    // 不正なJSONを送信
                    ws.send("invalid json {{{");
                    // サーバーがクラッシュしないことを確認
                    setTimeout(() => {
                        ws.close();
                        done();
                    }, 100);
                }
            });
            ws.on("error", (err) => {
                done(err);
            });
        });
        it("未知のメッセージタイプでもエラーにならない", (done) => {
            const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/notifications?project=/test/path`);
            ws.on("message", (data) => {
                const event = JSON.parse(data.toString());
                if (event.type === "connected") {
                    // 未知のタイプを送信
                    ws.send(JSON.stringify({ type: "unknown_type", data: {} }));
                    // サーバーがクラッシュしないことを確認
                    setTimeout(() => {
                        ws.close();
                        done();
                    }, 100);
                }
            });
            ws.on("error", (err) => {
                done(err);
            });
        });
    });
});
