import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { loopbackOnly } from "../../middleware/loopback-only.js";
import type { Request, Response, NextFunction } from "express";

function createMockReqRes(ip: string) {
  const req = {
    ip,
    socket: { remoteAddress: ip },
  } as unknown as Request;
  const res = {
    status: function (code: number) {
      (this as any).statusCode = code;
      return this;
    },
    json: function (body: any) {
      (this as any).body = body;
    },
    statusCode: 0,
    body: null as any,
  } as unknown as Response & { statusCode: number; body: any };
  return { req, res };
}

describe("loopbackOnly middleware", () => {
  it("127.0.0.1 からのアクセスを許可する", () => {
    const { req, res } = createMockReqRes("127.0.0.1");
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };
    loopbackOnly(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it("::1 (IPv6 loopback) からのアクセスを許可する", () => {
    const { req, res } = createMockReqRes("::1");
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };
    loopbackOnly(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it("::ffff:127.0.0.1 (IPv4-mapped IPv6) からのアクセスを許可する", () => {
    const { req, res } = createMockReqRes("::ffff:127.0.0.1");
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };
    loopbackOnly(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it("外部IP (192.168.1.100) からのアクセスを403で拒否する", () => {
    const { req, res } = createMockReqRes("192.168.1.100");
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };
    loopbackOnly(req, res, next);
    expect(nextCalled).toBe(false);
    expect((res as any).statusCode).toBe(403);
    expect((res as any).body).toEqual({ error: "Access denied: loopback only" });
  });

  it("空文字列IPを403で拒否する", () => {
    const req = {
      ip: "",
      socket: { remoteAddress: "" },
    } as unknown as Request;
    const res = {
      status: function (code: number) { (this as any).statusCode = code; return this; },
      json: function (body: any) { (this as any).body = body; },
      statusCode: 0,
      body: null as any,
    } as unknown as Response & { statusCode: number; body: any };
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };
    loopbackOnly(req, res, next);
    expect(nextCalled).toBe(false);
    expect((res as any).statusCode).toBe(403);
  });

  it("req.ip が undefined の場合 socket.remoteAddress にフォールバックする", () => {
    const req = {
      ip: undefined,
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;
    const res = {} as Response;
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };
    loopbackOnly(req, res, next);
    expect(nextCalled).toBe(true);
  });

  describe("ALLOW_EXTERNAL_ACCESS 環境変数", () => {
    const originalEnv = process.env.ALLOW_EXTERNAL_ACCESS;

    afterEach(() => {
      // テスト後に元の値に戻す
      if (originalEnv === undefined) {
        delete process.env.ALLOW_EXTERNAL_ACCESS;
      } else {
        process.env.ALLOW_EXTERNAL_ACCESS = originalEnv;
      }
    });

    it("ALLOW_EXTERNAL_ACCESS=true の場合、外部IPからのアクセスを許可する", () => {
      process.env.ALLOW_EXTERNAL_ACCESS = "true";
      const { req, res } = createMockReqRes("192.168.1.100");
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };
      loopbackOnly(req, res, next);
      expect(nextCalled).toBe(true);
    });

    it("ALLOW_EXTERNAL_ACCESS=false の場合、外部IPからのアクセスを拒否する", () => {
      process.env.ALLOW_EXTERNAL_ACCESS = "false";
      const { req, res } = createMockReqRes("192.168.1.100");
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };
      loopbackOnly(req, res, next);
      expect(nextCalled).toBe(false);
      expect((res as any).statusCode).toBe(403);
    });

    it("ALLOW_EXTERNAL_ACCESS が未設定の場合、外部IPからのアクセスを拒否する", () => {
      delete process.env.ALLOW_EXTERNAL_ACCESS;
      const { req, res } = createMockReqRes("192.168.1.100");
      let nextCalled = false;
      const next: NextFunction = () => { nextCalled = true; };
      loopbackOnly(req, res, next);
      expect(nextCalled).toBe(false);
      expect((res as any).statusCode).toBe(403);
    });
  });
});
