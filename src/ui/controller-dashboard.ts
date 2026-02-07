import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, DashboardContext } from '../types';
import { MAIDS, NOTIFICATIONS_SUBDIR, MAID_DATA_SUBDIR, INSTRUCTIONS_SUBDIR, CONFIG_SUBDIR, WEB_DASHBOARD_POLLING_INTERVAL } from '../constants';

/**
 * コントローラダッシュボード関連の関数群
 * extension.ts の MultiAgentController から抽出
 */

/**
 * コントローラダッシュボードを表示
 */
export function showDashboard(ctx: DashboardContext): void {
    if (ctx.dashboardPanel) {
        ctx.dashboardPanel.reveal();
        ctx.updateDashboard();
        return;
    }

    ctx.dashboardPanel = vscode.window.createWebviewPanel(
        'multiAgentDashboard',
        '🎩 Controller',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true  // 非表示時も状態を保持
        }
    );

    ctx.dashboardPanel.onDidDispose(() => {
        ctx.dashboardPanel = undefined;
    });

    ctx.dashboardPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'refresh':
                    ctx.updateDashboard();
                    break;
                case 'sendTask':
                    ctx.promptAndSendToButler();
                    break;
                case 'openFile':
                    ctx.openMaidAgentFile(message.file);
                    break;
                case 'showTaskDashboard':
                    ctx.showWebDashboard();
                    break;
            }
        },
        undefined,
        ctx.context?.subscriptions
    );

    ctx.updateDashboard();
}

/**
 * Serializerからコントローラパネルを復元する
 */
export function restoreControllerPanel(ctx: DashboardContext, panel: vscode.WebviewPanel): void {
    ctx.dashboardPanel = panel;

    // パネル破棄時の処理を再設定
    panel.onDidDispose(() => {
        ctx.dashboardPanel = undefined;
    });

    // メッセージハンドラを再設定
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'refresh':
                    ctx.updateDashboard();
                    break;
                case 'sendTask':
                    ctx.promptAndSendToButler();
                    break;
                case 'openFile':
                    ctx.openMaidAgentFile(message.file);
                    break;
                case 'showTaskDashboard':
                    ctx.showWebDashboard();
                    break;
            }
        },
        undefined,
        ctx.context?.subscriptions
    );

    // パネル内容を更新
    ctx.updateDashboard();
}

/**
 * ダッシュボードHTMLを生成してパネルを更新
 */
export function updateDashboard(ctx: DashboardContext): void {
    if (!ctx.dashboardPanel) return;

    const butler = ctx.agents.get('butler');
    const chief = ctx.agents.get('chief');
    const maids = MAIDS.map(m => ctx.agents.get(m.id)).filter(Boolean) as Agent[];


    // 会話ログ（history.log）を読み込む
    let conversationLogs = '';
    if (ctx.maidAgentPath) {
        const historyPath = path.join(ctx.maidAgentPath, NOTIFICATIONS_SUBDIR, 'history.log');
        if (fs.existsSync(historyPath)) {
            const content = fs.readFileSync(historyPath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l.length > 0);
            // 最新20件を逆順で表示
            conversationLogs = lines.slice(-20).reverse().map(line => {
                // [2024-01-01 12:34:56] sender → target: message の形式をパース
                const match = line.match(/^\[([^\]]+)\] (\w+) → (\w+): (.+)$/);
                if (match) {
                    const [, timestamp, sender, target, message] = match;
                    return `<div class="conv-entry"><span class="conv-time">${timestamp.split(' ')[1]}</span> <span class="conv-sender">${sender}</span> → <span class="conv-target">${target}</span>: ${message}</div>`;
                }
                return `<div class="conv-entry">${line}</div>`;
            }).join('');
        }
    }

    // メイドのYAMLファイルからタスク情報を取得
    const getMaidTaskInfo = (maidId: string): { taskId: string; title: string; status: string } | null => {
        if (!ctx.maidAgentPath) return null;
        const yamlPath = path.join(ctx.maidAgentPath, MAID_DATA_SUBDIR, `${maidId}.yaml`);
        if (!fs.existsSync(yamlPath)) return null;
        const content = fs.readFileSync(yamlPath, 'utf-8');
        const taskIdMatch = content.match(/^task_id:\s*"?([^"\n]+)"?/m);
        const titleMatch = content.match(/^title:\s*"?([^"\n]+)"?/m);
        const statusMatch = content.match(/^status:\s*"?([^"\n]+)"?/m);
        if (!taskIdMatch) return null;
        return {
            taskId: taskIdMatch[1],
            title: titleMatch ? titleMatch[1] : '',
            status: statusMatch ? statusMatch[1] : '',
        };
    };

    const renderAgent = (a: Agent, emoji: string, role: string) => {
        const statusEmoji = a.status === 'working' ? '⚡' : a.status === 'done' ? '✅' : '💤';
        const statusClass = a.status === 'working' ? 'working' : 'idle';
        const taskInfo = getMaidTaskInfo(a.id);
        const taskHtml = taskInfo
            ? `<div class="agent-task">${taskInfo.taskId}: ${taskInfo.title}</div>`
            : '';
        return `
            <div class="agent-card ${statusClass}">
                <div class="agent-header">
                    <span class="agent-name">${emoji} ${a.name}</span>
                    <span class="agent-role">${role}</span>
                </div>
                <div class="agent-status">
                    <span class="status-badge">${statusEmoji} ${a.status}</span>
                </div>
                ${taskHtml}
            </div>`;
    };

    const butlerHtml = butler ? renderAgent(butler, '🎩', '統括') : '<div class="empty-agent">執事がおりません</div>';
    const chiefHtml = chief ? renderAgent(chief, '👑', '配分担当') : '<div class="empty-agent">メイド長がおりません</div>';
    const maidsHtml = maids.length > 0
        ? maids.map(m => renderAgent(m, '🎀', '実行担当')).join('')
        : '<div class="empty-agent">メイドがおりません</div>';

    const recentLogs = ctx.logs.slice(-10).reverse().map(log =>
        `<div class="log-entry">${log}</div>`
    ).join('');

    ctx.dashboardPanel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #eee;
            min-height: 100vh;
            margin: 0;
        }
        h1 { color: #e94560; margin-bottom: 5px; }
        h2 { color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 5px; margin-top: 0; font-size: 1.1em; }
        .subtitle { color: #888; margin-bottom: 20px; }

        .action-bar { display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap; }
        .action-btn {
            background: #e94560; color: white; border: none;
            padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.85em;
        }
        .action-btn:hover { background: #d63050; }
        .action-btn.secondary { background: rgba(255,255,255,0.2); }

        .hierarchy { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 20px 0; }
        .hierarchy-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .hierarchy-arrow { color: #e94560; font-size: 1.2em; }

        .agent-card {
            background: rgba(255,255,255,0.1); border-radius: 8px;
            padding: 10px; min-width: 120px; border: 1px solid rgba(255,255,255,0.2);
            font-size: 0.9em;
        }
        .agent-card.working { border-color: #ffc107; background: rgba(255,193,7,0.1); }
        .agent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        .agent-name { font-weight: bold; }
        .agent-role { font-size: 0.7em; color: #888; background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 5px; }
        .status-badge { font-size: 0.75em; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.15); }
        .empty-agent { color: #666; font-style: italic; padding: 15px; }
        .agent-task { font-size: 0.7em; color: #aaa; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .section { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 15px; margin: 15px 0; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }

        .file-links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .file-link {
            background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 5px;
            cursor: pointer; font-size: 0.8em;
        }
        .file-link:hover { background: rgba(255,255,255,0.2); }


        .log-container {
            background: #0a0a0a; border-radius: 8px; padding: 10px;
            max-height: 300px; overflow-y: auto;
        }
        .log-entry {
            font-family: 'Consolas', monospace; font-size: 0.75em;
            color: #0f0; padding: 2px 5px; border-bottom: 1px solid #222;
        }

        .conv-container {
            background: #0a0a0a; border-radius: 8px; padding: 10px;
            max-height: 300px; overflow-y: auto;
        }
        .conv-entry {
            font-family: 'Consolas', monospace; font-size: 0.75em;
            color: #ddd; padding: 4px 5px; border-bottom: 1px solid #222;
        }
        .conv-time { color: #666; }
        .conv-sender { color: #4fc3f7; font-weight: bold; }
        .conv-target { color: #81c784; font-weight: bold; }


        @media (max-width: 600px) { .two-column { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <h1>🎩 Maid Agent Controller</h1>
    <p class="subtitle">執事 → メイド長 → メイド の階層構造</p>

    <div class="action-bar">
        <button class="action-btn" onclick="sendTask()">📝 執事に指令</button>
        <button class="action-btn secondary" onclick="refresh()">🔄 更新</button>
        <button class="action-btn secondary" onclick="showTaskDashboard()">📋 Tasks</button>
        <button class="action-btn secondary" onclick="openFile('system/data/tasks.yaml')">📂 Tasks YAML</button>
    </div>

    <div class="two-column">
        <div class="section">
            <h2>💬 会話ログ</h2>
            <div class="conv-container">
                ${conversationLogs || '<div class="conv-entry">会話ログはございません</div>'}
            </div>
        </div>
        <div class="section">
            <h2>📜 システムログ</h2>
            <div class="log-container">
                ${recentLogs || '<div class="log-entry">ログはございません</div>'}
            </div>
        </div>
    </div>

    <div class="section">
        <h2>📊 階層構造</h2>
        <div class="hierarchy">
            <div class="hierarchy-row">${butlerHtml}</div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">${chiefHtml}</div>
            <div class="hierarchy-arrow">↓</div>
            <div class="hierarchy-row">${maidsHtml}</div>
        </div>
    </div>

    <div class="section">
        <h2>📁 設定ファイル</h2>
        <div class="file-links">
            <span class="file-link" onclick="openFile('CLAUDE.md')">CLAUDE.md</span>
            <span class="file-link" onclick="openFile('QUICK_REFERENCE.md')">QUICK_REFERENCE.md</span>
            <span class="file-link" onclick="openFile('${INSTRUCTIONS_SUBDIR}/butler.md')">butler.md</span>
            <span class="file-link" onclick="openFile('${INSTRUCTIONS_SUBDIR}/chief.md')">chief.md</span>
            <span class="file-link" onclick="openFile('${INSTRUCTIONS_SUBDIR}/maid.md')">maid.md</span>
            <span class="file-link" onclick="openFile('${CONFIG_SUBDIR}/settings.yaml')">settings.yaml</span>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function refresh() { vscode.postMessage({ command: 'refresh' }); }
        function sendTask() { vscode.postMessage({ command: 'sendTask' }); }
        function openFile(file) { vscode.postMessage({ command: 'openFile', file: file }); }
        function showTaskDashboard() { vscode.postMessage({ command: 'showTaskDashboard' }); }
        setInterval(() => { refresh(); }, ${WEB_DASHBOARD_POLLING_INTERVAL});
    </script>
</body>
</html>`;
}
