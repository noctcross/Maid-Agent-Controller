/**
 * loopback-only ミドルウェア
 * LAN公開時に非公開エンドポイントを保護する
 * 127.0.0.1 / ::1 / ::ffff:127.0.0.1 からのアクセスのみ許可
 *
 * 環境変数 ALLOW_EXTERNAL_ACCESS=true で外部アクセスを許可可能（開発用）
 */
import { Request, Response, NextFunction } from "express";
export declare const loopbackOnly: (req: Request, res: Response, next: NextFunction) => void;
