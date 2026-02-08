/**
 * loopback-only ミドルウェア
 * LAN公開時に非公開エンドポイントを保護する
 * 127.0.0.1 / ::1 / ::ffff:127.0.0.1 からのアクセスのみ許可
 */
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
export const loopbackOnly = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (LOOPBACK_ADDRESSES.includes(ip)) {
        next();
    }
    else {
        res.status(403).json({ error: 'Access denied: loopback only' });
    }
};
