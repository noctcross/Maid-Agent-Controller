/**
 * ダッシュボードHTML生成
 * generateDashboardHtml() - メインダッシュボードのHTML生成
 *
 * CSS/JS/HTMLテンプレートを各モジュールに委譲する形式に変更。
 * - dashboard-styles.ts: CSSスタイル定義
 * - dashboard-scripts.ts: JavaScriptコード
 * - dashboard-template.ts: HTMLボディテンプレート
 */
import { escapeHtml } from "../markdown-utils.js";
import { generateTaskHtml, composeMasterWaitingHtml } from "./task-html.js";
import { getDashboardStyles } from "./dashboard-styles.js";
import { getDashboardHeadScript, getDashboardMainScript, getReportOverlayScript, } from "./dashboard-scripts.js";
import { getDashboardBodyTemplate, getReportOverlayHtml, } from "./dashboard-template.js";
/**
 * ダッシュボードHTMLを生成
 *
 * @param data - ダッシュボードに表示するデータ
 * @param editorScheme - エディタスキーム（デフォルト: "vscode"）
 * @returns 完全なHTML文字列
 */
export function generateDashboardHtml(data, editorScheme = "vscode") {
    const { projectPath, timestamp, pending, working, recentCompleted, completedTotal, masterWaiting, masterReview, skillCandidates, improvements, teamStatus, stats, } = data;
    // ステータスアイコンマップ
    const statusIcon = {
        working: "🔧",
        completed: "✅",
        assigned: "📋",
        blocked: "🚫",
        idle: "💤",
        unknown: "❓",
        error: "⚠️",
    };
    // Phase 2: 経過時間計算ヘルパー
    const formatElapsedTime = (startedAt) => {
        if (!startedAt)
            return "";
        const start = new Date(startedAt).getTime();
        const now = Date.now();
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60)
            return `${diffMins}m`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
    };
    // チームステータスHTML生成（Phase 2: 詳細化）
    const teamStatusHtml = teamStatus
        .map((agent) => {
        const icon = statusIcon[agent.status] || "❓";
        const taskInfo = agent.task_id ? `[${agent.task_id}]` : "";
        const elapsedTime = agent.started_at
            ? formatElapsedTime(agent.started_at)
            : "";
        const taskDesc = agent.task_description
            ? escapeHtml(agent.task_description.substring(0, 30)) +
                (agent.task_description.length > 30 ? "..." : "")
            : "";
        const substatusInfo = agent.substatus
            ? `<span class="agent-substatus">⚠️ ${escapeHtml(agent.substatus)}</span>`
            : "";
        return `<div class="agent-status agent-${agent.status}" data-agent="${agent.id}" title="${taskDesc}">
        <div class="agent-row-top">
          <span class="agent-icon">${icon}</span>
          <span class="agent-name">${agent.id}</span>
          ${elapsedTime ? `<span class="agent-elapsed">${elapsedTime}</span>` : ""}
        </div>
        ${taskInfo ? `<div class="agent-row-mid">${taskInfo}</div>` : ""}
        ${substatusInfo}
        ${taskDesc ? `<div class="agent-task-desc">${taskDesc}</div>` : ""}
      </div>`;
    })
        .join("\n");
    // 待機中タスク（特殊カテゴリは専用セクションに表示するため除外）
    const SPECIAL_CATEGORIES = [
        "action_required",
        "skill_candidate",
        "improvement",
    ];
    const filteredPending = pending.filter((task) => !task.category || !SPECIAL_CATEGORIES.includes(task.category));
    // HTML生成を task-html.ts に委譲（初回レンダリングとポーリング更新で同一出力を保証）
    const pendingHtml = generateTaskHtml(filteredPending, "pending", projectPath);
    const workingHtml = generateTaskHtml(working, "working", projectPath);
    const completedHtml = generateTaskHtml(recentCompleted, "completed", projectPath);
    const masterWaitingSectionHtml = composeMasterWaitingHtml(masterWaiting, masterReview, projectPath);
    const skillCandidatesHtml = generateTaskHtml(skillCandidates, "skill_candidate", projectPath);
    const improvementsHtml = generateTaskHtml(improvements, "improvement", projectPath);
    // WebSocket接続用のCSPホスト生成
    const serverHost = new URL(data.serverUrl).host;
    const cspConnectSrc = `ws://localhost:3100 wss://localhost:3100 http://localhost:3100 https://localhost:3100 ws://127.0.0.1:3100 wss://127.0.0.1:3100 http://127.0.0.1:3100 https://127.0.0.1:3100 ws://${serverHost} wss://${serverHost} http://${serverHost} https://${serverHost}`;
    // スクリプトパラメータ
    const scriptParams = {
        projectPath,
        completedTotal,
        serverUrl: data.serverUrl,
    };
    // テンプレートパラメータ
    const templateParams = {
        projectPath,
        timestamp,
        stats,
        teamStatusHtml,
        masterWaitingCount: masterWaiting.length + masterReview.length,
        masterWaitingSectionHtml,
        filteredPendingCount: filteredPending.length,
        pendingHtml,
        workingCount: working.length,
        workingHtml,
        completedTotal,
        completedHtml,
        skillCandidatesCount: skillCandidates.length,
        skillCandidatesHtml,
        improvementsCount: improvements.length,
        improvementsHtml,
    };
    // HTML構築（各モジュールに委譲）
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' ${cspConnectSrc}; img-src data: http: https:;">
  <title>Maid Agent Dashboard</title>
  <style>
${getDashboardStyles()}
  </style>
${getDashboardHeadScript(scriptParams)}
</head>
${getDashboardBodyTemplate(templateParams)}
${getReportOverlayHtml()}
${getDashboardMainScript(scriptParams)}
${getReportOverlayScript()}
</body>
</html>`;
}
