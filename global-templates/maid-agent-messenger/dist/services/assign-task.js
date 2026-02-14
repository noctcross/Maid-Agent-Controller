/**
 * assign_task ビジネスロジック
 *
 * メイドにタスクを割り当てる処理。
 * unified-task-state-gateway: ガード条件のみ担当し、
 * executeUpdateTask に全処理を委譲する。
 */
import path from "path";
import { readYamlFile } from "../utils/yaml-helper.js";
import { withFileLock } from "../utils/file-lock.js";
import { executeUpdateTask, executeGetTask } from "./task-manager.js";
import { normalizeTaskId } from "../utils/task-id.js";
/**
 * タスクを割り当て
 */
export async function executeAssignTask(params) {
    const { queueMaidPath, taskId, targetAgent, title, description, targetPath, force } = params;
    const filePath = path.join(queueMaidPath, `${targetAgent}.yaml`);
    // ガード条件: maid yaml を読んで作業中かチェック
    // ※ ロックはガードチェックのみで解放する。executeUpdateTask の副作用
    //    (syncMaidYaml) が同じ maid yaml をロックするため、ネストするとデッドロックになる。
    const maidTask = await withFileLock(filePath, async () => {
        return await readYamlFile(filePath);
    });
    if (maidTask.status === "working") {
        return {
            success: false,
            assigned_to: targetAgent,
            task_id: maidTask.task_id || "",
            error: `${targetAgent} は現在作業中です（${maidTask.task_id}）`,
        };
    }
    // executeUpdateTask に全処理を委譲（maid yaml ロック解放済み）
    const projectPath = path.resolve(queueMaidPath, "..", "..", "..", "..");
    const taskIdNormalized = normalizeTaskId(taskId);
    // 既存 assignees チェック
    const taskResult = await executeGetTask(projectPath, { taskId: taskIdNormalized });
    if (taskResult.task && taskResult.task.assignees && taskResult.task.assignees.length > 0) {
        if (!force) {
            const existingAgents = taskResult.task.assignees.map(a => a.agentId).join(", ");
            return {
                success: false,
                assigned_to: targetAgent,
                task_id: taskId,
                error: `タスク #${taskId} には既に ${existingAgents} が割り当てられています。上書きする場合は --force オプション（または force: true パラメータ）を使用してください。`,
            };
        }
        // force=true の場合は上書きを許可（既存ロジックへ進む）
    }
    const result = await executeUpdateTask(projectPath, {
        taskId: taskIdNormalized,
        status: "assigned",
        assignees: [{ agentId: targetAgent, role: null, subTaskId: null }],
        description: description,
        targetPath: targetPath,
    });
    if (!result.success) {
        return {
            success: false,
            assigned_to: targetAgent,
            task_id: taskId,
            error: "tasks.yaml更新失敗",
        };
    }
    return {
        success: true,
        assigned_to: targetAgent,
        task_id: taskId,
    };
}
