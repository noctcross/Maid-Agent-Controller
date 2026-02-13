/**
 * get_my_task ビジネスロジック
 *
 * 自分に割り当てられたタスク情報を取得する処理
 */

import path from "path";
import type { GetMyTaskOutput } from "../types/index.js";
import { readYamlFile, getFirstLine, fileExists } from "../utils/yaml-helper.js";

export interface GetMyTaskParams {
  queueMaidPath: string;
  agentId: string;
  summaryOnly?: boolean;  // true: 軽量版（現在の実装は常に軽量版）
}

export interface GetMyTaskResult extends GetMyTaskOutput {
  message?: string;
}

/**
 * タスク情報を取得
 */
export async function executeGetMyTask(
  params: GetMyTaskParams
): Promise<GetMyTaskResult> {
  const { queueMaidPath, agentId } = params;
  const filePath = path.join(queueMaidPath, `${agentId}.yaml`);

  // ファイル存在確認
  if (!(await fileExists(filePath))) {
    return {
      task_id: null,
      description: null,
      target_path: null,
      status: "idle",
      assigned_at: null,
      started_at: null,
      message: "タスクファイルが見つかりません",
    };
  }

  // YAML読み込み
  const task = await readYamlFile(filePath);

  // 必要な情報のみ抽出
  // summaryOnly=true: 1行目のみ（トークン削減）
  // summaryOnly=false/undefined: 全文返す（詳細な指示が必要な場合）
  const description = params.summaryOnly
    ? getFirstLine(task.description)
    : (task.description || null);

  return {
    task_id: task.task_id || null,
    description,
    target_path: task.target_path || null,
    status: task.status || "idle",
    assigned_at: task.assigned_at || null,
    started_at: task.started_at || null,
  };
}
