/**
 * タスク作成操作
 *
 * task-crud.ts から分離した create 操作を提供
 *
 * @module task-crud-create
 */
import { getTimestamp } from "../utils/yaml-helper.js";
import { withTasksLock } from "./task-core.js";
import { normalizeParentId, isSameTaskId } from "../utils/task-id.js";
/**
 * タスク作成
 */
export async function executeCreateTask(projectPath, params) {
    return withTasksLock(projectPath, async (data) => {
        let taskId;
        let reopenedParent;
        const reopenedAncestors = [];
        // parentIdを正規化（"49" -> "049" 等）
        const normalizedParentId = params.parentId ? normalizeParentId(params.parentId) : null;
        if (normalizedParentId) {
            // サブタスクの場合: 親ID-連番
            // 正規化したparentIdで比較して兄弟タスクを取得
            const siblings = data.tasks.filter((t) => isSameTaskId(t.parentId, normalizedParentId));
            // 既存の兄弟タスクから最大連番を取得（siblings.lengthではなく最大値+1）
            const maxSeq = siblings.reduce((max, t) => {
                const parts = String(t.id).split("-");
                const lastPart = parseInt(parts[parts.length - 1], 10);
                return isNaN(lastPart) ? max : Math.max(max, lastPart);
            }, 0);
            const nextSeq = maxSeq + 1;
            taskId = `${normalizedParentId}-${nextSeq}`;
            // 祖先タスクの自動再オープン
            let currentParentId = normalizedParentId;
            while (currentParentId) {
                const ancestorTask = data.tasks.find((t) => isSameTaskId(t.id, currentParentId));
                if (!ancestorTask)
                    break;
                let ancestorUpdated = false;
                if (ancestorTask.mainStatus === "closed") {
                    ancestorTask.mainStatus = "open";
                    ancestorTask.subStatus = "working";
                    ancestorTask.status = "working";
                    ancestorTask.updatedAt = getTimestamp();
                    ancestorUpdated = true;
                }
                if (ancestorTask.archived === true) {
                    ancestorTask.archived = false;
                    ancestorTask.updatedAt = getTimestamp();
                    ancestorUpdated = true;
                }
                if (ancestorTask.category === "improvement") {
                    ancestorTask.category = "task";
                    ancestorTask.updatedAt = getTimestamp();
                    ancestorUpdated = true;
                }
                if (ancestorUpdated) {
                    reopenedAncestors.push({ ...ancestorTask });
                    if (!reopenedParent) {
                        reopenedParent = { ...ancestorTask };
                    }
                }
                currentParentId = ancestorTask.parentId ? normalizeParentId(ancestorTask.parentId) : null;
            }
        }
        else {
            // メインタスクの場合: 連番（3桁ゼロ埋め）
            data.lastTaskNumber += 1;
            taskId = String(data.lastTaskNumber).padStart(3, "0");
        }
        const now = getTimestamp();
        const taskType = params.type || "step";
        const hasBlockers = params.blockedBy && params.blockedBy.length > 0;
        const initialV2Substatus = hasBlockers ? "waiting" : "pending";
        const newTask = {
            id: taskId,
            parentId: normalizedParentId,
            title: params.title,
            description: params.description || "",
            priority: params.priority || "medium",
            status: "pending",
            substatus: null,
            category: params.category || "task",
            assignees: [],
            targetPath: null,
            createdAt: now,
            updatedAt: now,
            assignedAt: null,
            startedAt: null,
            completedAt: null,
            reportPaths: [],
            summary: null,
            type: taskType,
            mainStatus: "open",
            subStatus: initialV2Substatus,
            size: taskType === "task" ? (params.size || "standard") : undefined,
            tentative: taskType === "task" ? (params.tentative || false) : undefined,
            blockedBy: params.blockedBy || [],
            artifacts: [],
            reviewStatus: undefined,
        };
        data.tasks.push(newTask);
        return { data, result: { taskId, task: newTask, reopenedParent, reopenedAncestors: reopenedAncestors.length > 0 ? reopenedAncestors : undefined } };
    });
}
