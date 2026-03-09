/**
 * Claude Code応答 API エンドポイント
 * GET /api/responses - エージェントの応答履歴取得
 */
import { Router } from "express";
import path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as yaml from "yaml";
import { logger } from "../utils/logger.js";
const router = Router();
/**
 * jsonlファイルからassistantのtext応答とuser入力を抽出
 * user入力のうち [From:master] で始まるものは maidctl notify 経由のため除外
 */
async function extractResponses(sessionFilePath, agent, limit) {
    const content = await fs.readFile(sessionFilePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    const responses = [];
    for (const line of lines) {
        try {
            const data = JSON.parse(line);
            // assistant 応答を抽出
            if (data.type === "assistant" && data.message?.content) {
                const textContents = data.message.content.filter((c) => c.type === "text" && c.text);
                for (const tc of textContents) {
                    responses.push({
                        id: data.uuid || `${data.timestamp}-${responses.length}`,
                        timestamp: data.timestamp,
                        agent,
                        text: tc.text,
                        type: "response",
                    });
                }
            }
            // user 入力を抽出（ご主人様の直接入力）
            if (data.type === "user" && data.message?.content) {
                // message.content が文字列の場合（直接入力）
                if (typeof data.message.content === "string") {
                    const text = data.message.content;
                    // [From: で始まるメッセージは maidctl notify 経由なので除外
                    if (!text.startsWith("[From:") && !text.startsWith("[From: ")) {
                        responses.push({
                            id: data.uuid || `${data.timestamp}-user-${responses.length}`,
                            timestamp: data.timestamp,
                            agent,
                            text,
                            type: "user_input",
                        });
                    }
                }
                // message.content が配列の場合（tool_result等は除外）
                // 直接入力のテキストのみ抽出
                else if (Array.isArray(data.message.content)) {
                    for (const c of data.message.content) {
                        if (c.type === "text" && typeof c.text === "string") {
                            const text = c.text;
                            // [From: で始まるメッセージは除外
                            if (!text.startsWith("[From:") && !text.startsWith("[From: ")) {
                                responses.push({
                                    id: data.uuid || `${data.timestamp}-user-${responses.length}`,
                                    timestamp: data.timestamp,
                                    agent,
                                    text,
                                    type: "user_input",
                                });
                            }
                        }
                    }
                }
            }
        }
        catch {
            // JSONパースエラーは無視
        }
    }
    // 新しい順にソートして制限
    return responses.reverse().slice(0, limit);
}
/**
 * GET /api/responses - エージェントの応答履歴取得
 */
router.get("/api/responses", async (req, res) => {
    try {
        const projectPath = req.query.project;
        const agent = req.query.agent;
        const limit = parseInt(req.query.limit) || 50;
        if (!projectPath) {
            res.status(400).json({ error: "Missing project parameter" });
            return;
        }
        if (!agent) {
            res.status(400).json({ error: "Missing agent parameter" });
            return;
        }
        // maid/{agent}.yaml からsession_idを取得
        const maidConfigPath = path.join(projectPath, ".maid-agent/system/data/maid", `${agent}.yaml`);
        let maidConfig;
        try {
            const configContent = await fs.readFile(maidConfigPath, "utf-8");
            maidConfig = yaml.parse(configContent);
        }
        catch {
            res.status(404).json({ error: `Agent config not found: ${agent}` });
            return;
        }
        const sessionId = maidConfig.session_id;
        if (!sessionId) {
            res.json({ responses: [], message: "No active session for this agent" });
            return;
        }
        // プロジェクトパスをClaude形式に変換（/とアンダースコアをダッシュに）
        const claudeProjectId = projectPath.replace(/^\//, "").replace(/[/_]/g, "-");
        const sessionFilePath = path.join(os.homedir(), ".claude/projects", `-${claudeProjectId}`, `${sessionId}.jsonl`);
        let responses;
        try {
            responses = await extractResponses(sessionFilePath, agent, limit);
        }
        catch {
            res.json({ responses: [], message: "Session file not found" });
            return;
        }
        res.json({ responses, hasMore: responses.length >= limit });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to get responses", error instanceof Error ? error : { error });
        res.status(500).json({ error: message });
    }
});
/**
 * GET /api/agents/sessions - 全エージェントのセッション情報取得
 */
router.get("/api/agents/sessions", async (req, res) => {
    try {
        const projectPath = req.query.project;
        if (!projectPath) {
            res.status(400).json({ error: "Missing project parameter" });
            return;
        }
        const maidDir = path.join(projectPath, ".maid-agent/system/data/maid");
        const files = await fs.readdir(maidDir);
        const sessions = {};
        for (const file of files) {
            if (file.endsWith(".yaml") && file !== ".gitkeep") {
                const agent = file.replace(".yaml", "");
                try {
                    const content = await fs.readFile(path.join(maidDir, file), "utf-8");
                    const config = yaml.parse(content);
                    sessions[agent] = config.session_id || null;
                }
                catch {
                    sessions[agent] = null;
                }
            }
        }
        res.json({ sessions });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Failed to get agent sessions", error instanceof Error ? error : { error });
        res.status(500).json({ error: message });
    }
});
export default router;
