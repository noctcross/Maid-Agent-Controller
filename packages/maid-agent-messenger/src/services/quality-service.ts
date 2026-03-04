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
// 設定型定義
// =============================================================================

export interface LLMCheckConfig {
  enabled?: boolean;
  model?: string;
  task_types?: string[];
  on_failure?: "warn" | "block";
  timeout?: number;
  score_threshold?: number;
}

export interface ClassificationConfig {
  enabled?: boolean;
  model?: string;
  confidence_auto_threshold?: number;
  confidence_review_threshold?: number;
  timeout?: number;
}

export interface QualityCheckConfig {
  llm_check?: LLMCheckConfig;
  classification?: ClassificationConfig;
}

export interface ProjectSettings {
  quality_check?: QualityCheckConfig;
}

// =============================================================================
// プロジェクト設定読み込み
// =============================================================================

/**
 * プロジェクト固有の settings.yaml を読み込む
 */
export async function loadProjectSettings(
  projectPath: string
): Promise<ProjectSettings> {
  const settingsPath = path.join(
    projectPath,
    ".maid-agent/system/config/settings.yaml"
  );

  try {
    const content = await fs.readFile(settingsPath, "utf-8");
    return yaml.parse(content) as ProjectSettings;
  } catch {
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
export async function readPromptFile(
  projectPath: string,
  taskType: string
): Promise<string | null> {
  const promptsDir = path.join(
    projectPath,
    ".maid-agent/system/config/quality-prompts"
  );

  // タスク種別に対応するファイル
  let promptFile = path.join(promptsDir, `${taskType}.txt`);

  try {
    return await fs.readFile(promptFile, "utf-8");
  } catch {
    // フォールバックマップ
    const fallbackMap: Record<string, string> = {
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
    } catch {
      return null;
    }
  }
}

/**
 * 品質チェック履歴を記録
 */
export interface QualityHistoryEntry {
  taskId: string;
  taskType: string;
  agent?: string;
  checkType: string;
  result: string;
  score: number | null;
  issues?: string[];
  model?: string;
}

export async function recordQualityHistory(
  projectPath: string,
  data: QualityHistoryEntry
): Promise<void> {
  const historyDir = path.join(
    projectPath,
    ".maid-agent/system/data/quality-history/logs"
  );

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

/**
 * 問題分類結果を記録
 */
export interface ClassificationResult {
  issueType: "quality_gap" | "new_requirement" | "external";
  confidence: number;
  rationale: string;
  suggestedCategory?: string;
  promptImprovementHint?: string;
}

export async function recordIssueClassification(
  projectPath: string,
  taskId: string,
  reason: string,
  classification: ClassificationResult
): Promise<void> {
  const issuesDir = path.join(
    projectPath,
    ".maid-agent/system/data/quality-history/issues"
  );
  const classificationsDir = path.join(
    projectPath,
    ".maid-agent/system/data/quality-history/classifications"
  );

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

/**
 * モデル名を正規化
 * claude CLI 用の短縮名に変換
 */
export function normalizeModelName(model: string): string {
  // claude CLI では haiku, sonnet, opus の短縮名を使用
  const shortNames = ["haiku", "sonnet", "opus"];
  const lowerModel = model.toLowerCase();

  if (shortNames.includes(lowerModel)) {
    return lowerModel;
  }

  // フルモデル名から短縮名への逆変換
  if (lowerModel.includes("haiku")) return "haiku";
  if (lowerModel.includes("sonnet")) return "sonnet";
  if (lowerModel.includes("opus")) return "opus";

  return model;
}

// =============================================================================
// Claude CLI 呼び出し
// =============================================================================

export interface ClaudeCLIOptions {
  model?: string;
  timeout?: number;
  outputFormat?: "json" | "text";
}

export interface ClaudeCLIResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Claude CLI を spawn で呼び出す
 * 定額プラン内で利用可能
 */
export function runClaudeCLI(
  prompt: string,
  options: ClaudeCLIOptions = {}
): Promise<ClaudeCLIResult> {
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
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
      env,
    });

    logger.debug(`Claude CLI process spawned with pid: ${proc.pid}`);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      logger.debug(`Claude CLI exited with code: ${code}, stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
      if (stderr) logger.debug(`Claude CLI stderr: ${stderr.substring(0, 200)}`);
      if (code === 0) {
        resolve({
          success: true,
          output: stdout.trim(),
        });
      } else {
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
