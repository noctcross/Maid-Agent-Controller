/**
 * get_report ビジネスロジック
 *
 * タスクのレポートファイル内容を取得する処理
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileExists } from "../utils/yaml-helper.js";
import { executeGetTask, type Task } from "./task-manager.js";

export interface GetReportParams {
  taskId: string;
  limit?: number;  // 行数制限（0または未指定で制限なし）
}

export interface ReportEntry {
  path: string;
  content: string | null;
  truncated?: boolean;
  totalLines?: number;
  error?: string;
}

export interface GetReportResult {
  success: boolean;
  reports: ReportEntry[];
  message?: string;
}

/**
 * パスを絶対パスに解決する
 * 相対パスの場合はprojectPathを基点にする
 */
function resolveReportPath(reportPath: string, projectPath: string): string {
  if (path.isAbsolute(reportPath)) {
    return reportPath;
  }
  return path.join(projectPath, reportPath);
}

/**
 * コンテンツに行数制限を適用する
 */
function applyLineLimit(content: string, limit: number): {
  content: string;
  truncated: boolean;
  totalLines: number;
} {
  const lines = content.split("\n");
  const totalLines = lines.length;

  if (limit <= 0 || limit >= totalLines) {
    return { content, truncated: false, totalLines };
  }

  return {
    content: lines.slice(0, limit).join("\n"),
    truncated: true,
    totalLines,
  };
}

/**
 * レポート内容を取得
 */
export async function executeGetReport(
  projectPath: string,
  params: GetReportParams
): Promise<GetReportResult> {
  const { taskId, limit } = params;

  // タスク情報を取得
  const taskResult = await executeGetTask(projectPath, { taskId });

  if (!taskResult.task) {
    return {
      success: false,
      reports: [],
      message: `タスクが見つかりません: ${taskId}`,
    };
  }

  const { reportPaths } = taskResult.task as Task;

  if (!reportPaths || reportPaths.length === 0) {
    return {
      success: true,
      reports: [],
      message: "レポートファイルが登録されていません",
    };
  }

  // 各レポートファイルを読み込み
  const reports: ReportEntry[] = await Promise.all(
    reportPaths.map(async (reportPath): Promise<ReportEntry> => {
      const absolutePath = resolveReportPath(reportPath, projectPath);

      // ファイル存在確認
      if (!(await fileExists(absolutePath))) {
        return {
          path: reportPath,
          content: null,
          error: "ファイルが見つかりません",
        };
      }

      try {
        const rawContent = await fs.readFile(absolutePath, "utf-8");

        // 行数制限の適用
        if (limit && limit > 0) {
          const limited = applyLineLimit(rawContent, limit);
          return {
            path: reportPath,
            content: limited.content,
            truncated: limited.truncated,
            totalLines: limited.totalLines,
          };
        }

        return {
          path: reportPath,
          content: rawContent,
          truncated: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          path: reportPath,
          content: null,
          error: `読み込みエラー: ${message}`,
        };
      }
    })
  );

  return {
    success: true,
    reports,
  };
}
