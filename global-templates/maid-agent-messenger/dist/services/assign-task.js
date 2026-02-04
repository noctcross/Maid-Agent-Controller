/**
 * assign_task ビジネスロジック
 *
 * メイドにタスクを割り当てる処理
 */
import path from "path";
import { readYamlFile, writeYamlFile, getTimestamp, writeTextFile, fileExists, } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
import * as fs from "fs/promises";
// メイド名マッピング（日本語表示用）
const MAID_NAMES = {
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
async function loadAndFillTemplate(templateDirPath, agentId, taskId, description) {
    const templateFilePath = path.join(templateDirPath, "current_template.md");
    const maidName = MAID_NAMES[agentId] || agentId;
    try {
        // テンプレートファイルを読み込み
        if (await fileExists(templateFilePath)) {
            const template = await fs.readFile(templateFilePath, "utf-8");
            // プレースホルダーを置換
            return template
                .replace(/\{\{MAID_NAME\}\}/g, maidName)
                .replace(/\{\{TASK_ID\}\}/g, taskId)
                .replace(/\{\{DESCRIPTION\}\}/g, description);
        }
    }
    catch {
        // テンプレート読み込み失敗時はフォールバック
    }
    // フォールバック: ハードコードテンプレート
    return `# 作業報告 - ${maidName}

## タスク情報
- task_id: ${taskId}
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
 * タスクを割り当て
 */
export async function executeAssignTask(params) {
    const { queueMaidPath, currentReportsPath, templatePath, taskId, targetAgent, description, targetPath } = params;
    const filePath = path.join(queueMaidPath, `${targetAgent}.yaml`);
    const timestamp = getTimestamp();
    return await withFileLock(filePath, async () => {
        // YAML読み込み
        const task = await readYamlFile(filePath);
        // 作業中の場合は警告
        if (task.status === "working") {
            return {
                success: false,
                assigned_to: targetAgent,
                task_id: task.task_id || "",
                error: `${targetAgent} は現在作業中です（${task.task_id}）`,
            };
        }
        // 新しいタスクを設定
        task.task_id = taskId;
        task.description = description;
        task.target_path = targetPath || null;
        task.status = "assigned";
        task.substatus = null;
        task.assigned_at = timestamp;
        task.started_at = null;
        task.completed_at = null;
        // YAML書き込み
        await writeYamlFile(filePath, task);
        // currentレポートを初期化（テンプレートから生成）
        // 作業中レポート: .maid-agent/reports/current_{agentId}.md
        const currentReportPath = path.join(currentReportsPath, `current_${targetAgent}.md`);
        const content = await loadAndFillTemplate(templatePath, targetAgent, taskId, description);
        await writeTextFile(currentReportPath, content);
        return {
            success: true,
            assigned_to: targetAgent,
            task_id: taskId,
        };
    });
}
