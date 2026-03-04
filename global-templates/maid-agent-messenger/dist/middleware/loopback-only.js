/**
 * loopback-only ミドルウェア
 * LAN公開時に非公開エンドポイントを保護する
 * 127.0.0.1 / ::1 / ::ffff:127.0.0.1 からのアクセスのみ許可
 *
 * 環境変数 ALLOW_EXTERNAL_ACCESS=true で外部アクセスを許可可能（開発用）
 */
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
/**
 * 外部アクセスが許可されているかチェック
 */
function isExternalAccessAllowed() {
    return process.env.ALLOW_EXTERNAL_ACCESS === 'true';
}
export const loopbackOnly = (req, res, next) => {
    // 環境変数で外部アクセスが許可されている場合はスキップ
    if (isExternalAccessAllowed()) {
        next();
        return;
    }
    const ip = req.ip || req.socket.remoteAddress || '';
    if (LOOPBACK_ADDRESSES.includes(ip)) {
        next();
    }
    else {
        res.status(403).json({ error: 'Access denied: loopback only' });
    }
};
