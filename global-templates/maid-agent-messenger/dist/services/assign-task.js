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
import { executeUpdateTask } from "./task-manager.js";
import { normalizeTaskId } from "../utils/task-id.js";
/**
 * タスクを割り当て
 */
export async function executeAssignTask(params) {
    const { queueMaidPath, taskId, targetAgent, title, description, targetPath } = params;
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
