/**
 * タスクリストHTML生成
 * generateTaskHtml() - SSEエンドポイントとJSON APIエンドポイントの両方で使用
 */

import path from "path";
import { convertMarkdownToHtml, escapeHtml } from "../markdown-utils.js";
import { formatDateJstShort } from "../utils/yaml-helper.js";

/**
 * タスクリストのHTMLを生成するヘルパー関数
 * SSEエンドポイントとJSON APIエンドポイントの両方で使用
 */
export function generateTaskHtml(tasks: any[], type: string, projectPath: string, scheme: string = "vscode"): string {
  const priorityClass: Record<string, string> = {
    high: "priority-high",
    medium: "priority-medium",
    low: "priority-low",
  };

  if (tasks.length === 0) {
    return '<div class="empty-message">なし</div>';
  }

  return tasks.map((task) => {
    const title = task.title || task.description?.split("\n")[0].substring(0, 50) || "";
    const assigneeStr = task.assignees?.map((a: any) => a.agentId).join(", ") || "";
    const createdDate = task.createdAt
      ? formatDateJstShort(new Date(task.createdAt))
      : "";
    const completedDate = task.completedAt
      ? formatDateJstShort(new Date(task.completedAt))
      : "";

    if (type === "pending") {
      return `<div class="task-item ${priorityClass[task.priority] || ""}" data-priority="${task.priority}" data-id="${task.id}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        <span class="task-priority">[${task.priority}]</span>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${convertMarkdownToHtml(task.description)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">作成日時:</span><span class="task-detail-value">${createdDate}</span></div>
        </div>
      </div>`;
    } else if (type === "working") {
      return `<div class="task-item" data-priority="${task.priority || ''}" data-assignee="${assigneeStr}" data-id="${task.id}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        <span class="task-assignee">${assigneeStr ? `👤 ${assigneeStr}` : ""}</span>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${convertMarkdownToHtml(task.description)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
          <div class="task-detail-row"><span class="task-detail-label">ステータス:</span><span class="task-detail-value">${task.status}</span></div>
        </div>
      </div>`;
    } else if (type === "completed") {
      const reportLinksHtml = task.reportPaths?.length > 0
        ? task.reportPaths.map((p: string) => {
            const fileName = p.split("/").pop() || p;
            let absolutePath = p.startsWith("/") || p.startsWith("C:") || p.startsWith("c:")
              ? p
              : path.join(projectPath, p);
            // WSLパス→Windowsパス変換
            let windowsPath = absolutePath;
            if (absolutePath.startsWith("/mnt/")) {
              const match = absolutePath.match(/^\/mnt\/([a-z])\/(.*)/);
              if (match) {
                windowsPath = `${match[1].toUpperCase()}:/${match[2]}`;
              }
            }
            windowsPath = windowsPath.replace(/^([a-z]):/, (_, letter) => `${letter.toUpperCase()}:`);
            // ブラウザ用: /file?path=... エンドポイント
            const fileViewUrl = `/file?path=${encodeURIComponent(windowsPath)}`;
            // VSCode Webview用: onclick でpostMessage、ブラウザではリンク先へ遷移
            return `<a href="${fileViewUrl}" class="report-link" data-path="${escapeHtml(windowsPath)}" onclick="return openFile(this, '${escapeHtml(windowsPath.replace(/'/g, "\\'"))}')" title="${escapeHtml(p)}">${escapeHtml(fileName)}</a>`;
          }).join(", ")
        : "";
      const reviewedClass = task.reviewed ? " reviewed" : "";
      const reviewedActive = task.reviewed ? " active" : "";
      const starredActive = task.starred ? " active" : "";
      return `<div class="task-item completed${reviewedClass}" data-id="${task.id}">
        <div class="task-main-row">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          <span class="task-right-group">
            ${assigneeStr ? `<span class="task-date">${assigneeStr}</span>` : ""}
            <span class="task-date">${completedDate}</span>
            <button class="task-action-btn review-btn${reviewedActive}" onclick="toggleReview(event, '${task.id}', ${!task.reviewed})" title="確認済み">✔</button>
            <button class="task-action-btn star-btn${starredActive}" onclick="toggleStar(event, '${task.id}', ${!task.starred})" title="スター">★</button>
          </span>
        </div>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${convertMarkdownToHtml(task.description)}</span></div>` : ""}
          ${task.summary ? `<div class="task-detail-row"><span class="task-detail-label">結果:</span><span class="task-detail-value task-summary-text">${escapeHtml(task.summary)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
          <div class="task-detail-row"><span class="task-detail-label">完了日時:</span><span class="task-detail-value">${completedDate}</span></div>
          ${reportLinksHtml ? `<div class="task-detail-row"><span class="task-detail-label">報告書:</span><span class="task-detail-value task-report-links">${reportLinksHtml}</span></div>` : ""}
        </div>
      </div>`;
    } else if (type === "blocked") {
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
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${convertMarkdownToHtml(task.description)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
          <div class="task-detail-row"><span class="task-detail-label">ブロック理由:</span><span class="task-detail-value">${task.substatus ? escapeHtml(task.substatus) : "不明"}</span></div>
        </div>
      </div>`;
    } else if (type === "action_required") {
      const substatusHtml = task.substatus
        ? `<span class="task-substatus-inline">⚠️ ${escapeHtml(task.substatus)}</span>`
        : "";
      return `<div class="task-item action-required-item" data-id="${task.id}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        ${substatusHtml}
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${convertMarkdownToHtml(task.description)}</span></div>` : ""}
        </div>
      </div>`;
    }

    return "";
  }).join("\n");
}
