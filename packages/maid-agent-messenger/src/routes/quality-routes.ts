/**
 * Quality Check API エンドポイント
 *
 * LLM品質チェックおよび問題分類のAPIエンドポイント
 *
 * エンドポイント:
 * - POST /api/quality/llm-check - LLM品質チェック
 * - POST /api/quality/classify-issue - 問題分類
 */

import { Router, Request, Response } from "express";
import { getProjectPathFromRequest } from "../middleware/project-path.js";
import {
  loadProjectSettings,
  readPromptFile,
  recordQualityHistory,
  recordIssueClassification,
  normalizeModelName,
  runClaudeCLI,
  extractChangedFilesFromReport,
  readFileContentsForReview,
  buildPromptWithFileContents,
  type ClassificationResult,
} from "../services/quality-service.js";
import { logger } from "../utils/logger.js";

const router = Router();

// =============================================================================
// 型定義
// =============================================================================

interface LLMCheckRequest {
  taskId: string;
  taskType: string;
  reportContent: string;
  agentId?: string;
  options?: {
    model?: string;
    timeout?: number;
  };
}

interface LLMCheckResult {
  pass: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
}

interface ClassifyIssueRequest {
  taskId: string;
  reason: string;
  originalDescription: string;
  reportContent: string;
  qualityCheckResult?: {
    result: string;
    score: number;
  };
}

// =============================================================================
// POST /api/quality/llm-check - LLM品質チェック
// =============================================================================

router.post("/api/quality/llm-check", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const body = req.body as LLMCheckRequest;
    const { taskId, taskType, reportContent, agentId, options } = body;

    // バリデーション
    if (!taskId || !taskType || !reportContent) {
      res.status(400).json({
        success: false,
        error: "taskId, taskType, and reportContent are required",
      });
      return;
    }

    // 設定読み込み
    const settings = await loadProjectSettings(projectPath);
    const llmConfig = settings.quality_check?.llm_check;

    // 有効性チェック
    if (!llmConfig?.enabled) {
      res.json({
        success: true,
        skipped: true,
        skipReason: "LLM check disabled",
      });
      return;
    }

    // タスク種別チェック
    const targetTypes = llmConfig.task_types || ["investigation", "work"];
    if (!targetTypes.includes(taskType)) {
      res.json({
        success: true,
        skipped: true,
        skipReason: `Task type '${taskType}' not in target types`,
      });
      return;
    }

    // プロンプト読み込み
    const prompt = await readPromptFile(projectPath, taskType);
    if (!prompt) {
      res.json({
        success: true,
        skipped: true,
        skipReason: "Prompt file not found",
      });
      return;
    }

    // Claude CLI 呼び出し（spawn方式）
    const modelName = normalizeModelName(
      options?.model || llmConfig.model || "haiku"
    );
    const timeout = options?.timeout || llmConfig.timeout || 60000;

    // 成果物評価：変更ファイル内容を読み込み
    let fullPrompt: string;
    const includeFileContents = llmConfig.include_file_contents ?? true; // デフォルト有効

    if (includeFileContents) {
      const changedFiles = extractChangedFilesFromReport(reportContent);
      logger.debug(`Extracted ${changedFiles.length} changed files from report`);

      if (changedFiles.length > 0) {
        const fileContents = await readFileContentsForReview(
          projectPath,
          changedFiles,
          {
            maxLinesPerFile: llmConfig.max_lines_per_file || 300,
            maxTotalLines: llmConfig.max_total_lines || 1500,
          }
        );
        logger.debug(`Read ${fileContents.length} files for review`);

        fullPrompt = buildPromptWithFileContents(prompt, reportContent, fileContents);
      } else {
        // 変更ファイルがない場合は従来通り
        fullPrompt = `${prompt}\n\n【報告書】\n${reportContent}`;
      }
    } else {
      // 成果物評価無効の場合は従来通り
      fullPrompt = `${prompt}\n\n【報告書】\n${reportContent}`;
    }

    logger.debug(`LLM check: taskId=${taskId}, model=${modelName}, promptLength=${fullPrompt.length}`);

    const cliResult = await runClaudeCLI(fullPrompt, {
      model: modelName,
      timeout,
    });

    if (!cliResult.success) {
      logger.warn(`Claude CLI failed: ${cliResult.error}`);
      res.json({
        success: true,
        skipped: true,
        skipReason: `Claude CLI error: ${cliResult.error}`,
      });
      return;
    }

    // 結果パース
    const responseText = cliResult.output;

    let result: LLMCheckResult;
    try {
      // JSONを抽出（```json...```で囲まれている場合も対応）
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.error("Failed to parse LLM response:", { response: responseText });
      res.json({
        success: false,
        error: "Failed to parse LLM response",
      });
      return;
    }

    // スコア閾値チェック
    const scoreThreshold = llmConfig.score_threshold || 60;
    if (result.pass && result.score < scoreThreshold) {
      result.pass = false;
    }

    // 履歴記録
    await recordQualityHistory(projectPath, {
      taskId,
      taskType,
      agent: agentId,
      checkType: "llm",
      result: result.pass ? "PASS" : "FAIL",
      score: result.score,
      issues: result.issues,
      model: modelName,
    });

    res.json({
      success: true,
      result: {
        pass: result.pass,
        score: result.score,
        issues: result.issues || [],
        suggestions: result.suggestions || [],
      },
    });
  } catch (error) {
    logger.error("LLM check error:", error instanceof Error ? error : undefined);
    res.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// POST /api/quality/classify-issue - 問題分類
// =============================================================================

router.post(
  "/api/quality/classify-issue",
  async (req: Request, res: Response) => {
    try {
      const projectPath = getProjectPathFromRequest(req);
      const body = req.body as ClassifyIssueRequest;
      const {
        taskId,
        reason,
        originalDescription,
        reportContent,
        qualityCheckResult,
      } = body;

      // バリデーション
      if (!taskId || !reason) {
        res.status(400).json({
          success: false,
          error: "taskId and reason are required",
        });
        return;
      }

      // 設定読み込み
      const settings = await loadProjectSettings(projectPath);
      const classifyConfig = settings.quality_check?.classification;

      if (!classifyConfig?.enabled) {
        res.json({
          success: true,
          skipped: true,
          skipReason: "Classification disabled",
        });
        return;
      }

      // プロンプト読み込み
      const prompt = await readPromptFile(projectPath, "classify-issue");
      if (!prompt) {
        res.json({
          success: false,
          error: "Classify prompt not found",
        });
        return;
      }

      // プロンプト変数置換
      const fullPrompt = prompt
        .replace("{reason}", reason)
        .replace("{original_description}", originalDescription || "")
        .replace("{report_content}", reportContent || "")
        .replace(
          "{quality_check_result}",
          JSON.stringify(qualityCheckResult || {})
        );

      // Claude CLI 呼び出し（spawn方式）
      const modelName = normalizeModelName(classifyConfig.model || "haiku");
      const timeout = classifyConfig.timeout || 60000;

      logger.debug(`Classify issue: taskId=${taskId}, model=${modelName}`);

      const cliResult = await runClaudeCLI(fullPrompt, {
        model: modelName,
        timeout,
      });

      if (!cliResult.success) {
        logger.warn(`Claude CLI failed: ${cliResult.error}`);
        res.json({
          success: false,
          error: `Claude CLI error: ${cliResult.error}`,
        });
        return;
      }

      const responseText = cliResult.output;

      let result: ClassificationResult;
      try {
        // JSONを抽出
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          issueType: parsed.issue_type || parsed.issueType,
          confidence: parsed.confidence,
          rationale: parsed.rationale,
          suggestedCategory:
            parsed.suggested_category || parsed.suggestedCategory,
          promptImprovementHint:
            parsed.prompt_improvement_hint || parsed.promptImprovementHint,
        };
      } catch (parseError) {
        logger.error("Failed to parse classification response:", { response: responseText });
        res.json({
          success: false,
          error: "Failed to parse classification response",
        });
        return;
      }

      // 分類結果を記録
      await recordIssueClassification(projectPath, taskId, reason, result);

      // confidence チェック
      const autoThreshold = classifyConfig.confidence_auto_threshold || 80;
      const reviewThreshold = classifyConfig.confidence_review_threshold || 50;

      const requiresReview = result.confidence < autoThreshold;
      const requiresImmediateReview = result.confidence < reviewThreshold;

      res.json({
        success: true,
        result: {
          issueType: result.issueType,
          confidence: result.confidence,
          rationale: result.rationale,
          suggestedCategory: result.suggestedCategory,
          promptImprovementHint: result.promptImprovementHint,
        },
        requiresReview,
        requiresImmediateReview,
      });
    } catch (error) {
      logger.error("Classify issue error:", error instanceof Error ? error : undefined);
      res.json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export default router;
