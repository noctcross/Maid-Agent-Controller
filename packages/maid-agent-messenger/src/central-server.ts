/**
 * Central MCP Server (Streamable HTTP Transport)
 *
 * 中央集約サーバー（ユーザーフォルダ版）
 * - MCP Streamable HTTP プロトコル対応（Claude Code から直接接続可能）
 * - 複数のClaude Codeセッションから共有で使用
 * - プロジェクトパスはヘッダー（X-Maid-Project-Path）で指定
 * - pm2で常時稼働させる
 *
 * メモリ効率: 700MB → 90MB（87%削減）
 */

import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import path from "path";
import * as fs from "fs/promises";
import { loadConfig, getServerUrl } from "./utils/config-loader.js";
import { getTimestamp } from "./utils/yaml-helper.js";
import {
  MAID_IDS,
  UPDATABLE_STATUSES,
  type AgentStatus,
} from "./types/index.js";

// サービス層からビジネスロジックをインポート
import {
  executeGetMyTask,
  executeUpdateStatus,
  executeAssignTask,
  executeGetTeamStatus,
  // タスク管理サービス（Phase 1 + Phase 3）
  executeCreateTask,
  executeGetTask,
  executeListTasks,
  executeUpdateTask,
  type TaskStatus,
} from "./services/index.js";

const app = express();
app.use(express.json());

// リクエストログ
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ========================================
// セッション管理
// ========================================

interface SessionInfo {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  projectPath: string;
}

// セッションID -> SessionInfo のマップ
const sessions = new Map<string, SessionInfo>();

// ========================================
// パスヘルパー関数
// ========================================

function getQueueMaidPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "system", "data", "maid");
}

// 作業中レポート: .maid-agent/system/data/reports/ (中間ファイル)
function getCurrentReportsPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "system", "data", "reports");
}

// 完了レポート: .maid-agent/master/reports/ (アーカイブ先)
function getArchiveReportsPath(projectPath: string): string {
  return path.join(projectPath, ".maid-agent", "master", "reports");
}

// ========================================
// HTMLダッシュボード生成
// ========================================

interface DashboardData {
  projectPath: string;
  timestamp: string;
  pending: Array<{ id: string; title: string; description: string; priority: string; createdAt: string }>;
  working: Array<{ id: string; title: string; description: string; status: string; assignees: Array<{ agentId: string }>; priority: string }>;
  blocked: Array<{ id: string; title: string; description: string; substatus: string | null; assignees: Array<{ agentId: string }>; priority: string }>;
  recentCompleted: Array<{ id: string; title: string; description: string; completedAt: string | null; summary: string | null; assignees: Array<{ agentId: string }>; reportPaths: string[] }>;
  actionRequired: Array<{ id: string; title: string; description: string; substatus: string | null }>;
  skillCandidates: Array<{ id: string; title: string; description: string }>;
  improvements: Array<{ id: string; title: string; description: string }>;
  teamStatus: AgentStatus[];
  // Phase 2: 統計情報
  stats: {
    pendingCount: number;
    workingCount: number;
    blockedCount: number;
    completedTodayCount: number;
  };
}

function generateDashboardHtml(data: DashboardData, editorScheme: string = "vscode"): string {
  const { projectPath, timestamp, pending, working, blocked, recentCompleted, actionRequired, skillCandidates, improvements, teamStatus, stats } = data;

  // ステータスアイコンマップ
  const statusIcon: Record<string, string> = {
    working: "🔧",
    completed: "✅",
    assigned: "📋",
    blocked: "🚫",
    idle: "💤",
    unknown: "❓",
    error: "⚠️",
  };

  // 優先度カラーマップ
  const priorityClass: Record<string, string> = {
    high: "priority-high",
    medium: "priority-medium",
    low: "priority-low",
  };

  // Phase 2: 経過時間計算ヘルパー
  const formatElapsedTime = (startedAt: string | null | undefined): string => {
    if (!startedAt) return "";
    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  // チームステータスHTML生成（Phase 2: 詳細化）
  const teamStatusHtml = teamStatus
    .map((agent) => {
      const icon = statusIcon[agent.status] || "❓";
      const taskInfo = agent.task_id ? `[${agent.task_id}]` : "";
      const elapsedTime = agent.started_at ? formatElapsedTime(agent.started_at) : "";
      const taskDesc = agent.task_description ? escapeHtml(agent.task_description.substring(0, 30)) + (agent.task_description.length > 30 ? "..." : "") : "";
      const substatusInfo = agent.substatus ? `<span class="agent-substatus">⚠️ ${escapeHtml(agent.substatus)}</span>` : "";

      return `<div class="agent-status agent-${agent.status}" data-agent="${agent.id}" title="${taskDesc}">
        <div class="agent-main">
          <span class="agent-icon">${icon}</span>
          <span class="agent-name">${agent.id}</span>
          <span class="agent-task">${taskInfo}</span>
          ${elapsedTime ? `<span class="agent-elapsed">⏱️ ${elapsedTime}</span>` : ""}
        </div>
        ${substatusInfo}
        ${taskDesc ? `<div class="agent-task-desc">${taskDesc}</div>` : ""}
      </div>`;
    })
    .join("\n");

  // 待機中タスクHTML生成（title/description分離）
  const pendingHtml = pending.length > 0
    ? pending.map((task) => {
        const createdDate = task.createdAt
          ? new Date(task.createdAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "";
        // titleがなければdescriptionの先頭を使用（後方互換）
        const title = task.title || task.description.split("\n")[0].substring(0, 50);
        return `<div class="task-item ${priorityClass[task.priority] || ""}" data-priority="${task.priority}" data-id="${task.id}">
        <span class="task-id">${task.id}</span>
        <span class="task-title">${escapeHtml(title)}</span>
        <span class="task-priority">[${task.priority}]</span>
        <div class="task-detail">
          ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
          <div class="task-detail-row"><span class="task-detail-label">作成日時:</span><span class="task-detail-value">${createdDate}</span></div>
        </div>
      </div>`;
      }).join("\n")
    : '<div class="empty-message">なし</div>';

  // 進行中タスクHTML生成（title/description分離）
  const workingHtml = working.length > 0
    ? working.map((task) => {
        const assigneeStr = task.assignees.map((a) => a.agentId).join(", ");
        const title = task.title || task.description.split("\n")[0].substring(0, 50);
        return `<div class="task-item" data-priority="${task.priority || ''}" data-assignee="${assigneeStr}" data-id="${task.id}">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          <span class="task-assignee">${assigneeStr ? `👤 ${assigneeStr}` : ""}</span>
          <div class="task-detail">
            ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
            <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
            <div class="task-detail-row"><span class="task-detail-label">ステータス:</span><span class="task-detail-value">${task.status}</span></div>
          </div>
        </div>`;
      }).join("\n")
    : '<div class="empty-message">なし</div>';

  // 完了タスクHTML生成（title/description分離、展開機能追加、担当者・報告書リンク追加）
  const completedHtml = recentCompleted.length > 0
    ? recentCompleted.map((task) => {
        const completedDate = task.completedAt
          ? new Date(task.completedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "";
        const title = task.title || task.description.split("\n")[0].substring(0, 50);
        const assigneeStr = task.assignees.map((a) => a.agentId).join(", ");
        // 報告書リンクHTML生成（VSCode Webview + ブラウザ両対応）
        const reportLinksHtml = task.reportPaths.length > 0
          ? task.reportPaths.map((p) => {
              const fileName = p.split("/").pop() || p;
              // 相対パスを絶対パスに変換
              let absolutePath = p.startsWith("/") || p.startsWith("C:") || p.startsWith("c:")
                ? p
                : path.join(projectPath, p);
              // WSLパス(/mnt/c/...)をWindowsパス(C:/...)に変換
              let windowsPath = absolutePath;
              if (absolutePath.startsWith("/mnt/")) {
                const match = absolutePath.match(/^\/mnt\/([a-z])\/(.*)/);
                if (match) {
                  windowsPath = `${match[1].toUpperCase()}:/${match[2]}`;
                }
              }
              // ドライブレターを大文字に正規化
              windowsPath = windowsPath.replace(/^([a-z]):/, (_, letter) => `${letter.toUpperCase()}:`);
              // ブラウザ用: /file?path=... エンドポイント
              const fileViewUrl = `/file?path=${encodeURIComponent(windowsPath)}`;
              // VSCode Webview用: onclick でpostMessage、ブラウザではリンク先へ遷移
              return `<a href="${fileViewUrl}" class="report-link" data-path="${escapeHtml(windowsPath)}" onclick="return openFile(this, '${escapeHtml(windowsPath.replace(/'/g, "\\'"))}')" title="${escapeHtml(p)}">${escapeHtml(fileName)}</a>`;
            }).join(", ")
          : "";
        return `<div class="task-item completed" data-id="${task.id}">
          <div class="task-main-row">
            <span class="task-id">${task.id}</span>
            <span class="task-title">${escapeHtml(title)}</span>
            ${assigneeStr ? `<span class="task-date">${assigneeStr}</span>` : ""}
            <span class="task-date">${completedDate}</span>
          </div>
          <div class="task-detail">
            ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
            ${task.summary ? `<div class="task-detail-row"><span class="task-detail-label">結果:</span><span class="task-detail-value task-summary-text">${escapeHtml(task.summary)}</span></div>` : ""}
            <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
            <div class="task-detail-row"><span class="task-detail-label">完了日時:</span><span class="task-detail-value">${completedDate}</span></div>
            ${reportLinksHtml ? `<div class="task-detail-row"><span class="task-detail-label">報告書:</span><span class="task-detail-value task-report-links">${reportLinksHtml}</span></div>` : ""}
          </div>
        </div>`;
      }).join("\n")
    : '<div class="empty-message">なし</div>';

  // P2: blockedタスクHTML生成（title/description分離）
  const blockedHtml = blocked.length > 0
    ? blocked.map((task) => {
        const assigneeStr = task.assignees.map((a) => a.agentId).join(", ");
        const title = task.title || task.description.split("\n")[0].substring(0, 50);
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
            ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
            <div class="task-detail-row"><span class="task-detail-label">担当者:</span><span class="task-detail-value">${assigneeStr || "未割当"}</span></div>
            <div class="task-detail-row"><span class="task-detail-label">ブロック理由:</span><span class="task-detail-value">${task.substatus ? escapeHtml(task.substatus) : "不明"}</span></div>
          </div>
        </div>`;
      }).join("\n")
    : '<div class="empty-message">なし</div>';

  // P1: 特殊カテゴリHTML生成（title/description分離）
  const actionRequiredHtml = actionRequired.length > 0
    ? actionRequired.map((task) => {
        const title = task.title || task.description.split("\n")[0].substring(0, 50);
        const substatusHtml = task.substatus
          ? `<span class="task-substatus-inline">⚠️ ${escapeHtml(task.substatus)}</span>`
          : "";
        return `<div class="task-item action-required-item" data-id="${task.id}">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          ${substatusHtml}
          <div class="task-detail">
            ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
          </div>
        </div>`;
      }).join("\n")
    : '<div class="empty-message">なし</div>';

  const skillCandidatesHtml = skillCandidates.length > 0
    ? skillCandidates.map((task) => {
        const title = task.title || task.description.split("\n")[0].substring(0, 50);
        return `<div class="task-item skill-item" data-id="${task.id}">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          <div class="task-detail">
            ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
          </div>
        </div>`;
      }).join("\n")
    : '<div class="empty-message">なし</div>';

  const improvementsHtml = improvements.length > 0
    ? improvements.map((task) => {
        const title = task.title || task.description.split("\n")[0].substring(0, 50);
        return `<div class="task-item improvement-item" data-id="${task.id}">
          <span class="task-id">${task.id}</span>
          <span class="task-title">${escapeHtml(title)}</span>
          <div class="task-detail">
            ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
          </div>
        </div>`;
      }).join("\n")
    : '<div class="empty-message">なし</div>';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maid Agent Dashboard</title>
  <style>
    :root {
      --bg-color: #1e1e1e;
      --card-bg: #252526;
      --border-color: #3c3c3c;
      --text-color: #cccccc;
      --text-muted: #808080;
      --accent-color: #569cd6;
      --success-color: #4ec9b0;
      --warning-color: #dcdcaa;
      --error-color: #f14c4c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg-color);
      color: var(--text-color);
      padding: 20px;
      min-height: 100vh;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-color);
    }
    .header h1 { font-size: 1.5rem; }
    .header .timestamp { color: var(--text-muted); font-size: 0.85rem; }
    .project-path { color: var(--text-muted); font-size: 0.75rem; margin-top: 5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 500px) { .grid { grid-template-columns: 1fr; gap: 10px; } }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 15px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    .card-title { font-size: 1.1rem; font-weight: 600; }
    .card-count { background: var(--accent-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
    .task-item {
      padding: 8px 10px;
      margin: 5px 0;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      display: flex;
      gap: 10px;
      align-items: center;
      font-size: 0.9rem;
    }
    .task-id { color: var(--accent-color); font-weight: 500; min-width: 45px; flex-shrink: 0; }
    .task-title { flex: 1; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .task-desc { flex: 1; color: var(--text-muted); font-size: 0.85rem; }
    .task-priority { color: var(--text-muted); font-size: 0.75rem; flex-shrink: 0; }
    .task-assignee { color: var(--success-color); font-size: 0.75rem; flex-shrink: 0; }
    .task-status { color: var(--warning-color); font-size: 0.75rem; }
    .task-date { color: var(--text-muted); font-size: 0.75rem; flex-shrink: 0; }
    .task-summary-text { color: var(--success-color); }
    .priority-high { border-left: 3px solid var(--error-color); }
    .priority-medium { border-left: 3px solid var(--warning-color); }
    .priority-low { border-left: 3px solid var(--text-muted); }
    .completed { opacity: 0.7; }
    .empty-message { color: var(--text-muted); font-style: italic; padding: 10px; }
    .team-section { grid-column: 1 / -1; }
    .team-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .agent-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .agent-icon { font-size: 1.1rem; }
    .agent-name { font-weight: 500; }
    .agent-task { color: var(--text-muted); font-size: 0.8rem; }
    .agent-working { background: rgba(78, 201, 176, 0.1); border: 1px solid var(--success-color); }
    .agent-completed { background: rgba(86, 156, 214, 0.1); border: 1px solid var(--accent-color); }
    .agent-blocked { background: rgba(241, 76, 76, 0.1); border: 1px solid var(--error-color); }
    /* Phase 1: 特殊カテゴリ・blocked用スタイル */
    .special-section { grid-column: 1 / -1; }
    .special-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    @media (max-width: 768px) { .special-grid { grid-template-columns: 1fr; } }
    .card-action-required { border-left: 3px solid var(--error-color); }
    .card-blocked { border-left: 3px solid #ff6b6b; }
    .card-skill { border-left: 3px solid #9b59b6; }
    .card-improvement { border-left: 3px solid #f39c12; }
    .action-required-item { border-left: 3px solid var(--error-color); }
    .blocked-item { border-left: 3px solid #ff6b6b; }
    .skill-item { border-left: 3px solid #9b59b6; }
    .improvement-item { border-left: 3px solid #f39c12; }
    .task-main-row { display: flex; gap: 10px; align-items: center; }
    .task-summary { color: var(--success-color); font-size: 0.85rem; margin-top: 4px; padding-left: 70px; font-style: italic; }
    .task-substatus { color: var(--warning-color); font-size: 0.85rem; margin-top: 4px; padding-left: 70px; }
    .task-substatus-inline { color: var(--warning-color); font-size: 0.8rem; }
    .count-badge { background: var(--accent-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
    .count-badge-alert { background: var(--error-color); }
    .count-badge-warning { background: #ff6b6b; }
    .count-badge-purple { background: #9b59b6; }
    .count-badge-orange { background: #f39c12; }
    .collapsible-header { cursor: pointer; user-select: none; }
    .collapsible-header:hover { opacity: 0.8; }
    .collapsible-content { max-height: 300px; overflow-y: auto; }
    /* Phase 2: 統計セクション */
    .stats-section { grid-column: 1 / -1; }
    .stats-grid { display: flex; gap: 15px; flex-wrap: wrap; }
    .stat-item {
      flex: 1;
      min-width: 120px;
      padding: 15px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      text-align: center;
    }
    .stat-value { font-size: 2rem; font-weight: 700; color: var(--accent-color); }
    .stat-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 5px; }
    .stat-pending .stat-value { color: var(--warning-color); }
    .stat-working .stat-value { color: var(--success-color); }
    .stat-blocked .stat-value { color: var(--error-color); }
    .stat-completed .stat-value { color: var(--accent-color); }
    /* Phase 2: チーム詳細化 */
    .agent-status { flex-direction: column; align-items: flex-start; min-width: 150px; }
    .agent-main { display: flex; align-items: center; gap: 8px; width: 100%; }
    .agent-elapsed { color: var(--text-muted); font-size: 0.75rem; margin-left: auto; }
    .agent-substatus { color: var(--warning-color); font-size: 0.75rem; margin-top: 4px; }
    .agent-task-desc { color: var(--text-muted); font-size: 0.75rem; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
    /* Phase 2: ホバー詳細 */
    .task-item { position: relative; cursor: pointer; flex-wrap: wrap; }
    .task-item:hover { background: rgba(255,255,255,0.08); }
    .task-detail { display: none; width: 100%; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 0.85rem; }
    .task-item.expanded .task-detail { display: block; }
    .task-detail-row { display: flex; gap: 10px; margin: 4px 0; }
    .task-detail-label { color: var(--text-muted); min-width: 80px; }
    .task-detail-value { color: var(--text-color); }
    .task-report-links { display: flex; gap: 8px; flex-wrap: wrap; }
    .report-link { color: var(--accent-color); text-decoration: none; padding: 2px 6px; background: rgba(86, 156, 214, 0.1); border-radius: 3px; font-size: 0.8rem; }
    .report-link:hover { background: rgba(86, 156, 214, 0.2); text-decoration: underline; }
    /* Phase 3: フィルタ/検索 */
    .controls-section { grid-column: 1 / -1; display: flex; gap: 15px; flex-wrap: wrap; align-items: center; }
    .search-box {
      flex: 1;
      min-width: 200px;
      padding: 8px 12px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-color);
      font-size: 0.9rem;
    }
    .search-box:focus { outline: none; border-color: var(--accent-color); }
    .filter-group { display: flex; gap: 8px; align-items: center; }
    .filter-label { color: var(--text-muted); font-size: 0.85rem; }
    .filter-select {
      padding: 6px 10px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-color);
      font-size: 0.85rem;
    }
    .filter-select:focus { outline: none; border-color: var(--accent-color); }
    /* Phase 3: タブ切り替え */
    .tabs { display: flex; gap: 5px; margin-bottom: 15px; }
    .tab-btn {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .tab-btn:hover { background: rgba(255,255,255,0.05); }
    .tab-btn.active { background: var(--accent-color); color: white; border-color: var(--accent-color); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    /* アニメーション */
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  </style>
  <script>
    // VSCode Webview用: ファイルをプレビュー付きで開く
    // ブラウザでは通常のリンク動作（/file?path=...）にフォールバック
    function openFile(element, filePath) {
      // VSCode Webview APIが利用可能かチェック
      if (typeof acquireVsCodeApi !== 'undefined') {
        try {
          const vscode = acquireVsCodeApi();
          vscode.postMessage({ command: 'openFile', path: filePath });
          return false; // リンクのデフォルト動作をキャンセル
        } catch (e) {
          // Webview APIが利用できない場合はフォールバック
        }
      }
      // ブラウザの場合は通常のリンク動作（/file?path=...）
      return true;
    }
  </script>
</head>
<body>
  <div class="header">
    <div>
      <h1>🎩 Maid Agent Dashboard</h1>
      <div class="project-path">${escapeHtml(projectPath)}</div>
    </div>
    <div class="timestamp">更新: ${timestamp}</div>
  </div>

  <div class="grid">
    <!-- Phase 2: 統計セクション -->
    <div class="card stats-section">
      <div class="stats-grid">
        <div class="stat-item stat-pending">
          <div class="stat-value">${stats.pendingCount}</div>
          <div class="stat-label">⏳ 待機中</div>
        </div>
        <div class="stat-item stat-working">
          <div class="stat-value">${stats.workingCount}</div>
          <div class="stat-label">⚡ 進行中</div>
        </div>
        <div class="stat-item stat-blocked">
          <div class="stat-value">${stats.blockedCount}</div>
          <div class="stat-label">🚫 ブロック</div>
        </div>
        <div class="stat-item stat-completed">
          <div class="stat-value">${stats.completedTodayCount}</div>
          <div class="stat-label">✅ 本日完了</div>
        </div>
      </div>
    </div>

    <!-- Phase 3: フィルタ/検索コントロール -->
    <div class="controls-section">
      <input type="text" class="search-box" id="searchBox" placeholder="🔍 タスクID / 説明で検索..." />
      <div class="filter-group">
        <span class="filter-label">優先度:</span>
        <select class="filter-select" id="priorityFilter">
          <option value="">すべて</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">担当者:</span>
        <select class="filter-select" id="assigneeFilter">
          <option value="">すべて</option>
          <option value="emma">emma</option>
          <option value="sophia">sophia</option>
          <option value="lily">lily</option>
          <option value="rose">rose</option>
          <option value="alice">alice</option>
          <option value="may">may</option>
          <option value="flora">flora</option>
          <option value="luna">luna</option>
        </select>
      </div>
    </div>

    <!-- P1: 特殊カテゴリセクション（最上部に固定表示） -->
    <div class="card special-section card-action-required" data-section="action-required">
      <div class="card-header">
        <span class="card-title">🚨 要対応</span>
        <span class="count-badge count-badge-alert">${actionRequired.length}</span>
      </div>
      <div class="collapsible-content">
        ${actionRequiredHtml}
      </div>
    </div>

    <!-- P2: blockedタスクセクション -->
    <div class="card special-section card-blocked" data-section="blocked">
      <div class="card-header">
        <span class="card-title">🚫 ブロック中</span>
        <span class="count-badge count-badge-warning">${blocked.length}</span>
      </div>
      <div class="collapsible-content">
        ${blockedHtml}
      </div>
    </div>

    <div class="card team-section" data-section="team">
      <div class="card-header">
        <span class="card-title">👥 チーム状態</span>
      </div>
      <div class="team-grid">
        ${teamStatusHtml}
      </div>
    </div>

    <div class="card" data-section="pending">
      <div class="card-header">
        <span class="card-title">⏳ 待機中</span>
        <span class="card-count">${pending.length}</span>
      </div>
      ${pendingHtml}
    </div>

    <div class="card" data-section="working">
      <div class="card-header">
        <span class="card-title">⚡ 進行中</span>
        <span class="card-count">${working.length}</span>
      </div>
      ${workingHtml}
    </div>

    <div class="card" style="grid-column: 1 / -1;" data-section="completed">
      <div class="card-header">
        <span class="card-title">✅ 直近完了</span>
        <span class="card-count">${recentCompleted.length}</span>
      </div>
      ${completedHtml}
    </div>

    <!-- P1: スキル候補・改善提案セクション -->
    <div class="card card-skill">
      <div class="card-header collapsible-header">
        <span class="card-title">📚 スキル候補</span>
        <span class="count-badge count-badge-purple">${skillCandidates.length}</span>
      </div>
      <div class="collapsible-content">
        ${skillCandidatesHtml}
      </div>
    </div>

    <div class="card card-improvement">
      <div class="card-header collapsible-header">
        <span class="card-title">💡 改善提案</span>
        <span class="count-badge count-badge-orange">${improvements.length}</span>
      </div>
      <div class="collapsible-content">
        ${improvementsHtml}
      </div>
    </div>
  </div>

  <script>
    // Phase 2: タスク展開機能
    document.querySelectorAll('.task-item').forEach(item => {
      item.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        this.classList.toggle('expanded');
      });
    });

    // Phase 3: 検索機能
    const searchBox = document.getElementById('searchBox');
    const priorityFilter = document.getElementById('priorityFilter');
    const assigneeFilter = document.getElementById('assigneeFilter');

    function filterTasks() {
      const searchTerm = searchBox.value.toLowerCase();
      const priority = priorityFilter.value;
      const assignee = assigneeFilter.value;

      document.querySelectorAll('.task-item').forEach(item => {
        const id = item.querySelector('.task-id')?.textContent?.toLowerCase() || '';
        const desc = item.querySelector('.task-desc')?.textContent?.toLowerCase() || '';
        const itemPriority = item.dataset.priority || '';
        const itemAssignee = item.dataset.assignee || '';

        const matchesSearch = !searchTerm || id.includes(searchTerm) || desc.includes(searchTerm);
        const matchesPriority = !priority || itemPriority === priority;
        const matchesAssignee = !assignee || itemAssignee.includes(assignee);

        item.style.display = (matchesSearch && matchesPriority && matchesAssignee) ? '' : 'none';
      });
    }

    searchBox?.addEventListener('input', filterTasks);
    priorityFilter?.addEventListener('change', filterTasks);
    assigneeFilter?.addEventListener('change', filterTasks);

    // Phase 3: SSEによるリアルタイム更新（タスクリスト全体対応）
    let eventSource = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    // 展開状態を記憶するMap（taskId -> expanded）
    const expandedState = new Map();

    // サーバーURLを埋め込み（VSCode Webview対応）
    const serverBaseUrl = 'http://127.0.0.1:3100';

    function connectSSE() {
      const projectPath = encodeURIComponent('${escapeHtml(projectPath)}');
      // 絶対URLを使用（VSCode Webviewでも動作するように）
      eventSource = new EventSource(serverBaseUrl + '/dashboard/events?project=' + projectPath);

      eventSource.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'update') {
            // 統計のみ更新
            updateStats(data.stats);
          } else if (data.type === 'tasks') {
            // タスクリスト全体を更新
            updateTaskLists(data.tasks);
          } else if (data.type === 'refresh') {
            location.reload();
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      eventSource.onerror = function() {
        eventSource.close();
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setTimeout(connectSSE, 5000 * reconnectAttempts);
        }
      };

      eventSource.onopen = function() {
        reconnectAttempts = 0;
      };
    }

    function updateStats(stats) {
      if (!stats) return;
      const mapping = {
        pendingCount: '.stat-pending .stat-value',
        workingCount: '.stat-working .stat-value',
        blockedCount: '.stat-blocked .stat-value',
        completedTodayCount: '.stat-completed .stat-value'
      };
      for (const [key, selector] of Object.entries(mapping)) {
        const el = document.querySelector(selector);
        if (el && stats[key] !== undefined) {
          el.textContent = stats[key];
          el.classList.add('fade-in');
          setTimeout(() => el.classList.remove('fade-in'), 300);
        }
      }
      // 更新時刻を更新
      if (stats.timestamp) {
        const timestampEl = document.querySelector('.timestamp');
        if (timestampEl) {
          timestampEl.textContent = '更新: ' + stats.timestamp;
          timestampEl.classList.add('fade-in');
          setTimeout(() => timestampEl.classList.remove('fade-in'), 300);
        }
      }
    }

    // 展開状態を保存
    function saveExpandedStates() {
      document.querySelectorAll('.task-item.expanded').forEach(item => {
        const taskId = item.dataset.id;
        if (taskId) {
          expandedState.set(taskId, true);
        }
      });
    }

    // 展開状態を復元
    function restoreExpandedStates() {
      document.querySelectorAll('.task-item').forEach(item => {
        const taskId = item.dataset.id;
        if (taskId && expandedState.has(taskId)) {
          item.classList.add('expanded');
        }
      });
    }

    // タスクリストを更新（DOMを再構築しつつ展開状態を保持）
    function updateTaskLists(tasks) {
      if (!tasks) return;

      // 現在の展開状態を保存
      saveExpandedStates();

      // 各セクションを更新（data-section属性で識別）
      if (tasks.pending) {
        updateTaskSection('[data-section="pending"]', tasks.pending);
      }
      if (tasks.working) {
        updateTaskSection('[data-section="working"]', tasks.working);
      }
      if (tasks.blocked) {
        updateTaskSection('[data-section="blocked"]', tasks.blocked);
      }
      if (tasks.completed) {
        updateTaskSection('[data-section="completed"]', tasks.completed);
      }
      if (tasks.actionRequired) {
        updateTaskSection('[data-section="action-required"]', tasks.actionRequired);
      }

      // 展開状態を復元
      restoreExpandedStates();

      // イベントリスナーを再設定
      attachTaskItemListeners();

      // フィルタを再適用
      filterTasks();
    }

    function updateTaskSection(selector, taskHtml) {
      const section = document.querySelector(selector);
      if (!section) {
        console.warn('Section not found:', selector);
        return;
      }

      // .collapsible-contentがある場合はそれを更新、なければカードヘッダー以降を更新
      const contentArea = section.querySelector('.collapsible-content');

      if (contentArea) {
        contentArea.innerHTML = taskHtml;
      } else {
        // カードヘッダー以降を更新
        const header = section.querySelector('.card-header');
        if (header) {
          // ヘッダー以降のコンテンツを削除
          let sibling = header.nextSibling;
          while (sibling) {
            const next = sibling.nextSibling;
            section.removeChild(sibling);
            sibling = next;
          }
          // 新しいコンテンツを追加
          const wrapper = document.createElement('div');
          wrapper.innerHTML = taskHtml;
          while (wrapper.firstChild) {
            section.appendChild(wrapper.firstChild);
          }
        }
      }
    }

    function attachTaskItemListeners() {
      document.querySelectorAll('.task-item').forEach(item => {
        // 既存のリスナーを削除して重複を防ぐ
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);

        newItem.addEventListener('click', function(e) {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
          this.classList.toggle('expanded');
        });
      });
    }

    // SSE接続を試行（VSCode Webviewでは無効 - セキュリティ制限のため）
    // VSCode WebviewではacquireVsCodeApiが存在するので、それで判定
    const isVSCodeWebview = typeof acquireVsCodeApi !== 'undefined';
    if (!isVSCodeWebview) {
      try {
        connectSSE();
      } catch (e) {
        console.log('SSE not available:', e);
      }
    } else {
      console.log('VSCode Webview detected - SSE disabled, use manual refresh');
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ========================================
// MCP Server ファクトリ関数
// 各セッションごとに新しい McpServer を作成
// projectPath を受け取って動的にパスを解決
// ========================================

function createMcpServer(projectPath: string): McpServer {
  const server = new McpServer({
    name: "maid-agent-messenger",
    version: "4.1.0",
  });

  const queueMaidPath = getQueueMaidPath(projectPath);
  const currentReportsPath = getCurrentReportsPath(projectPath);
  const archiveReportsPath = getArchiveReportsPath(projectPath);

  // get_my_task ツール
  server.tool(
    "get_my_task",
    "自分に割り当てられたタスク情報を取得します",
    {
      agent_id: z.enum(MAID_IDS).describe("エージェントID（例: emma, flora）"),
    },
    async ({ agent_id }) => {
      try {
        const result = await executeGetMyTask({
          queueMaidPath,
          agentId: agent_id,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ...result, project_path: projectPath }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "タスク取得に失敗しました",
              details: message,
              project_path: projectPath,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // update_status ツール
  server.tool(
    "update_status",
    "自分のタスクステータスを更新します",
    {
      agent_id: z.enum(MAID_IDS).describe("エージェントID（例: emma, flora）"),
      status: z.enum(UPDATABLE_STATUSES).describe("新しいステータス（working, completed, blocked）"),
      summary: z.string().max(100).optional().describe("作業サマリ（100文字以内、オプション）"),
    },
    async ({ agent_id, status, summary }) => {
      try {
        const result = await executeUpdateStatus({
          queueMaidPath,
          currentReportsPath,
          archiveReportsPath,
          agentId: agent_id,
          status,
          summary,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "ステータス更新に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // assign_task ツール
  server.tool(
    "assign_task",
    "メイドにタスクを割り当てます（メイド長専用）",
    {
      task_id: z.string().describe("タスクID（例: task-025-001）"),
      target_agent: z.enum(MAID_IDS).describe("割り当て先エージェント（例: emma, flora）"),
      title: z.string().max(100).describe("タスクタイトル（100文字以内）"),
      description: z.string().max(2000).optional().describe("タスク説明（詳細、2000文字以内、省略可）"),
      target_path: z.string().optional().describe("作業対象パス（オプション）"),
    },
    async ({ task_id, target_agent, title, description, target_path }) => {
      try {
        const result = await executeAssignTask({
          queueMaidPath,
          currentReportsPath,
          templatePath: currentReportsPath,  // テンプレートは作業中レポートと同じ場所
          taskId: task_id,
          targetAgent: target_agent,
          title,
          description,
          targetPath: target_path,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
          isError: !result.success,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: `タスク割り当てに失敗しました: ${message}`,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // get_team_status ツール（Phase 3: フィルタ対応）
  server.tool(
    "get_team_status",
    "全メイドのステータス一覧を取得します（メイド長・執事用）。フィルタ・完了タスク取得対応。",
    {
      status: z.array(z.string()).optional().describe("ステータスでフィルタ（例: [\"working\", \"blocked\"]）"),
      agentId: z.enum(MAID_IDS).optional().describe("特定のエージェントのみ取得"),
      includeCompleted: z.number().optional().describe("直近N件の完了タスクを含める（tasks.yamlから取得）"),
    },
    async ({ status, agentId, includeCompleted }) => {
      try {
        const result = await executeGetTeamStatus({
          queueMaidPath,
          filter: {
            status,
            agentId,
            includeCompleted,
          },
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ...result, project_path: projectPath }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "チームステータス取得に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // ========================================
  // タスク管理ツール（Phase 1）
  // ========================================

  // TaskStatusのZodスキーマ
  const TaskStatusSchema = z.enum([
    "pending",
    "assigned",
    "working",
    "completed",
    "blocked",
    "cancelled",
  ]);

  // create_task ツール
  server.tool(
    "create_task",
    "新規タスクまたはサブタスクを作成します",
    {
      title: z.string().describe("タスクタイトル（短い概要）"),
      description: z.string().optional().describe("タスク説明（詳細、省略可）"),
      priority: z.enum(["high", "medium", "low"]).optional().describe("優先度（デフォルト: medium）"),
      parentId: z.string().optional().describe("親タスクID（サブタスク作成時に指定）"),
      assignees: z.array(z.enum(MAID_IDS)).optional().describe("担当者リスト"),
      category: z.enum(["task", "action_required", "skill_candidate", "improvement"]).optional().describe("カテゴリ（デフォルト: task）"),
    },
    async ({ title, description, priority, parentId, assignees, category }) => {
      try {
        const result = await executeCreateTask(projectPath, {
          title,
          description,
          priority,
          parentId,
          assignees,
          category,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "タスク作成に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // get_task ツール
  server.tool(
    "get_task",
    "タスクの詳細情報を取得します",
    {
      taskId: z.string().describe("タスクID（例: 076, 076-1）"),
      includeSubtasks: z.boolean().optional().describe("サブタスクも含めるか（デフォルト: false）"),
    },
    async ({ taskId, includeSubtasks }) => {
      try {
        const result = await executeGetTask(projectPath, {
          taskId,
          includeSubtasks,
        });

        if (!result.task) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: "タスクが見つかりません",
                taskId,
              }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "タスク取得に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // list_tasks ツール
  server.tool(
    "list_tasks",
    "タスク一覧を取得します（フィルタ・ソート対応）",
    {
      status: z.array(TaskStatusSchema).optional().describe("ステータスでフィルタ"),
      assignee: z.enum(MAID_IDS).optional().describe("担当者でフィルタ"),
      parentId: z.string().nullable().optional().describe("親タスクIDでフィルタ（nullでトップレベルのみ）"),
      category: z.array(z.enum(["task", "action_required", "skill_candidate", "improvement"])).optional().describe("カテゴリでフィルタ"),
      limit: z.number().optional().describe("取得件数上限（デフォルト: 50）"),
      offset: z.number().optional().describe("スキップ件数（ページネーション用）"),
      sortField: z.enum(["createdAt", "priority", "status"]).optional().describe("ソートフィールド"),
      sortOrder: z.enum(["asc", "desc"]).optional().describe("ソート順序（デフォルト: desc）"),
    },
    async ({ status, assignee, parentId, category, limit, offset, sortField, sortOrder }) => {
      try {
        const result = await executeListTasks(projectPath, {
          status: status as TaskStatus[] | undefined,
          assignee,
          parentId,
          category: category as ("task" | "action_required" | "skill_candidate" | "improvement")[] | undefined,
          limit,
          offset,
          sortField,
          sortOrder,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "タスク一覧取得に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  // update_task ツール（Phase 3）
  server.tool(
    "update_task",
    "タスクを更新します",
    {
      taskId: z.string().describe("タスクID（例: 076, 076-1）"),
      status: TaskStatusSchema.optional().describe("新しいステータス"),
      substatus: z.string().optional().describe("サブステータス（blocked時の詳細など）"),
      category: z.enum(["task", "action_required", "skill_candidate", "improvement"]).optional().describe("カテゴリ"),
      summary: z.string().optional().describe("完了サマリー"),
      reportPath: z.string().optional().describe("報告ファイルパス（追加）"),
    },
    async ({ taskId, status, substatus, category, summary, reportPath }) => {
      try {
        const result = await executeUpdateTask(projectPath, {
          taskId,
          status,
          substatus,
          category,
          summary,
          reportPath,
        });

        if (!result.success) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: "タスクが見つかりません",
                taskId,
              }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "タスク更新に失敗しました",
              details: message,
            }),
          }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ========================================
// HTTP エンドポイント
// ========================================

// ヘルスチェック
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: getTimestamp(),
    version: "4.1.0",
    mode: "streamable-http-multiproject",
    activeConnections: sessions.size,
  });
});

// MCP Streamable HTTP エンドポイント - POST /mcp
app.post("/mcp", async (req: Request, res: Response) => {
  // プロジェクトパスをヘッダーから取得
  const projectPath = req.headers["x-maid-project-path"] as string;

  if (!projectPath) {
    console.error("MCP request rejected: X-Maid-Project-Path header is required");
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "X-Maid-Project-Path header is required",
      },
      id: null,
    });
    return;
  }

  // セッションIDをヘッダーから取得
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // 既存セッションがある場合はそれを使用
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    console.log(`Reusing session: ${sessionId}`);
    try {
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Request handling error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
    return;
  }

  // セッションIDなしのリクエスト: 自動的に新しいセッションを作成
  const body = req.body;
  const isInitializeRequest = body && body.method === "initialize";

  if (!isInitializeRequest) {
    // 自動セッション作成モード: initializeなしでもセッションを作成して処理
    console.log(`Auto-creating session for method=${body?.method} (no session ID)`);
  }

  // 新規セッションを作成
  console.log(`New MCP connection request for project: ${projectPath}`);

  try {
    const newSessionId = randomUUID();

    // StreamableHTTPServerTransport を作成
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid: string) => {
        console.log(`Session initialized: ${sid} (project: ${projectPath})`);
      },
    });

    // McpServer インスタンスを作成
    const server = createMcpServer(projectPath);

    // セッション情報を保存
    sessions.set(newSessionId, { transport, server, projectPath });

    // サーバーに接続
    await server.connect(transport);

    // リクエストを処理
    await transport.handleRequest(req, res, req.body);

    // セッション終了時のクリーンアップ（transportのcloseイベント）
    transport.onclose = () => {
      console.log(`Session closed: ${newSessionId}`);
      sessions.delete(newSessionId);
    };

  } catch (error) {
    console.error("MCP connection error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Connection failed" },
        id: null,
      });
    }
  }
});

// MCP Streamable HTTP エンドポイント - GET /mcp (SSEストリーム、オプション)
app.get("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Invalid or missing session ID",
      },
      id: null,
    });
    return;
  }

  const session = sessions.get(sessionId)!;
  console.log(`SSE stream requested for session: ${sessionId}`);

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error("SSE stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Stream failed" },
        id: null,
      });
    }
  }
});

// MCP Streamable HTTP エンドポイント - DELETE /mcp (セッション終了)
app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session ID required" },
      id: null,
    });
    return;
  }

  const session = sessions.get(sessionId);
  if (session) {
    console.log(`Session terminated: ${sessionId}`);
    await session.transport.close();
    sessions.delete(sessionId);
  }

  res.status(204).end();
});

// ========================================
// レガシー REST API エンドポイント（後方互換性）
// ヘッダーからプロジェクトパスを取得
// ========================================

// プロジェクトパスを取得するヘルパー
function getProjectPathFromRequest(req: Request): string {
  const projectPath = req.headers["x-maid-project-path"] as string;
  if (!projectPath) {
    throw new Error("X-Maid-Project-Path header is required");
  }
  return projectPath;
}

// Zodスキーマ
const GetMyTaskSchema = z.object({
  agent_id: z.enum(MAID_IDS),
});

const UpdateStatusSchema = z.object({
  agent_id: z.enum(MAID_IDS),
  status: z.enum(UPDATABLE_STATUSES),
  summary: z.string().max(100).optional(),
});

const AssignTaskSchema = z.object({
  task_id: z.string(),
  target_agent: z.enum(MAID_IDS),
  title: z.string().max(100),
  description: z.string().max(2000).optional(),
  target_path: z.string().optional(),
});

// get_my_task (REST)
app.post("/tools/get_my_task", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { agent_id } = GetMyTaskSchema.parse(req.body);

    const result = await executeGetMyTask({
      queueMaidPath: getQueueMaidPath(projectPath),
      agentId: agent_id,
    });

    res.json({ ...result, project_path: projectPath });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task retrieval failed", details: message });
  }
});

// update_status (REST)
app.post("/tools/update_status", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { agent_id, status, summary } = UpdateStatusSchema.parse(req.body);

    const result = await executeUpdateStatus({
      queueMaidPath: getQueueMaidPath(projectPath),
      currentReportsPath: getCurrentReportsPath(projectPath),
      archiveReportsPath: getArchiveReportsPath(projectPath),
      agentId: agent_id,
      status,
      summary,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: "Status update failed", details: message });
  }
});

// assign_task (REST)
app.post("/tools/assign_task", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { task_id, target_agent, title, description, target_path } = AssignTaskSchema.parse(req.body);

    const result = await executeAssignTask({
      queueMaidPath: getQueueMaidPath(projectPath),
      currentReportsPath: getCurrentReportsPath(projectPath),
      templatePath: getCurrentReportsPath(projectPath),  // テンプレートは作業中レポートと同じ場所
      taskId: task_id,
      targetAgent: target_agent,
      title,
      description,
      targetPath: target_path,
    });

    if (!result.success) {
      res.status(409).json(result);
      return;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: error.errors });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: "Task assignment failed", details: message });
  }
});

// get_team_status (REST) - Phase 3: フィルタ対応
app.post("/tools/get_team_status", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);

    // オプショナルなフィルタパラメータ
    const { status, agentId, includeCompleted } = req.body as {
      status?: string[];
      agentId?: string;
      includeCompleted?: number;
    };

    const result = await executeGetTeamStatus({
      queueMaidPath: getQueueMaidPath(projectPath),
      filter: {
        status,
        agentId,
        includeCompleted,
      },
    });

    res.json({ ...result, project_path: projectPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Team status retrieval failed", details: message });
  }
});

// ========================================
// Task API エンドポイント（Phase 2）
// ========================================

// GET /api/tasks - タスク一覧
app.get("/api/tasks", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);

    // クエリパラメータからフィルタ条件を構築
    const filter: {
      status?: TaskStatus[];
      assignee?: string;
      parentId?: string | null;
      limit?: number;
      offset?: number;
      sortField?: "createdAt" | "priority" | "status";
      sortOrder?: "asc" | "desc";
    } = {};

    if (req.query.status) {
      filter.status = (req.query.status as string).split(",") as TaskStatus[];
    }
    if (req.query.assignee) {
      filter.assignee = req.query.assignee as string;
    }
    if (req.query.parentId !== undefined) {
      filter.parentId = req.query.parentId === "null" ? null : (req.query.parentId as string);
    }
    if (req.query.limit) {
      filter.limit = parseInt(req.query.limit as string, 10);
    }
    if (req.query.offset) {
      filter.offset = parseInt(req.query.offset as string, 10);
    }
    if (req.query.sortField) {
      filter.sortField = req.query.sortField as "createdAt" | "priority" | "status";
    }
    if (req.query.sortOrder) {
      filter.sortOrder = req.query.sortOrder as "asc" | "desc";
    }

    const result = await executeListTasks(projectPath, filter);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task list retrieval failed", details: message });
  }
});

// GET /api/tasks/:id - タスク詳細
app.get("/api/tasks/:id", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const includeSubtasks = req.query.includeSubtasks === "true";

    const result = await executeGetTask(projectPath, {
      taskId: req.params.id,
      includeSubtasks,
    });

    if (!result.task) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task retrieval failed", details: message });
  }
});

// PATCH /api/tasks/:id - タスク更新
app.patch("/api/tasks/:id", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);
    const { status, substatus, summary, reportPath } = req.body;

    const result = await executeUpdateTask(projectPath, {
      taskId: req.params.id,
      status,
      substatus,
      summary,
      reportPath,
    });

    if (!result.success) {
      res.status(404).json({ error: "Task not found", taskId: req.params.id });
      return;
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Task update failed", details: message });
  }
});

// GET /api/dashboard - ダッシュボードJSON
app.get("/api/dashboard", async (req: Request, res: Response) => {
  try {
    const projectPath = getProjectPathFromRequest(req);

    // 並列でタスクを取得
    const [pending, working, completed] = await Promise.all([
      executeListTasks(projectPath, { status: ["pending"] }),
      executeListTasks(projectPath, { status: ["working", "assigned"] }),
      executeListTasks(projectPath, { status: ["completed"], limit: 10, sortField: "createdAt", sortOrder: "desc" }),
    ]);

    res.json({
      timestamp: getTimestamp(),
      summary: {
        pendingCount: pending.total,
        workingCount: working.total,
        completedCount: completed.total,
      },
      pending: pending.tasks,
      working: working.tasks,
      recentCompleted: completed.tasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Dashboard retrieval failed", details: message });
  }
});

// GET /dashboard - HTMLダッシュボード（ブラウザ用）
app.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // クエリパラメータからプロジェクトパスを取得（?project=/path/to/project）
    const projectPath = req.query.project
      ? (req.query.project as string)
      : getProjectPathFromRequest(req);

    // エディタスキームを取得（?editor=vscode|windsurf|cursor、設定ファイルのデフォルト値を使用）
    const config = await loadConfig();
    const editorScheme = (req.query.editor as string) || config.dashboard.editor;

    // 並列でデータを取得（Phase 1: 特殊カテゴリ・blocked追加, Phase 2: 本日完了追加）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pending, working, blocked, completed, completedAll, actionRequired, skillCandidates, improvements, teamStatus] = await Promise.all([
      executeListTasks(projectPath, { status: ["pending"] }),
      executeListTasks(projectPath, { status: ["working", "assigned"] }),
      executeListTasks(projectPath, { status: ["blocked"] }),
      executeListTasks(projectPath, { status: ["completed"], limit: 5, sortField: "createdAt", sortOrder: "desc" }),
      executeListTasks(projectPath, { status: ["completed"], limit: 100 }),  // 本日完了カウント用
      executeListTasks(projectPath, { category: ["action_required"], status: ["pending", "assigned", "working", "blocked"] }),
      executeListTasks(projectPath, { category: ["skill_candidate"] }),
      executeListTasks(projectPath, { category: ["improvement"] }),
      executeGetTeamStatus({ queueMaidPath: getQueueMaidPath(projectPath) }),
    ]);

    // 本日完了タスクをカウント
    const completedTodayCount = completedAll.tasks.filter((task) => {
      if (!task.completedAt) return false;
      const completedDate = new Date(task.completedAt);
      return completedDate >= today;
    }).length;

    // HTML生成
    const html = generateDashboardHtml({
      projectPath,
      timestamp: getTimestamp(),
      pending: pending.tasks,
      working: working.tasks,
      blocked: blocked.tasks,
      recentCompleted: completed.tasks,
      actionRequired: actionRequired.tasks,
      skillCandidates: skillCandidates.tasks,
      improvements: improvements.tasks,
      teamStatus: teamStatus.agents,
      stats: {
        pendingCount: pending.total,
        workingCount: working.total,
        blockedCount: blocked.total,
        completedTodayCount,
      },
    }, editorScheme);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).send(`<html><body><h1>Error</h1><p>${message}</p></body></html>`);
  }
});

// GET /dashboard/events - SSEエンドポイント（Phase 3: タスクリスト全体更新対応）
app.get("/dashboard/events", async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.project
      ? decodeURIComponent(req.query.project as string)
      : getProjectPathFromRequest(req);

    // エディタスキームを取得（?editor=vscode|windsurf|cursor、設定ファイルのデフォルト値を使用）
    const config = await loadConfig();
    const editorScheme = (req.query.editor as string) || config.dashboard.editor;

    // SSEヘッダー設定
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // 接続確認
    res.write("data: {\"type\":\"connected\"}\n\n");

    // タスクリストHTMLを生成するヘルパー関数
    const generateTaskHtml = (tasks: any[], type: string, scheme: string = "vscode") => {
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
          ? new Date(task.createdAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "";
        const completedDate = task.completedAt
          ? new Date(task.completedAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "";

        if (type === "pending") {
          return `<div class="task-item ${priorityClass[task.priority] || ""}" data-priority="${task.priority}" data-id="${task.id}">
            <span class="task-id">${task.id}</span>
            <span class="task-title">${escapeHtml(title)}</span>
            <span class="task-priority">[${task.priority}]</span>
            <div class="task-detail">
              ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
              <div class="task-detail-row"><span class="task-detail-label">作成日時:</span><span class="task-detail-value">${createdDate}</span></div>
            </div>
          </div>`;
        } else if (type === "working") {
          return `<div class="task-item" data-priority="${task.priority || ''}" data-assignee="${assigneeStr}" data-id="${task.id}">
            <span class="task-id">${task.id}</span>
            <span class="task-title">${escapeHtml(title)}</span>
            <span class="task-assignee">${assigneeStr ? `👤 ${assigneeStr}` : ""}</span>
            <div class="task-detail">
              ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
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
          return `<div class="task-item completed" data-id="${task.id}">
            <div class="task-main-row">
              <span class="task-id">${task.id}</span>
              <span class="task-title">${escapeHtml(title)}</span>
              ${assigneeStr ? `<span class="task-date">${assigneeStr}</span>` : ""}
              <span class="task-date">${completedDate}</span>
            </div>
            <div class="task-detail">
              ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
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
              ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
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
              ${task.description ? `<div class="task-detail-row"><span class="task-detail-label">説明:</span><span class="task-detail-value">${escapeHtml(task.description)}</span></div>` : ""}
            </div>
          </div>`;
        }

        return "";
      }).join("\n");
    };

    // 定期的にタスク情報を送信（10秒ごと）
    const intervalId = setInterval(async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [pending, working, blocked, completed, completedAll, actionRequired] = await Promise.all([
          executeListTasks(projectPath, { status: ["pending"] }),
          executeListTasks(projectPath, { status: ["working", "assigned"] }),
          executeListTasks(projectPath, { status: ["blocked"] }),
          executeListTasks(projectPath, { status: ["completed"], limit: 5, sortField: "createdAt", sortOrder: "desc" }),
          executeListTasks(projectPath, { status: ["completed"], limit: 100 }),
          executeListTasks(projectPath, { category: ["action_required"], status: ["pending", "assigned", "working", "blocked"] }),
        ]);

        const completedTodayCount = completedAll.tasks.filter((task) => {
          if (!task.completedAt) return false;
          const completedDate = new Date(task.completedAt);
          return completedDate >= today;
        }).length;

        const stats = {
          pendingCount: pending.total,
          workingCount: working.total,
          blockedCount: blocked.total,
          completedTodayCount,
          timestamp: getTimestamp(),  // 更新時刻を追加
        };

        // 統計情報を送信
        res.write(`data: ${JSON.stringify({ type: "update", stats })}\n\n`);

        // タスクリストHTMLを送信
        const tasksHtml = {
          pending: generateTaskHtml(pending.tasks, "pending"),
          working: generateTaskHtml(working.tasks, "working"),
          blocked: generateTaskHtml(blocked.tasks, "blocked"),
          completed: generateTaskHtml(completed.tasks, "completed", editorScheme),
          actionRequired: generateTaskHtml(actionRequired.tasks, "action_required"),
        };

        res.write(`data: ${JSON.stringify({ type: "tasks", tasks: tasksHtml })}\n\n`);
      } catch (e) {
        console.error("SSE update error:", e);
      }
    }, 10000);

    // クライアント切断時のクリーンアップ
    req.on("close", () => {
      clearInterval(intervalId);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "SSE connection failed", details: message });
  }
});

// ========================================
// エラーハンドラ
// ========================================
// GET /file - ファイル表示エンドポイント（ブラウザでマークダウンを表示）
// ========================================

/**
 * 簡易マークダウン→HTML変換
 */
function convertMarkdownToHtml(markdown: string): string {
  let html = escapeHtml(markdown);

  // コードブロック（```）
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // インラインコード（`）
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 見出し（# ～ ######）
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 太字と斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // リスト（- または *）
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // 水平線
  html = html.replace(/^---+$/gm, '<hr>');

  // リンク
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // 段落（空行で区切られたテキスト）
  html = html.replace(/\n\n+/g, '</p><p>');
  html = `<p>${html}</p>`;

  // 空の段落を削除
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)<\/p>/g, '$1');

  return html;
}

app.get("/file", async (req: Request, res: Response) => {
  try {
    let filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).send("Missing path parameter");
      return;
    }

    // URLデコード
    filePath = decodeURIComponent(filePath);

    // Windowsパス（C:/...）をWSLパス（/mnt/c/...）に変換
    if (/^[A-Z]:\//i.test(filePath)) {
      const driveLetter = filePath[0].toLowerCase();
      filePath = `/mnt/${driveLetter}/${filePath.slice(3)}`;
    }

    // ファイル読み込み
    const content = await fs.readFile(filePath, "utf-8");
    const fileName = path.basename(filePath);
    const isMarkdown = /\.(md|markdown)$/i.test(fileName);

    // HTML生成
    const htmlContent = isMarkdown ? convertMarkdownToHtml(content) : `<pre>${escapeHtml(content)}</pre>`;

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
  <style>
    :root {
      --bg-color: #1e1e1e;
      --text-color: #d4d4d4;
      --heading-color: #569cd6;
      --link-color: #4ec9b0;
      --code-bg: #2d2d2d;
      --border-color: #3c3c3c;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg-color);
      color: var(--text-color);
      line-height: 1.6;
      padding: 20px 40px;
      max-width: 900px;
      margin: 0 auto;
    }
    .file-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 15px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
    }
    .file-name { font-size: 1.2rem; color: var(--heading-color); }
    .file-path { font-size: 0.8rem; color: #808080; margin-top: 5px; }
    .back-link { color: var(--link-color); text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    h1, h2, h3, h4, h5, h6 { color: var(--heading-color); margin: 1.5em 0 0.5em; }
    h1 { font-size: 1.8rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h3 { font-size: 1.3rem; }
    a { color: var(--link-color); }
    code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: "Consolas", "Monaco", monospace;
      font-size: 0.9em;
    }
    pre {
      background: var(--code-bg);
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      border: 1px solid var(--border-color);
    }
    pre code { background: none; padding: 0; }
    ul { padding-left: 25px; }
    li { margin: 5px 0; }
    hr { border: none; border-top: 1px solid var(--border-color); margin: 20px 0; }
    p { margin: 1em 0; }
    strong { color: #dcdcaa; }
  </style>
</head>
<body>
  <div class="file-header">
    <div>
      <div class="file-name">📄 ${escapeHtml(fileName)}</div>
      <div class="file-path">${escapeHtml(filePath)}</div>
    </div>
    <a href="javascript:history.back()" class="back-link">← 戻る</a>
  </div>
  <div class="content">
    ${htmlContent}
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>File Not Found</title>
      <style>body{font-family:sans-serif;background:#1e1e1e;color:#ccc;padding:40px;text-align:center;}
      .error{color:#f14c4c;font-size:1.5rem;}</style></head>
      <body><div class="error">⚠️ ファイルが見つかりません</div><p>${escapeHtml(message)}</p>
      <a href="javascript:history.back()" style="color:#4ec9b0;">← 戻る</a></body></html>
    `);
  }
});

// ========================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ========================================
// サーバー起動
// ========================================

async function main(): Promise<void> {
  const config = await loadConfig();
  const { port, host } = config.server;

  app.listen(port, host, () => {
    console.log(`Central MCP Server v4.1.0 running on ${getServerUrl(config)}`);
    console.log(`MCP endpoint: ${getServerUrl(config)}/mcp`);
    console.log(`Health check: ${getServerUrl(config)}/health`);
    console.log(`Mode: Streamable HTTP Transport (Multi-Project Support)`);
    console.log(`Note: Requires X-Maid-Project-Path header for project identification`);
  });
}

main().catch((error) => {
  console.error("Server startup failed:", error);
  process.exit(1);
});
