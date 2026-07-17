/**
 * 通知 API エンドポイント
 * GET /api/notifications - 通知履歴取得（JSON）
 * POST /api/notifications - 通知送信
 */
import { Router } from "express";
import path from "path";
import * as fs from "fs/promises";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../utils/logger.js";
const execAsync = promisify(exec);
const router = Router();
/** history.log のパースパターン */
const NOTIFICATION_PATTERN = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (\w+) → (\w+): (.*)$/;
/** 有効な送信先エージェント */
const VALID_TARGETS = [
    "butler",
    "chief",
    "emma",
    "sophia",
    "lily",
    "rose",
    "alice",
    "may",
    "flora",
    "luna",
];
/**
 * 通知IDを生成
 */
function generateId(timestamp, from, to) {
    const dateStr = timestamp.replace(/[-: ]/g, "").slice(0, 14);
    const hash = crypto
        .createHash("md5")
        .update(`${timestamp}-${from}-${to}`)
        .digest("hex")
        .slice(0, 6);
    return `${dateStr}-${hash}`;
}
/**
 * タイムスタンプをISO 8601形式に変換
 */
function formatTimestamp(ts) {
    // "2026-03-02 15:47:17" → "2026-03-02T15:47:17+09:00"
    return ts.replace(" ", "T") + "+09:00";
}
/**
 * history.log を解析して通知リストを生成
 */
function parseHistoryLog(content) {
    const lines = content.split("\n");
    const notifications = [];
    let current = null;
    for (const line of lines) {
        const match = line.match(NOTIFICATION_PATTERN);
        if (match) {
            // 前の通知を保存
            if (current) {
                const id = generateId(current.timestamp, current.from, current.to);
                notifications.push({
                    id,
                    timestamp: formatTimestamp(current.timestamp),
                    from: current.from,
                    to: current.to,
                    message: current.message.trim(),
                    status: "sent",
                });
            }
            // 新しい通知開始
            current = {
                timestamp: match[1],
                from: match[2],
                to: match[3],
                message: match[4],
            };
        }
        else if (current && line.trim()) {
            // 複数行メッセージの続き
            current.message += "\n" + line;
        }
    }
    // 最後の通知を保存
    if (current) {
        const id = generateId(current.timestamp, current.from, current.to);
        notifications.push({
            id,
            timestamp: formatTimestamp(current.timestamp),
            from: current.from,
            to: current.to,
            message: current.message.trim(),
            status: "sent",
        });
    }
    return notifications;
}
/**
 * GET /api/notifications - 通知履歴取得
 */
router.get("/api/notifications", async (req, res) => {
    try {
        const projectPath = req.query.project;
        const limit = parseInt(req.query.limit) || 100;
        const before = req.query.before;
        const agent = req.query.agent;
        if (!projectPath) {
            res.status(400).json({ error: "Missing project parameter" });
            return;
        }
        const historyPath = path.join(projectPath, ".maid-agent/system/data/notifications/history.log");
        let content;
        try {
            content = await fs.readFile(historyPath, "utf-8");
        }
        catch {
            // ファイルが存在しない場合は空配列
            res.json({ notifications: [], hasMore: false });
            return;
        }
        let notifications = parseHistoryLog(content);
        // 新しい順にソート
        notifications.reverse();
        // エージェントフィルタ
        if (agent) {
            notifications = notifications.filter((n) => n.from === agent || n.to === agent);
        }
        // before フィルタ（ページネーション）
        if (before) {
            const beforeDate = new Date(before);
            notifications = notifications.filter((n) => new Date(n.timestamp) < beforeDate);
        }
        // limit + 1 件取得して hasMore 判定
        const hasMore = notifications.length > limit;
        const result = notifications.slice(0, limit);
        res.json({ notifications: result, hasMore });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to get notifications", error instanceof Error ? error : { error });
        res.status(500).json({ error: message });
    }
});
/**
 * 単一エージェントにメッセージを送信
 */
async function sendToAgent(projectPath, target, message, historyPath) {
    const escapedMessage = message
        .replace(/\\/g, '\\\\') // \ → \\ （最初に処理）
        .replace(/"/g, '\\"') // " → \"
        .replace(/\$/g, '\\$') // $ → \$
        .replace(/`/g, '\\`'); // ` → \`
    const isSlashCommand = message.startsWith('/');
    const command = isSlashCommand
        ? `maidctl notify --from master --no-prefix ${target} "${escapedMessage}"`
        : `maidctl notify --from master ${target} "${escapedMessage}"`;
    try {
        await execAsync(command, { cwd: projectPath, timeout: 10000 });
        return true;
    }
    catch (execError) {
        // maidctl が失敗しても history.log には記録を試みる（フォールバック）
        logger.warn(`maidctl notify failed for ${target}, falling back to history.log only`, execError instanceof Error ? execError : { error: execError });
        const now = new Date();
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstDate = new Date(now.getTime() + jstOffset);
        const timestamp = jstDate.toISOString().replace("T", " ").slice(0, 19);
        const entry = `[${timestamp}] master → ${target}: ${message}\n`;
        await fs.appendFile(historyPath, entry, "utf-8");
        return false;
    }
}
/**
 * POST /api/notifications - 通知送信
 */
router.post("/api/notifications", async (req, res) => {
    try {
        const projectPath = req.query.project;
        const { to, message } = req.body;
        if (!projectPath) {
            res.status(400).json({ error: "Missing project parameter" });
            return;
        }
        if (!to || !message) {
            res.status(400).json({ error: "Missing 'to' or 'message' in request body" });
            return;
        }
        const historyPath = path.join(projectPath, ".maid-agent/system/data/notifications/history.log");
        // ディレクトリが存在するか確認、なければ作成
        const historyDir = path.dirname(historyPath);
        try {
            await fs.access(historyDir);
        }
        catch {
            await fs.mkdir(historyDir, { recursive: true });
        }
        // "all" の場合は全エージェントにブロードキャスト
        if (to === "all") {
            const results = [];
            // 全エージェントに順次送信（少し間隔を空ける）
            for (const target of VALID_TARGETS) {
                const success = await sendToAgent(projectPath, target, message, historyPath);
                results.push({ target, success });
                // 次の送信まで少し待つ（tmux送信の安定性のため）
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            const successCount = results.filter(r => r.success).length;
            const now = new Date();
            const jstOffset = 9 * 60 * 60 * 1000;
            const jstDate = new Date(now.getTime() + jstOffset);
            const timestamp = jstDate.toISOString().replace("T", " ").slice(0, 19);
            logger.info(`Broadcast sent: master → all (${successCount}/${VALID_TARGETS.length} succeeded)`);
            res.json({
                success: true,
                broadcast: true,
                totalTargets: VALID_TARGETS.length,
                successCount,
                results,
                timestamp: formatTimestamp(timestamp),
            });
            return;
        }
        // 有効なターゲットか確認（個別送信）
        if (!VALID_TARGETS.includes(to)) {
            res.status(400).json({
                error: `Invalid target: ${to}`,
                validTargets: [...VALID_TARGETS, "all"],
            });
            return;
        }
        // 個別エージェントへの送信
        const sendResult = await sendToAgent(projectPath, to, message, historyPath);
        if (sendResult === false) {
            logger.error(`Failed to send message to agent: ${to}`);
            res.status(500).json({ success: false, error: `Failed to send message to agent: ${to}` });
            return;
        }
        // レスポンス生成（タイムスタンプは現在時刻で）
        const now = new Date();
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstDate = new Date(now.getTime() + jstOffset);
        const timestamp = jstDate.toISOString().replace("T", " ").slice(0, 19);
        const id = generateId(timestamp, "master", to);
        const notification = {
            id,
            timestamp: formatTimestamp(timestamp),
            from: "master",
            to,
            message,
            status: "sent",
        };
        logger.info(`Notification sent: master → ${to}`);
        res.json({ success: true, notification });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to send notification", error instanceof Error ? error : { error });
        res.status(500).json({ success: false, error: message });
    }
});
export default router;
