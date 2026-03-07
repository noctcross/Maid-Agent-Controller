/**
 * get_my_task ビジネスロジック
 *
 * 自分に割り当てられたタスク情報を取得する処理
 */

import path from "path";
import fs from "fs/promises";
import { parse } from "yaml";
import type { GetMyTaskOutput } from "../types/index.js";
import { readYamlFile, getFirstLine, fileExists } from "../utils/yaml-helper.js";
import { logger } from "../utils/logger.js";

export interface GetMyTaskParams {
  queueMaidPath: string;
  agentId: string;
  summaryOnly?: boolean;  // true: 軽量版（現在の実装は常に軽量版）
  projectPath?: string;   // tasks.yaml への参照用（親タスク情報取得）
}

/**
 * 親タスク情報の型
 */
export interface ParentTaskInfo {
  id: string;
  title: string;
  type: string;         // goal, phase, action
  description?: string;
  subStatus?: string;
}

export interface GetMyTaskResult extends GetMyTaskOutput {
  message?: string;
  parent_chain?: ParentTaskInfo[];  // 親タスクの階層（Goal→Phase→...）
}

/**
 * tasks.yaml からタスクを検索
 */
interface TaskYamlEntry {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  parentId?: string;
  subStatus?: string;
}

interface TasksYamlData {
  tasks: TaskYamlEntry[];
}

async function loadTasksYaml(projectPath: string): Promise<TasksYamlData | null> {
  const tasksFilePath = path.join(projectPath, ".maid-agent", "system", "data", "tasks.yaml");

  if (!(await fileExists(tasksFilePath))) {
    return null;
  }

  try {
    const content = await fs.readFile(tasksFilePath, "utf-8");
    return parse(content) as TasksYamlData;
  } catch {
    logger.error("Failed to parse tasks.yaml");
    return null;
  }
}

/**
 * タスクIDから親タスクの階層を取得（Goal→Phase→...の順）
 */
async function getParentChain(
  projectPath: string,
  taskId: string
): Promise<ParentTaskInfo[]> {
  const tasksData = await loadTasksYaml(projectPath);
  if (!tasksData || !tasksData.tasks) {
    return [];
  }

  const tasksMap = new Map<string, TaskYamlEntry>();
  for (const task of tasksData.tasks) {
    tasksMap.set(task.id, task);
  }

  // 自タスクを検索
  const currentTask = tasksMap.get(taskId);
  if (!currentTask || !currentTask.parentId) {
    return [];
  }

  // 親を再帰的に収集
  const chain: ParentTaskInfo[] = [];
  let parentId: string | undefined = currentTask.parentId;

  while (parentId) {
    const parent = tasksMap.get(parentId);
    if (!parent) break;

    chain.push({
      id: parent.id,
      title: parent.title || "(タイトルなし)",
      type: parent.type || "step",
      description: parent.description,
      subStatus: parent.subStatus,
    });

    parentId = parent.parentId;
  }

  // 逆順にしてTask→Work→...の順にする
  return chain.reverse();
}

/**
 * タスク情報を取得
 */
export async function executeGetMyTask(
  params: GetMyTaskParams
): Promise<GetMyTaskResult> {
  const { queueMaidPath, agentId, projectPath } = params;
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

  // 親タスク情報を取得（projectPath が指定されている場合）
  let parentChain: ParentTaskInfo[] | undefined;
  if (projectPath && task.task_id) {
    parentChain = await getParentChain(projectPath, task.task_id);
  }

  return {
    task_id: task.task_id || null,
    description,
    target_path: task.target_path || null,
    status: task.status || "idle",
    assigned_at: task.assigned_at || null,
    started_at: task.started_at || null,
    ...(parentChain && parentChain.length > 0 && { parent_chain: parentChain }),
  };
}
