/**
 * タスクリストHTML生成
 * generateTaskHtml() - SSEエンドポイントとJSON APIエンドポイントの両方で使用
 */
import path from "path";
import { convertMarkdownToHtml, escapeHtml, linkifyProjectPaths } from "../markdown-utils.js";
import { formatDateJstShort, formatRelativeTime } from "../utils/yaml-helper.js";
/**
 * 報告書リンクのHTMLを生成する共通関数
 * dashboard-html.ts と task-html.ts の両方から使用
 */
export function generateReportLinksHtml(reportPaths, projectPath) {
    if (!reportPaths || reportPaths.length === 0)
        return "";
    return reportPaths.map((p) => {
        const fileName = p.split("/").pop() || p;
        // 相対パスを絶対パスに変換（WSLパスはそのまま保持）
        const absolutePath = p.startsWith("/") || p.startsWith("C:") || p.startsWith("c:")
            ? p
            : path.join(projectPath, p);
        // ブラウザ用: /file?path=... エンドポイント（&project= で報告書内パスリンク化を有効化）
        const fileViewUrl = `/file?path=${encodeURIComponent(absolutePath)}&project=${encodeURIComponent(projectPath)}`;
        // VSCode Webview用: addEventListenerでpostMessage、ブラウザではhref遷移
        return `<a href="${fileViewUrl}" class="report-link" data-path="${escapeHtml(absolutePath)}" title="${escapeHtml(p)}">${escapeHtml(fileName)}</a>`;
    }).join(", ");
}
/**
 * タスクリストのHTMLを生成するヘルパー関数
 * SSEエンドポイントとJSON APIエンドポイントの両方で使用
 */
export function generateTaskHtml(tasks, type, projectPath, scheme = "vscode") {
    const priorityClass = {
        high: "priority-high",
        medium: "priority-medium",
        low: "priority-low",
    };
    if (tasks.length === 0) {
        return '<div class="empty-message">なし</div>';
    }
    return tasks.map((task) => {
        const title = task.title || task.description?.split("\n")[0].substring(0, 50) || "";
        const assigneeStr = task.assignees?.map((a) => a.agentId).join(", ") || "";
        const createdDate = task.createdAt
            ? formatDateJstShort(new Date(task.createdAt))
            : "";
        const completedDate = task.completedAt
            ? formatDateJstShort(new Date(task.completedAt))
            : "";
        if (type === "pending") {
            const relativeCreatedTime = formatRelativeTime(task.createdAt);
            return `<div class="task-item ${priorityClass[task.priority] || ""}" data-priority="${task.priority}" data-id="${task.id}" data-updated="${task.updatedAt || task.createdAt}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        <span class="task-priority">[${task.priority}]</span>
        ${relativeCreatedTime ? `<span class="task-date">${relativeCreatedTime}</span>` : ""}
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">作成日時:</span><span class="task-detail-value">${createdDate}</span></div>
        </div>
      </div>`;
        }
        else if (type === "working") {
            const elapsedTime = task.startedAt ? formatRelativeTime(task.startedAt) : "";
            return `<div class="task-item" data-priority="${task.priority || ''}" data-assignee="${assigneeStr}" data-id="${task.id}" data-updated="${task.updatedAt || task.createdAt}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        <span class="task-assignee">${assigneeStr ? `👤 ${assigneeStr}` : ""}</span>
        ${elapsedTime ? `<span class="task-date">🕐 ${elapsedTime}</span>` : ""}
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
          <div class="task-detail-row"><span class="task-detail-label">ステータス:</span><span class="task-detail-value">${task.status}</span></div>
        </div>
      </div>`;
        }
        else if (type === "completed") {
            const reportLinksHtml = generateReportLinksHtml(task.reportPaths, projectPath);
            const reviewedClass = task.reviewed ? " reviewed" : "";
            const reviewedActive = task.reviewed ? " active" : "";
            const starredActive = task.starred ? " active" : "";
            const relativeCompletedTime = formatRelativeTime(task.completedAt);
            return `<div class="task-item completed${reviewedClass}" data-id="${task.id}" data-updated="${task.updatedAt || task.completedAt || task.createdAt}">
        <div class="task-main-row">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          <span class="task-right-group">
            ${assigneeStr ? `<span class="task-date">${assigneeStr}</span>` : ""}
            <span class="task-date" title="${relativeCompletedTime}">${completedDate}</span>
            <button class="task-action-btn review-btn${reviewedActive}" data-task-id="${task.id}" data-new-value="${!task.reviewed}" title="確認済み">✔</button>
            <button class="task-action-btn star-btn${starredActive}" data-task-id="${task.id}" data-new-value="${!task.starred}" title="スター">★</button>
          </span>
        </div>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
          ${task.summary ? `<div class="task-detail-row"><span class="task-detail-label">結果:</span><span class="task-detail-value task-summary-text">${escapeHtml(task.summary)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
          <div class="task-detail-row"><span class="task-detail-label">完了日時:</span><span class="task-detail-value">${completedDate}</span></div>
          ${reportLinksHtml ? `<div class="task-detail-row"><span class="task-detail-label">報告書:</span><span class="task-detail-value task-report-links">${reportLinksHtml}</span></div>` : ""}
        </div>
      </div>`;
        }
        else if (type === "blocked") {
            const substatusHtml = task.substatus
                ? `<div class="task-substatus">⚠️ ${escapeHtml(task.substatus)}</div>`
                : "";
            return `<div class="task-item blocked-item" data-priority="${task.priority || ''}" data-assignee="${assigneeStr}" data-id="${task.id}">
        <div class="task-main-row">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          <span class="task-assignee">${assigneeStr ? `👤 ${assigneeStr}` : ""}</span>
        </div>
        ${substatusHtml}
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
          <div class="task-detail-row"><span class="task-detail-label">ブロック理由:</span><span class="task-detail-value">${task.substatus ? escapeHtml(task.substatus) : "不明"}</span></div>
        </div>
      </div>`;
        }
        else if (type === "action_required") {
            const substatusHtml = task.substatus
                ? `<span class="task-substatus-inline">🔴 ${escapeHtml(task.substatus)}</span>`
                : '<span class="task-substatus-inline">🔴 ご主人様判断待ち</span>';
            return `<div class="task-item action-required-item" data-id="${task.id}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        ${substatusHtml}
        <span class="task-assignee">${assigneeStr ? `👤 ${assigneeStr}` : ""}</span>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">ステータス:</span><span class="task-detail-value">${task.status}</span></div>
          ${assigneeStr ? `<div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr}</span></div>` : ""}
        </div>
      </div>`;
        }
        else if (type === "master_review") {
            const completedDate = task.completedAt
                ? formatDateJstShort(new Date(task.completedAt))
                : "";
            return `<div class="task-item action-required-item" data-id="${task.id}">
        <div class="task-main-row">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          <span class="task-date">${completedDate}</span>
        </div>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
          ${task.summary ? `<div class="task-detail-row"><span class="task-detail-label">結果:</span><span class="task-detail-value task-summary-text">${escapeHtml(task.summary)}</span></div>` : ""}
        </div>
      </div>`;
        }
        else if (type === "skill_candidate") {
            return `<div class="task-item skill-item" data-id="${task.id}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
        </div>
      </div>`;
        }
        else if (type === "improvement") {
            return `<div class="task-item improvement-item" data-id="${task.id}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${linkifyProjectPaths(convertMarkdownToHtml(task.description), projectPath)}</span></div>` : ""}
        </div>
      </div>`;
        }
        return "";
    }).join("\n");
}
/**
 * 「対応待ち」セクションのHTMLを結合生成
 * masterWaiting（アクティブ）と masterReview（確認待ち）を適切に結合し、
 * 両方空の場合は「なし」を1つだけ表示する
 */
export function composeMasterWaitingHtml(masterWaitingTasks, masterReviewTasks, projectPath, scheme) {
    if (masterWaitingTasks.length === 0 && masterReviewTasks.length === 0) {
        return '<div class="empty-message">なし</div>';
    }
    let result = "";
    if (masterWaitingTasks.length > 0) {
        result += `<div class="subsection-header">アクティブ (${masterWaitingTasks.length})</div>`;
        result += generateTaskHtml(masterWaitingTasks, "action_required", projectPath, scheme);
    }
    if (masterReviewTasks.length > 0) {
        result += `<div class="subsection-header">確認待ち (${masterReviewTasks.length})</div>`;
        result += generateTaskHtml(masterReviewTasks, "master_review", projectPath, scheme);
    }
    return result;
}
