/**
 * notification-api-routes テスト
 * POST /api/notifications エンドポイントのユニットテスト
 *
 * task-1495-3: sendToAgent() が child_process.exec 経由で本物の `maidctl notify` を
 * 子プロセス実行しており、モック化されていなかったため npm test のたびに全エージェントへ
 * 実通知がブロードキャストされる事故が発生していた。util.promisify.custom を使い、
 * exec を完全にスタブ化することで実プロセス起動を排除する（live-service-isolated-testing
 * スキルの原則: 稼働中サービスに実際のコマンドを到達させない）。
 */

import { jest, describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { promisify } from "util";

// テスト用の一時ディレクトリ
const TEST_PROJECT_PATH = path.join(os.tmpdir(), "test-notification-api");
const HISTORY_LOG_PATH = path.join(
  TEST_PROJECT_PATH,
  ".maid-agent/system/data/notifications/history.log"
);

// --- child_process.exec のスタブ化 ---
// sendToAgent() は `promisify(exec)` を使うため、util.promisify.custom を実装した
// スタブに差し替える（Node組み込みのexecも同様にpromisify.customを実装しており、
// これがないと promisify() が「コールバック形式」とみなし実引数がズレて壊れる）。
const mockExecImpl = jest.fn<(command: string, options?: unknown) => Promise<{ stdout: string; stderr: string }>>();
const mockExec = jest.fn() as unknown as { [key: symbol]: typeof mockExecImpl };
mockExec[promisify.custom] = mockExecImpl;

jest.unstable_mockModule("child_process", () => ({
  exec: mockExec,
}));

// ルーターをダイナミックインポート（モック定義の後に行うこと）
const notificationApiRoutes = (await import("../../routes/notification-api-routes.js")).default;

// Express req/res モック
function createMockReqRes(
  query: Record<string, string> = {},
  body: Record<string, unknown> = {}
) {
  const req = { query, body } as any;
  const res = {
    status: jest.fn<any>().mockReturnThis(),
    json: jest.fn<any>().mockReturnThis(),
  } as any;
  return { req, res };
}

// ルーターからPOSTハンドラを取得
function getPostHandler() {
  const stack = (notificationApiRoutes as any).stack;
  const postRoute = stack.find(
    (layer: any) => layer.route?.path === "/api/notifications" && layer.route?.methods?.post
  );
  return postRoute?.route?.stack[0]?.handle;
}

// ルーターからGETハンドラを取得
function getGetHandler() {
  const stack = (notificationApiRoutes as any).stack;
  const getRoute = stack.find(
    (layer: any) => layer.route?.path === "/api/notifications" && layer.route?.methods?.get
  );
  return getRoute?.route?.stack[0]?.handle;
}

describe("POST /api/notifications", () => {
  const postHandler = getPostHandler();

  beforeEach(async () => {
    // テストディレクトリをクリーンアップして作成
    try {
      await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    } catch {
      // 存在しない場合は無視
    }
    await fs.mkdir(path.dirname(HISTORY_LOG_PATH), { recursive: true });

    // exec モックをリセットし、デフォルトは成功（本物のプロセスは一切起動しない）
    mockExecImpl.mockReset();
    mockExecImpl.mockResolvedValue({ stdout: "", stderr: "" });
  });

  afterAll(async () => {
    // テストディレクトリを削除
    try {
      await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    } catch {
      // 存在しない場合は無視
    }
  });

  it("projectパラメータが未指定の場合は400を返す", async () => {
    const { req, res } = createMockReqRes({}, { to: "chief", message: "test" });
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing project parameter" });
  });

  it("toパラメータが未指定の場合は400を返す", async () => {
    const { req, res } = createMockReqRes(
      { project: TEST_PROJECT_PATH },
      { message: "test" }
    );
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Missing 'to' or 'message' in request body",
    });
  });

  it("messageパラメータが未指定の場合は400を返す", async () => {
    const { req, res } = createMockReqRes(
      { project: TEST_PROJECT_PATH },
      { to: "chief" }
    );
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Missing 'to' or 'message' in request body",
    });
  });

  it("無効なターゲットの場合は400を返す", async () => {
    const { req, res } = createMockReqRes(
      { project: TEST_PROJECT_PATH },
      { to: "invalid_target", message: "test" }
    );
    await postHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid target: invalid_target",
      })
    );
  });

  it("有効なリクエストで通知コマンドが実行される（実プロセスは起動しない）", async () => {
    const { req, res } = createMockReqRes(
      { project: TEST_PROJECT_PATH },
      { to: "chief", message: "テストメッセージ" }
    );
    await postHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        notification: expect.objectContaining({
          from: "master",
          to: "chief",
          message: "テストメッセージ",
          status: "sent",
        }),
      })
    );

    // 実プロセスではなくモックされた exec が、期待どおりのコマンドで呼ばれたことを確認する
    expect(mockExecImpl).toHaveBeenCalledTimes(1);
    const [command, options] = mockExecImpl.mock.calls[0] as [string, { cwd?: string }];
    expect(command).toBe('maidctl notify --from master chief "テストメッセージ"');
    expect(options).toEqual(expect.objectContaining({ cwd: TEST_PROJECT_PATH }));
  });

  it("通知コマンドが失敗した場合、history.logへフォールバック書き込みされ失敗レスポンスを返す", async () => {
    mockExecImpl.mockRejectedValueOnce(new Error("maidctl: command not found"));

    const { req, res } = createMockReqRes(
      { project: TEST_PROJECT_PATH },
      { to: "chief", message: "テストメッセージ" }
    );
    await postHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Failed to send message to agent: chief",
      })
    );

    // フォールバックとしてローカルのhistory.logに追記されていることを確認
    const content = await fs.readFile(HISTORY_LOG_PATH, "utf-8");
    expect(content).toContain("master → chief: テストメッセージ");
  });

  it("複数のターゲットに送信できる（実プロセスは一度も起動しない）", async () => {
    const validTargets = ["butler", "chief", "emma", "sophia", "lily", "rose", "alice", "may", "flora", "luna"];

    for (const target of validTargets) {
      const { req, res } = createMockReqRes(
        { project: TEST_PROJECT_PATH },
        { to: target, message: `Message to ${target}` }
      );
      await postHandler(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          notification: expect.objectContaining({
            to: target,
          }),
        })
      );
    }

    // 10ターゲット分すべてモックのexecが呼ばれ、本物のプロセスは一切起動していないことを確認
    expect(mockExecImpl).toHaveBeenCalledTimes(validTargets.length);
    for (const call of mockExecImpl.mock.calls) {
      const [command] = call as [string];
      expect(command).toMatch(/^maidctl notify --from master \w+ "Message to \w+"$/);
    }
  });

  it("レスポンスのnotificationにidが含まれる", async () => {
    const { req, res } = createMockReqRes(
      { project: TEST_PROJECT_PATH },
      { to: "chief", message: "test" }
    );
    await postHandler(req, res);

    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.notification.id).toBeDefined();
    expect(jsonCall.notification.id).toMatch(/^\d{14}-[a-f0-9]{6}$/);
  });

  it("レスポンスのtimestampがISO 8601形式", async () => {
    const { req, res } = createMockReqRes(
      { project: TEST_PROJECT_PATH },
      { to: "chief", message: "test" }
    );
    await postHandler(req, res);

    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.notification.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  });
});

describe("GET /api/notifications", () => {
  const getHandler = getGetHandler();

  beforeEach(async () => {
    // テストディレクトリをクリーンアップして作成
    try {
      await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    } catch {
      // 存在しない場合は無視
    }
    await fs.mkdir(path.dirname(HISTORY_LOG_PATH), { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    } catch {
      // 存在しない場合は無視
    }
  });

  it("projectパラメータが未指定の場合は400を返す", async () => {
    const { req, res } = createMockReqRes({});
    await getHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing project parameter" });
  });

  it("history.logが存在しない場合は空配列を返す", async () => {
    const { req, res } = createMockReqRes({ project: TEST_PROJECT_PATH });
    await getHandler(req, res);
    expect(res.json).toHaveBeenCalledWith({ notifications: [], hasMore: false });
  });

  it("history.logの内容をパースして返す", async () => {
    // テストデータを作成
    const testLog = `[2026-03-02 15:47:17] luna → chief: タスク完了しました
[2026-03-02 15:48:00] chief → emma: 新しいタスクです
`;
    await fs.writeFile(HISTORY_LOG_PATH, testLog, "utf-8");

    const { req, res } = createMockReqRes({ project: TEST_PROJECT_PATH });
    await getHandler(req, res);

    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.notifications).toHaveLength(2);
    // 新しい順にソート
    expect(jsonCall.notifications[0].from).toBe("chief");
    expect(jsonCall.notifications[1].from).toBe("luna");
  });

  it("agentフィルタが機能する", async () => {
    const testLog = `[2026-03-02 15:47:17] luna → chief: メッセージ1
[2026-03-02 15:48:00] chief → emma: メッセージ2
[2026-03-02 15:49:00] emma → chief: メッセージ3
`;
    await fs.writeFile(HISTORY_LOG_PATH, testLog, "utf-8");

    const { req, res } = createMockReqRes({
      project: TEST_PROJECT_PATH,
      agent: "emma",
    });
    await getHandler(req, res);

    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.notifications).toHaveLength(2);
    expect(jsonCall.notifications.every((n: any) => n.from === "emma" || n.to === "emma")).toBe(true);
  });

  it("limitパラメータが機能する", async () => {
    let testLog = "";
    for (let i = 0; i < 10; i++) {
      testLog += `[2026-03-02 15:${String(i).padStart(2, "0")}:00] luna → chief: メッセージ${i}\n`;
    }
    await fs.writeFile(HISTORY_LOG_PATH, testLog, "utf-8");

    const { req, res } = createMockReqRes({
      project: TEST_PROJECT_PATH,
      limit: "3",
    });
    await getHandler(req, res);

    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.notifications).toHaveLength(3);
    expect(jsonCall.hasMore).toBe(true);
  });

  it("複数行メッセージをパースできる", async () => {
    const testLog = `[2026-03-02 15:47:17] luna → chief: 報告です
詳細は以下の通り:
- 項目1
- 項目2
[2026-03-02 15:48:00] chief → luna: 了解
`;
    await fs.writeFile(HISTORY_LOG_PATH, testLog, "utf-8");

    const { req, res } = createMockReqRes({ project: TEST_PROJECT_PATH });
    await getHandler(req, res);

    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.notifications).toHaveLength(2);
    // 新しい順なので chief → luna が先
    expect(jsonCall.notifications[1].message).toContain("報告です");
    expect(jsonCall.notifications[1].message).toContain("- 項目1");
    expect(jsonCall.notifications[1].message).toContain("- 項目2");
  });
});
