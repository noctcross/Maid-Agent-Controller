/**
 * Quality Check Service
 *
 * LLM品質チェックおよび問題分類のサービス
 * - プロジェクト設定読み込み
 * - プロンプト読み込み
 * - 履歴記録
 */
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { spawn } from "child_process";
import { logger } from "../utils/logger.js";
// =============================================================================
// プロジェクト設定読み込み
// =============================================================================
/**
 * プロジェクト固有の settings.yaml を読み込む
 */
export async function loadProjectSettings(projectPath) {
    const settingsPath = path.join(projectPath, ".maid-agent/system/config/settings.yaml");
    try {
        const content = await fs.readFile(settingsPath, "utf-8");
        return yaml.parse(content);
    }
    catch {
        // 設定ファイルがない場合はデフォルト値
        return {
            quality_check: {
                llm_check: { enabled: true },
                classification: { enabled: true },
            },
        };
    }
}
/**
 * プロンプトファイルを読み込む
 * タスク種別に対応するプロンプトを取得し、なければフォールバック
 */
export async function readPromptFile(projectPath, taskType) {
    const promptsDir = path.join(projectPath, ".maid-agent/system/config/quality-prompts");
    // タスク種別に対応するファイル
    let promptFile = path.join(promptsDir, `${taskType}.txt`);
    try {
        return await fs.readFile(promptFile, "utf-8");
    }
    catch {
        // フォールバックマップ
        const fallbackMap = {
            design: "investigation.txt",
            proposal: "investigation.txt",
            review: "investigation.txt",
            task: "investigation.txt",
            document: "work.txt",
            step: "work.txt",
        };
        const fallback = fallbackMap[taskType] || "work.txt";
        promptFile = path.join(promptsDir, fallback);
        try {
            return await fs.readFile(promptFile, "utf-8");
        }
        catch {
            return null;
        }
    }
}
export async function recordQualityHistory(projectPath, data) {
    const historyDir = path.join(projectPath, ".maid-agent/system/data/quality-history/logs");
    await fs.mkdir(historyDir, { recursive: true });
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const logFile = path.join(historyDir, `${yearMonth}.jsonl`);
    const entry = {
        timestamp: now.toISOString(),
        task_id: data.taskId,
        task_type: data.taskType,
        agent: data.agent || "unknown",
        check_type: data.checkType,
        result: data.result,
        score: data.score,
        issues: data.issues || [],
        model: data.model || "unknown",
    };
    await fs.appendFile(logFile, JSON.stringify(entry) + "\n");
}
export async function recordIssueClassification(projectPath, taskId, reason, classification) {
    const issuesDir = path.join(projectPath, ".maid-agent/system/data/quality-history/issues");
    const classificationsDir = path.join(projectPath, ".maid-agent/system/data/quality-history/classifications");
    await fs.mkdir(issuesDir, { recursive: true });
    await fs.mkdir(classificationsDir, { recursive: true });
    const now = new Date();
    const timestamp = now.toISOString();
    // issues/{task_id}.json に記録
    const issueFile = path.join(issuesDir, `${taskId}.json`);
    const issueData = {
        task_id: taskId,
        issue: {
            reason,
            detected_at: timestamp,
        },
        classification: {
            issue_type: classification.issueType,
            confidence: classification.confidence,
            rationale: classification.rationale,
            suggested_category: classification.suggestedCategory || null,
            prompt_improvement_hint: classification.promptImprovementHint || null,
            classified_at: timestamp,
            classified_by: "llm",
            reviewed: false,
        },
    };
    await fs.writeFile(issueFile, JSON.stringify(issueData, null, 2));
    // 月別分類ログに追記
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const classLogFile = path.join(classificationsDir, `${yearMonth}.jsonl`);
    const logEntry = {
        task_id: taskId,
        timestamp,
        issue_type: classification.issueType,
        confidence: classification.confidence,
        rationale: classification.rationale,
    };
    await fs.appendFile(classLogFile, JSON.stringify(logEntry) + "\n");
}
const DEFAULT_MAX_LINES_PER_FILE = 300;
const DEFAULT_MAX_TOTAL_LINES = 1500;
/**
 * 報告書から変更ファイルパスを抽出
 * 「## 変更ファイル」セクションをパースする
 */
export function extractChangedFilesFromReport(reportContent) {
    const files = [];
    // 「## 変更ファイル」セクションを探す
    const sectionMatch = reportContent.match(/##\s*変更ファイル[^\n]*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
    if (!sectionMatch) {
        return files;
    }
    const sectionContent = sectionMatch[1];
    // 各行をパース
    // - path/to/file.ts
    // - `path/to/file.ts` - 説明
    // path/to/file.ts
    const lines = sectionContent.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        // リスト形式: - path/to/file.ts または - `path/to/file.ts`
        let match = trimmed.match(/^[-*]\s*`?([^`\s]+\.[a-zA-Z0-9]+)`?/);
        if (match) {
            files.push(match[1]);
            continue;
        }
        // パスのみ: path/to/file.ts
        match = trimmed.match(/^([^\s]+\.[a-zA-Z0-9]+)/);
        if (match && !trimmed.startsWith("#")) {
            files.push(match[1]);
        }
    }
    return files;
}
/**
 * ファイル内容を読み込み、トークン制限を適用
 */
export async function readFileContentsForReview(projectPath, filePaths, options = {}) {
    const maxLinesPerFile = options.maxLinesPerFile || DEFAULT_MAX_LINES_PER_FILE;
    const maxTotalLines = options.maxTotalLines || DEFAULT_MAX_TOTAL_LINES;
    const results = [];
    let totalLines = 0;
    for (const filePath of filePaths) {
        // 合計行数制限チェック
        if (totalLines >= maxTotalLines) {
            results.push({
                path: filePath,
                content: "(合計行数制限により省略)",
                truncated: true,
                lineCount: 0,
            });
            continue;
        }
        // ファイルパスを解決（相対パス → 絶対パス）
        // パストラバーサル防止: プロジェクトパス外へのアクセスを拒否
        const normalizedProjectPath = path.normalize(projectPath);
        const absolutePath = path.isAbsolute(filePath)
            ? path.normalize(filePath)
            : path.normalize(path.join(projectPath, filePath));
        // プロジェクトパス外へのアクセスをチェック
        if (!absolutePath.startsWith(normalizedProjectPath + path.sep) &&
            absolutePath !== normalizedProjectPath) {
            results.push({
                path: filePath,
                content: "",
                truncated: false,
                lineCount: 0,
                error: "Security: プロジェクト外のファイルへのアクセスは許可されていません",
            });
            continue;
        }
        try {
            const content = await fs.readFile(absolutePath, "utf-8");
            const lines = content.split("\n");
            const lineCount = lines.length;
            // 残り許容行数を計算
            const remainingLines = maxTotalLines - totalLines;
            const allowedLines = Math.min(maxLinesPerFile, remainingLines);
            if (lineCount <= allowedLines) {
                // 全文を含める
                results.push({
                    path: filePath,
                    content: content,
                    truncated: false,
                    lineCount,
                });
                totalLines += lineCount;
            }
            else {
                // 先頭と末尾を含め、中央を省略
                const headLines = Math.floor(allowedLines / 2);
                const tailLines = allowedLines - headLines;
                const head = lines.slice(0, headLines).join("\n");
                const tail = lines.slice(-tailLines).join("\n");
                const omittedCount = lineCount - headLines - tailLines;
                const truncatedContent = `${head}\n\n... (${omittedCount}行省略) ...\n\n${tail}`;
                results.push({
                    path: filePath,
                    content: truncatedContent,
                    truncated: true,
                    lineCount,
                });
                totalLines += allowedLines;
            }
        }
        catch (err) {
            // ファイル読み込みエラー
            results.push({
                path: filePath,
                content: "",
                truncated: false,
                lineCount: 0,
                error: err instanceof Error ? err.message : "Unknown error",
            });
        }
    }
    return results;
}
/**
 * プロンプトにファイル内容を追加
 */
export function buildPromptWithFileContents(prompt, reportContent, fileContents) {
    let fullPrompt = `${prompt}\n\n【報告書】\n${reportContent}`;
    // ファイル内容がある場合のみ追加
    const validFiles = fileContents.filter((f) => f.content && !f.error);
    if (validFiles.length > 0) {
        fullPrompt += "\n\n【変更ファイル内容】\n";
        fullPrompt +=
            "※ 以下は報告書に記載された変更ファイルの内容です。コードの品質も評価に含めてください。\n\n";
        for (const file of validFiles) {
            fullPrompt += `=== ${file.path} ===\n`;
            if (file.truncated) {
                fullPrompt += `(${file.lineCount}行中、一部を表示)\n`;
            }
            fullPrompt += `${file.content}\n\n`;
        }
        // エラーがあったファイルも記載
        const errorFiles = fileContents.filter((f) => f.error);
        if (errorFiles.length > 0) {
            fullPrompt += "【読み込めなかったファイル】\n";
            for (const file of errorFiles) {
                fullPrompt += `- ${file.path}: ${file.error}\n`;
            }
            fullPrompt += "\n";
        }
    }
    return fullPrompt;
}
/**
 * モデル名を正規化
 * claude CLI 用の短縮名に変換
 */
export function normalizeModelName(model) {
    // claude CLI では haiku, sonnet, opus の短縮名を使用
    const shortNames = ["haiku", "sonnet", "opus"];
    const lowerModel = model.toLowerCase();
    if (shortNames.includes(lowerModel)) {
        return lowerModel;
    }
    // フルモデル名から短縮名への逆変換
    if (lowerModel.includes("haiku"))
        return "haiku";
    if (lowerModel.includes("sonnet"))
        return "sonnet";
    if (lowerModel.includes("opus"))
        return "opus";
    return model;
}
/**
 * Claude CLI を spawn で呼び出す
 * 定額プラン内で利用可能
 */
export function runClaudeCLI(prompt, options = {}) {
    return new Promise((resolve) => {
        const model = options.model || "haiku";
        const timeout = options.timeout || 60000;
        const outputFormat = options.outputFormat || "text";
        // --dangerously-skip-permissions: 非対話環境での権限ダイアログをスキップ
        // --no-session-persistence: セッション保存を無効化（一回限りの呼び出し用）
        const args = [
            "-p", prompt,
            "--model", model,
            "--dangerously-skip-permissions",
            "--no-session-persistence",
        ];
        if (outputFormat === "json") {
            args.push("--output-format", "json");
        }
        // Claude CLI の絶対パス（環境によって異なる場合あり）
        const claudePath = process.env.CLAUDE_CLI_PATH ||
            `${process.env.HOME || '/home'}/.local/bin/claude`;
        // 環境変数をコピーし、CLAUDECODE を削除（ネストセッション防止を回避）
        const env = { ...process.env };
        logger.info(`CLAUDECODE before delete: "${env.CLAUDECODE}"`);
        delete env.CLAUDECODE;
        logger.info(`CLAUDECODE after delete: "${env.CLAUDECODE}", in env: ${Object.keys(env).includes('CLAUDECODE')}`);
        logger.info(`Spawning Claude CLI: ${claudePath} with args: ${args.slice(0, 4).join(' ')}`);
        logger.debug(`HOME=${process.env.HOME}, timeout=${timeout}ms`);
        const proc = spawn(claudePath, args, {
            stdio: ["ignore", "pipe", "pipe"], // stdinを無視（入力待ちを防止）
            timeout,
            env,
        });
        logger.debug(`Claude CLI process spawned with pid: ${proc.pid}`);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (data) => {
            stdout += data.toString();
        });
        proc.stderr.on("data", (data) => {
            stderr += data.toString();
        });
        proc.on("close", (code) => {
            logger.debug(`Claude CLI exited with code: ${code}, stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
            if (stderr)
                logger.debug(`Claude CLI stderr: ${stderr.substring(0, 200)}`);
            if (code === 0) {
                resolve({
                    success: true,
                    output: stdout.trim(),
                });
            }
            else {
                resolve({
                    success: false,
                    output: stdout.trim(),
                    error: stderr.trim() || `Process exited with code ${code}`,
                });
            }
        });
        proc.on("error", (err) => {
            logger.error(`Claude CLI spawn error: ${err.message}`);
            resolve({
                success: false,
                output: "",
                error: err.message,
            });
        });
        // タイムアウト処理
        const timer = setTimeout(() => {
            logger.warn(`Claude CLI timed out after ${timeout}ms, killing process ${proc.pid}`);
            proc.kill("SIGTERM");
            resolve({
                success: false,
                output: "",
                error: "Process timed out",
            });
        }, timeout);
        proc.on("close", () => {
            clearTimeout(timer);
        });
    });
}
