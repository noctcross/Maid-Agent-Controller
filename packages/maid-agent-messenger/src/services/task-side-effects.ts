/**
 * タスク状態更新の副作用処理
 *
 * executeUpdateTask から呼び出される副作用関数群。
 * - syncMaidYaml: maid yaml 自動同期
 * - archiveReport: レポートアーカイブ（completed時）
 * - initReportTemplate: レポートテンプレート初期化（assigned時）
 *
 * task-manager.ts のファイルサイズ制限のため別ファイルに分離。
 */

import * as path from "path";
import * as fs from "fs/promises";
import type { Task, Assignee, UpdateTaskParams, SideEffectResults } from "../types/task-manager-types.js";
import {
  readYamlFile,
  writeYamlFile,
  fileExists,
  copyFile,
  writeTextFile,
  sanitizeDescription,
} from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
import { loadConfig } from "../utils/config-loader.js";
import type { TaskYaml, TaskStatus as MaidTaskStatus } from "../types/index.js";

/**
 * 報告書ファイルからタスクIDを抽出
 *
 * @param reportPath - 報告書ファイルパス
 * @returns タスクID（例: "task-171"）、見つからない場合は null
 *
 * 注: task- プレフィックスの有無を許容し、常に "task-XXX" 形式で返す
 */
export async function extractTaskIdFromReport(reportPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(reportPath, "utf-8");
    // 報告書の task_id 行をパース
    // - "task-171", "task-171-1" (プレフィックス付き)
    // - "171", "171-1" (プレフィックスなし) どちらも許容
    const match = content.match(/^- task_id:\s*(?:task-)?(\d+(?:-\d+)?)/m);
    if (!match) return null;
    // 常に "task-XXX" 形式に正規化して返す
    return `task-${match[1]}`;
  } catch {
    return null;
  }
}

/**
 * 報告書のアーカイブが必要かどうかを判定
 *
 * @param currentPath - 現在の報告書ファイルパス
 * @param archivePath - アーカイブ先ファイルパス
 * @param expectedTaskId - 期待するタスクID（例: "task-171"）
 * @param skipTimestampCheck - タイムスタンプチェックをスキップ（初回completed時）
 * @returns { shouldArchive, reason }
 */
async function shouldArchiveReport(
  currentPath: string,
  archivePath: string,
  expectedTaskId: string,
  skipTimestampCheck: boolean = false
): Promise<{ shouldArchive: boolean; reason: string }> {
  try {
    // 現在の報告書が存在しない → アーカイブ不要
    if (!await fileExists(currentPath)) {
      return { shouldArchive: false, reason: "report_not_found" };
    }

    // タスクID一致確認
    const reportTaskId = await extractTaskIdFromReport(currentPath);
    if (reportTaskId !== expectedTaskId) {
      return {
        shouldArchive: false,
        reason: "task_id_mismatch",  // 重要: 誤上書き防止
      };
    }

    // 初回completedの場合はタイムスタンプチェックをスキップ
    if (skipTimestampCheck) {
      return { shouldArchive: true, reason: "first_complete" };
    }

    // アーカイブが存在しない → アーカイブ必要
    if (!await fileExists(archivePath)) {
      return { shouldArchive: true, reason: "archive_not_found" };
    }

    // 両方存在する場合 → 更新日時を比較
    const [currentStat, archiveStat] = await Promise.all([
      fs.stat(currentPath),
      fs.stat(archivePath)
    ]);

    // 報告書がアーカイブより新しい場合のみアーカイブ
    if (currentStat.mtime > archiveStat.mtime) {
      return { shouldArchive: true, reason: "report_newer" };
    }

    return { shouldArchive: false, reason: "archive_up_to_date" };
  } catch (error) {
    // エラー時は安全側（アーカイブしない）
    return {
      shouldArchive: false,
      reason: `error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// メイド名マッピング（日本語表示用）
const MAID_NAMES: Record<string, string> = {
  emma: "エマ",
  sophia: "ソフィア",
  lily: "リリー",
  rose: "ローズ",
  alice: "アリス",
  may: "メイ",
  flora: "フローラ",
  luna: "ルナ",
};

/**
 * テンプレートファイルを読み込んでプレースホルダーを置換
 */
async function loadAndFillTemplate(
  projectPath: string,
  agentId: string,
  taskId: string,
  title: string,
  description: string
): Promise<string> {
  const templateFilePath = path.join(
    projectPath, ".maid-agent", "system", "data", "reports", "current_template.md"
  );
  const maidName = MAID_NAMES[agentId] || agentId;

  try {
    if (await fileExists(templateFilePath)) {
      const template = await fs.readFile(templateFilePath, "utf-8");
      return template
        .replace(/\{\{MAID_NAME\}\}/g, maidName)
        .replace(/\{\{TASK_ID\}\}/g, taskId)
        .replace(/\{\{TITLE\}\}/g, title)
        .replace(/\{\{DESCRIPTION\}\}/g, description);
    }
  } catch {
    // テンプレート読み込み失敗時はフォールバック
  }

  // フォールバック: ハードコードテンプレート
  return `# 作業報告 - ${maidName}

## タスク情報
- task_id: ${taskId}
- title: ${title}
- description: ${description}
- status: (作業中)
- completed_at:

## 作業内容


## 変更ファイル


## 問題・注意点


## 切り出し確認
extraction_check:
  required: false
  extracted_to: ""

## スキル化候補
skill_candidate:
  found: false

## 改善提案
improvement_proposal:
  found: false
`;
}

/**
 * maid yaml を tasks.yaml の内容で同期する
 */
async function syncMaidYaml(
  projectPath: string,
  task: Task,
  params: UpdateTaskParams,
  prevAssignees: Assignee[]
): Promise<boolean> {
  const maidDataDir = path.join(projectPath, ".maid-agent", "system", "data", "maid");
  let synced = false;

  // 現在の assignees に対して同期
  for (const assignee of task.assignees) {
    const maidYamlPath = path.join(maidDataDir, `${assignee.agentId}.yaml`);

    try {
      await withFileLock(maidYamlPath, async () => {
        const maidYaml = await readYamlFile<TaskYaml>(maidYamlPath);

        // tasks.yaml → maid yaml 同期
        // status 変換: "pending"/"cancelled" → "idle"、それ以外はそのまま
        const STATUS_MAP: Record<string, MaidTaskStatus> = {
          pending: "idle",
          cancelled: "idle",
        };
        const maidStatus: MaidTaskStatus = STATUS_MAP[task.status] ?? task.status as MaidTaskStatus;

        maidYaml.task_id = `task-${task.id}`;
        maidYaml.title = task.title;
        maidYaml.description = params.description ?? task.description;
        maidYaml.target_path = params.targetPath ?? task.targetPath ?? null;
        maidYaml.status = maidStatus;
        maidYaml.substatus = task.substatus;
        maidYaml.assigned_at = task.assignedAt;
        maidYaml.started_at = task.startedAt;
        maidYaml.completed_at = task.completedAt;
        maidYaml.completion_summary = task.summary;

        await writeYamlFile(maidYamlPath, maidYaml);
        synced = true;
      });
    } catch {
      // maid yaml 同期失敗は握りつぶす
    }
  }

  // 除外されたメイドを idle にリセット
  const currentAgentIds = new Set(task.assignees.map((a) => a.agentId));
  const removedAssignees = prevAssignees.filter((a) => !currentAgentIds.has(a.agentId));

  for (const removed of removedAssignees) {
    const maidYamlPath = path.join(maidDataDir, `${removed.agentId}.yaml`);

    try {
      await withFileLock(maidYamlPath, async () => {
        const maidYaml = await readYamlFile<TaskYaml>(maidYamlPath);

        maidYaml.task_id = null;
        maidYaml.title = null;
        maidYaml.description = null;
        maidYaml.target_path = null;
        maidYaml.status = "idle";
        maidYaml.substatus = null;
        maidYaml.assigned_at = null;
        maidYaml.started_at = null;
        maidYaml.completed_at = null;
        maidYaml.completion_summary = null;

        await writeYamlFile(maidYamlPath, maidYaml);
        synced = true;
      });
    } catch {
      // idle リセット失敗は握りつぶす
    }
  }

  return synced;
}

/**
 * レポートをアーカイブする（completed時）
 *
 * @param projectPath - プロジェクトルートパス
 * @param task - タスク情報
 * @param agentId - エージェントID
 * @param skipTimestampCheck - タイムスタンプチェックをスキップ（初回completed時）
 */
export async function archiveReport(
  projectPath: string,
  task: Task,
  agentId: string,
  skipTimestampCheck: boolean = false
): Promise<{
  archived: boolean;
  archivePath?: string;
  skipped?: boolean;
  reason?: string;
}> {
  const currentPath = path.join(
    projectPath, ".maid-agent", "system", "data", "reports", `current_${agentId}.md`
  );
  const config = await loadConfig();
  const maxLength = config.formatter.sanitize_description_max_length;
  const titleForFilename = sanitizeDescription(task.title, maxLength);
  const archivePath = path.join(
    projectPath, ".maid-agent", "master", "reports",
    `task-${task.id}-${agentId}-${titleForFilename}.md`
  );

  const expectedTaskId = `task-${task.id}`;
  const checkResult = await shouldArchiveReport(
    currentPath,
    archivePath,
    expectedTaskId,
    skipTimestampCheck
  );

  if (!checkResult.shouldArchive) {
    return {
      archived: false,
      archivePath,
      skipped: true,
      reason: checkResult.reason,
    };
  }

  if (await fileExists(currentPath)) {
    const copied = await copyFile(currentPath, archivePath);
    if (copied) {
      return { archived: true, archivePath, reason: checkResult.reason };
    }
  }

  return { archived: false, reason: "copy_failed" };
}

/**
 * レポートテンプレートを初期化する（assigned時）
 */
async function initReportTemplate(
  projectPath: string,
  task: Task,
  params: UpdateTaskParams,
  agentId: string
): Promise<boolean> {
  const currentReportPath = path.join(
    projectPath, ".maid-agent", "system", "data", "reports", `current_${agentId}.md`
  );
  const taskIdForTemplate = `task-${task.id}`;
  const description = params.description ?? task.description;

  const content = await loadAndFillTemplate(
    projectPath, agentId, taskIdForTemplate, task.title, description
  );
  const written = await writeTextFile(currentReportPath, content);
  return written;
}

/**
 * 全副作用を実行する
 *
 * executeUpdateTask の withTasksLock 外で呼び出される。
 * 各副作用は try-catch で保護され、失敗しても全体は成功扱い。
 */
export async function executeSideEffects(
  projectPath: string,
  task: Task,
  params: UpdateTaskParams,
  prevStatus: string,
  prevAssignees: Assignee[]
): Promise<SideEffectResults> {
  const result: SideEffectResults = {};

  // 副作用1: syncMaidYaml
  // - assignees が変更された場合
  // - status が変更された場合
  // - update_status 経由の場合（agentId が設定されている場合は常に同期）
  //   ※ tasks.yaml のステータスと maid YAML のステータスが乖離している可能性があるため
  const assigneesChanged = params.assignees !== undefined;
  const statusChanged = params.status !== undefined && params.status !== prevStatus;
  const forceSync = params.agentId !== undefined && params.status !== undefined;

  if (assigneesChanged || statusChanged || forceSync) {
    try {
      const synced = await syncMaidYaml(projectPath, task, params, prevAssignees);
      if (synced) {
        result.maidYamlSynced = true;
      }
    } catch {
      // 握りつぶす
    }
  }

  // 副作用2: archiveReport（completed時）
  if (params.status === "completed") {
    const isFirstComplete = prevStatus !== "completed";

    try {
      // params.agentId があればそれを優先、なければ全 assignees
      const targetAgentIds = params.agentId
        ? [params.agentId]
        : task.assignees.map((a) => a.agentId);

      for (const agentId of targetAgentIds) {
        const archiveResult = await archiveReport(
          projectPath,
          task,
          agentId,
          isFirstComplete  // 初回はタイムスタンプチェックをスキップ
        );

        if (archiveResult.archived) {
          result.reportArchived = true;
          result.archivePath = archiveResult.archivePath;
        } else if (archiveResult.skipped) {
          result.reportArchiveSkipped = true;
          result.archiveSkipReason = archiveResult.reason;

          // タスクID不一致の場合は警告（ログ出力）
          // ログ: "報告書のタスクIDが一致しません。再アーカイブをスキップしました。"
        }
      }
    } catch {
      // 握りつぶす
    }
  }

  // 副作用3: initReportTemplate（status が assigned に変更された場合）
  if (params.status === "assigned" && prevStatus !== "assigned") {
    try {
      const targetAgentIds = task.assignees.map((a) => a.agentId);

      for (const agentId of targetAgentIds) {
        const initialized = await initReportTemplate(projectPath, task, params, agentId);
        if (initialized) {
          result.reportTemplatized = true;
        }
      }
    } catch {
      // 握りつぶす
    }
  }

  return result;
}
