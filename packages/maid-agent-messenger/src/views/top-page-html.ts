/**
 * トップページ（プロジェクト一覧）HTML生成
 */

import type { ProjectEntry } from "../services/project-registry.js";
import { escapeHtml } from "../markdown-utils.js";

export interface ProjectWithStats extends ProjectEntry {
  stats: {
    pendingCount: number;
    workingCount: number;
    completedTodayCount: number;
  } | null;
  status: "available" | "unavailable";
}

/**
 * 相対時間表示
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "たった今";
  if (diffMins < 60) return `${diffMins}分前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}時間前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}日前`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}ヶ月前`;
}

/**
 * パスを省略表示
 */
function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) return path;
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

export function generateTopPageHtml(projects: ProjectWithStats[]): string {
  const projectCards = projects
    .map((project) => {
      const displayName = project.displayName || project.name;
      const statusClass = project.status === "available" ? "" : "unavailable";
      const pinnedIcon = project.pinned ? '<span class="pin-icon">📌</span>' : "";

      let statsHtml = "";
      if (project.status === "available" && project.stats) {
        statsHtml = `
          <div class="card-stats">
            <span class="stat pending">待機 ${project.stats.pendingCount}</span>
            <span class="stat working">進行 ${project.stats.workingCount}</span>
            <span class="stat completed">完了 ${project.stats.completedTodayCount}</span>
          </div>`;
      } else if (project.status === "unavailable") {
        statsHtml = '<div class="card-stats"><span class="stat unavailable">利用不可</span></div>';
      }

      const encodedPath = encodeURIComponent(project.path);

      return `
        <div class="project-card ${statusClass}" data-path="${escapeHtml(project.path)}">
          <div class="card-header">
            ${pinnedIcon}
            <h2 class="card-name">${escapeHtml(displayName)}</h2>
            <button class="card-menu" onclick="event.stopPropagation(); toggleMenu(this)">⋮</button>
            <div class="dropdown-menu">
              <button onclick="event.stopPropagation(); togglePin('${encodedPath}')">${project.pinned ? "📌 ピン解除" : "📌 ピン留め"}</button>
              <button onclick="event.stopPropagation(); toggleHide('${encodedPath}')">🙈 非表示</button>
            </div>
          </div>
          <div class="card-path" title="${escapeHtml(project.path)}">${escapeHtml(truncatePath(project.path))}</div>
          ${statsHtml}
          <div class="card-footer">最終アクセス: ${formatRelativeTime(project.lastAccessedAt)}</div>
          <div class="card-click-area" onclick="navigateToProject('${encodedPath}')"></div>
        </div>`;
    })
    .join("\n");

  const addProjectCard = `
    <div class="project-card add-card" onclick="showAddModal()">
      <div class="add-icon">＋</div>
      <div class="add-text">プロジェクトを追加</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maid Agent - プロジェクト一覧</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-card: #1e2a4a;
      --text-primary: #e0e0e0;
      --text-secondary: #a0a0a0;
      --accent: #4fc3f7;
      --border: #2a3a5a;
      --stat-pending: #ffd54f;
      --stat-working: #4fc3f7;
      --stat-completed: #81c784;
      --stat-unavailable: #ef5350;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background: var(--bg-secondary);
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      text-align: center;
    }

    header h1 {
      font-size: 20px;
      font-weight: 600;
    }

    main {
      flex: 1;
      padding: 20px;
      max-width: 600px;
      margin: 0 auto;
      width: 100%;
    }

    .project-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .project-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      position: relative;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.1s;
    }

    .project-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .project-card.unavailable {
      opacity: 0.6;
    }

    .project-card.add-card {
      border: 2px dashed var(--border);
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100px;
    }

    .add-icon {
      font-size: 32px;
      color: var(--accent);
    }

    .add-text {
      margin-top: 8px;
      color: var(--text-secondary);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .pin-icon {
      font-size: 14px;
    }

    .card-name {
      font-size: 18px;
      font-weight: 600;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-menu {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      position: relative;
    }

    .card-menu:hover {
      background: var(--border);
    }

    .dropdown-menu {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      z-index: 100;
      min-width: 140px;
    }

    .dropdown-menu.show {
      display: block;
    }

    .dropdown-menu button {
      width: 100%;
      padding: 12px 16px;
      background: none;
      border: none;
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;
      font-size: 14px;
    }

    .dropdown-menu button:hover {
      background: var(--border);
    }

    .card-path {
      font-size: 12px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 12px;
    }

    .card-stats {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .stat {
      font-size: 13px;
      padding: 4px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
    }

    .stat.pending { color: var(--stat-pending); }
    .stat.working { color: var(--stat-working); }
    .stat.completed { color: var(--stat-completed); }
    .stat.unavailable { color: var(--stat-unavailable); }

    .card-footer {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .card-click-area {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
    }

    .card-header, .dropdown-menu {
      position: relative;
      z-index: 2;
    }

    footer {
      background: var(--bg-secondary);
      padding: 12px 20px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* Modal */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .modal-overlay.show {
      display: flex;
    }

    .modal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
    }

    .modal h3 {
      margin-bottom: 16px;
    }

    .modal input {
      width: 100%;
      padding: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      margin-bottom: 16px;
    }

    .modal input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .modal-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .modal-buttons button {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }

    .modal-buttons .cancel {
      background: var(--border);
      color: var(--text-primary);
    }

    .modal-buttons .submit {
      background: var(--accent);
      color: #000;
    }
  </style>
</head>
<body>
  <header>
    <h1>🏠 Maid Agent - プロジェクト一覧</h1>
  </header>

  <main>
    <div class="project-list">
      ${projectCards}
      ${addProjectCard}
    </div>
  </main>

  <footer>Maid Agent v4.1.0</footer>

  <div class="modal-overlay" id="addModal">
    <div class="modal">
      <h3>プロジェクトを追加</h3>
      <input type="text" id="projectPathInput" placeholder="/path/to/project">
      <div class="modal-buttons">
        <button class="cancel" onclick="hideAddModal()">キャンセル</button>
        <button class="submit" onclick="addProject()">追加</button>
      </div>
    </div>
  </div>

  <script>
    // ドロップダウンメニュー
    function toggleMenu(btn) {
      const menu = btn.nextElementSibling;
      // 他のメニューを閉じる
      document.querySelectorAll('.dropdown-menu.show').forEach(m => {
        if (m !== menu) m.classList.remove('show');
      });
      menu.classList.toggle('show');
    }

    // ページクリックでメニューを閉じる
    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    });

    // プロジェクトへ遷移
    function navigateToProject(encodedPath) {
      window.location.href = '/dashboard?project=' + encodedPath;
    }

    // ピン留めトグル
    async function togglePin(encodedPath) {
      try {
        const res = await fetch('/api/projects/' + encodedPath + '/pin', { method: 'PATCH' });
        if (res.ok) {
          window.location.reload();
        } else {
          alert('ピン留めの変更に失敗しました');
        }
      } catch (e) {
        alert('エラーが発生しました');
      }
    }

    // 非表示トグル
    async function toggleHide(encodedPath) {
      if (!confirm('このプロジェクトを非表示にしますか？')) return;
      try {
        const res = await fetch('/api/projects/' + encodedPath + '/hide', { method: 'PATCH' });
        if (res.ok) {
          window.location.reload();
        } else {
          alert('非表示の変更に失敗しました');
        }
      } catch (e) {
        alert('エラーが発生しました');
      }
    }

    // モーダル表示
    function showAddModal() {
      document.getElementById('addModal').classList.add('show');
      document.getElementById('projectPathInput').focus();
    }

    function hideAddModal() {
      document.getElementById('addModal').classList.remove('show');
      document.getElementById('projectPathInput').value = '';
    }

    // プロジェクト追加（ダッシュボードに遷移して自動登録）
    function addProject() {
      const path = document.getElementById('projectPathInput').value.trim();
      if (!path) {
        alert('プロジェクトパスを入力してください');
        return;
      }
      window.location.href = '/dashboard?project=' + encodeURIComponent(path);
    }

    // モーダル外クリックで閉じる
    document.getElementById('addModal').addEventListener('click', (e) => {
      if (e.target.id === 'addModal') hideAddModal();
    });

    // Escキーでモーダルを閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideAddModal();
    });
  </script>
</body>
</html>`;
}
