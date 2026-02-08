/**
 * 中央サーバーのシャットダウンテスト
 * 追加発見: SIGINTハンドラ欠如
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

describe("central-server - シグナルハンドリング", () => {
  it("SIGTERMとSIGINTの両方にハンドラが登録されていること", async () => {
    // central-server.ts のソースを読み込んで、SIGINTハンドラの存在を確認
    const { readFileSync } = await import("fs");
    const { join } = await import("path");

    const serverSource = readFileSync(
      join(process.cwd(), "src/central-server.ts"),
      "utf-8"
    );

    // SIGTERMハンドラの存在確認
    expect(serverSource).toContain('process.on("SIGTERM"');

    // SIGINTハンドラの存在確認
    // PM2はデフォルトでSIGINTを最初に送信するため、ハンドラが必要
    expect(serverSource).toContain('process.on("SIGINT"');
  });
});
