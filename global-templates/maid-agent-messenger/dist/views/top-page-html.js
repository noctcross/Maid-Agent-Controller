/**
 * トップページ（プロジェクト一覧）HTML生成
 * SPA対応: 静的HTMLシェル + クライアントJSでAPI呼び出し
 */
import { COLORS } from "./shared-styles.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- SPA化により引数は使用しない（後方互換のため維持）
export function generateTopPageHtml(_projects) {
    // SPA: 静的HTMLシェルを返す（プロジェクト一覧はクライアントJSで取得・レンダリング）
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Maid Agent - プロジェクト一覧</title>
  <style>
    :root {
      --bg-primary: ${COLORS.BG_PRIMARY};
      --bg-secondary: ${COLORS.BG_SECONDARY};
      --bg-card: ${COLORS.BG_CARD_ALT};
      --text-primary: ${COLORS.TEXT_PRIMARY};
      --text-secondary: ${COLORS.TEXT_SECONDARY};
      --accent: ${COLORS.LINK_CYAN};
      --border: ${COLORS.BORDER_PRIMARY};
      --stat-pending: #ffd54f;
      --stat-working: ${COLORS.LINK_CYAN};
      --stat-completed: ${COLORS.ACCENT_GREEN_LIGHT};
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

    .loading {
      text-align: center;
      padding: 40px;
      color: var(--text-secondary);
    }

    .error {
      text-align: center;
      padding: 40px;
      color: #ef5350;
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
    <div class="project-list" id="project-list">
      <div class="loading">📂 プロジェクトを読み込み中...</div>
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
    // HTML エスケープ関数
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // パスを省略表示
    function truncatePath(path, maxLength) {
      maxLength = maxLength || 40;
      if (path.length <= maxLength) return path;
      var parts = path.split('/');
      if (parts.length <= 3) return path;
      return '.../' + parts.slice(-2).join('/');
    }

    // 相対時間フォーマット
    function formatRelativeTime(dateStr) {
      if (!dateStr) return '不明';
      var date = new Date(dateStr);
      var now = new Date();
      var diffMs = now - date;
      var diffMin = Math.floor(diffMs / 60000);
      var diffHour = Math.floor(diffMs / 3600000);
      var diffDay = Math.floor(diffMs / 86400000);

      if (diffMin < 1) return 'たった今';
      if (diffMin < 60) return diffMin + '分前';
      if (diffHour < 24) return diffHour + '時間前';
      if (diffDay < 7) return diffDay + '日前';
      return date.toLocaleDateString('ja-JP');
    }

    // プロジェクトカードのHTMLを生成
    function renderProjectCard(project) {
      var displayName = project.displayName || project.name;
      var statusClass = project.status === 'available' ? '' : 'unavailable';
      var pinnedIcon = project.pinned ? '<span class="pin-icon">📌</span>' : '';

      var statsHtml = '';
      if (project.status === 'available' && project.stats) {
        statsHtml = '<div class="card-stats">' +
          '<span class="stat pending">待機 ' + project.stats.pendingCount + '</span>' +
          '<span class="stat working">進行 ' + project.stats.workingCount + '</span>' +
          '<span class="stat completed">完了 ' + project.stats.completedTodayCount + '</span>' +
          '</div>';
      } else if (project.status === 'unavailable') {
        statsHtml = '<div class="card-stats"><span class="stat unavailable">利用不可</span></div>';
      }

      var encodedPath = encodeURIComponent(project.path);
      var pinLabel = project.pinned ? '📌 ピン解除' : '📌 ピン留め';

      return '<div class="project-card ' + statusClass + '" data-path="' + escapeHtml(project.path) + '">' +
        '<div class="card-header">' +
        pinnedIcon +
        '<h2 class="card-name">' + escapeHtml(displayName) + '</h2>' +
        '<button class="card-menu" onclick="event.stopPropagation(); toggleMenu(this)">⋮</button>' +
        '<div class="dropdown-menu">' +
        '<button onclick="event.stopPropagation(); togglePin(\\'' + encodedPath + '\\')">' + pinLabel + '</button>' +
        '<button onclick="event.stopPropagation(); toggleHide(\\'' + encodedPath + '\\')">🙈 非表示</button>' +
        '</div>' +
        '</div>' +
        '<div class="card-path" title="' + escapeHtml(project.path) + '">' + escapeHtml(truncatePath(project.path)) + '</div>' +
        statsHtml +
        '<div class="card-footer">最終アクセス: ' + formatRelativeTime(project.lastAccessedAt) + '</div>' +
        '<div class="card-click-area" onclick="navigateToProject(\\'' + encodedPath + '\\')"></div>' +
        '</div>';
    }

    // プロジェクト追加カードのHTML
    var addProjectCardHtml = '<div class="project-card add-card" onclick="showAddModal()">' +
      '<div class="add-icon">＋</div>' +
      '<div class="add-text">プロジェクトを追加</div>' +
      '</div>';

    // APIからプロジェクト一覧を取得してレンダリング
    function loadProjects() {
      fetch('/api/projects')
        .then(function(response) {
          if (!response.ok) {
            return response.json().then(function(data) {
              throw new Error(data.error || 'プロジェクト一覧の取得に失敗しました');
            });
          }
          return response.json();
        })
        .then(function(data) {
          var listEl = document.getElementById('project-list');
          if (!data.projects || data.projects.length === 0) {
            listEl.innerHTML = addProjectCardHtml;
            return;
          }

          var html = data.projects.map(renderProjectCard).join('\\n') + addProjectCardHtml;
          listEl.innerHTML = html;
        })
        .catch(function(error) {
          document.getElementById('project-list').innerHTML =
            '<div class="error">' + escapeHtml(error.message) + '</div>' + addProjectCardHtml;
        });
    }

    // ドロップダウンメニュー
    function toggleMenu(btn) {
      var menu = btn.nextElementSibling;
      // 他のメニューを閉じる
      document.querySelectorAll('.dropdown-menu.show').forEach(function(m) {
        if (m !== menu) m.classList.remove('show');
      });
      menu.classList.toggle('show');
    }

    // ページクリックでメニューを閉じる
    document.addEventListener('click', function() {
      document.querySelectorAll('.dropdown-menu.show').forEach(function(m) {
        m.classList.remove('show');
      });
    });

    // プロジェクトへ遷移
    function navigateToProject(encodedPath) {
      window.location.href = '/dashboard?project=' + encodedPath;
    }

    // ピン留めトグル
    function togglePin(encodedPath) {
      fetch('/api/projects/' + encodedPath + '/pin', { method: 'PATCH' })
        .then(function(res) {
          if (res.ok) {
            loadProjects();  // リロードではなくAPI再取得
          } else {
            alert('ピン留めの変更に失敗しました');
          }
        })
        .catch(function(e) {
          console.error('[togglePin] エラー:', e);
          alert('エラーが発生しました: ' + (e.message || e));
        });
    }

    // 非表示トグル
    function toggleHide(encodedPath) {
      if (!confirm('このプロジェクトを非表示にしますか？')) return;
      fetch('/api/projects/' + encodedPath + '/hide', { method: 'PATCH' })
        .then(function(res) {
          if (res.ok) {
            loadProjects();  // リロードではなくAPI再取得
          } else {
            alert('非表示の変更に失敗しました');
          }
        })
        .catch(function(e) {
          console.error('[toggleHide] エラー:', e);
          alert('エラーが発生しました: ' + (e.message || e));
        });
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
      var path = document.getElementById('projectPathInput').value.trim();
      if (!path) {
        alert('プロジェクトパスを入力してください');
        return;
      }
      window.location.href = '/dashboard?project=' + encodeURIComponent(path);
    }

    // モーダル外クリックで閉じる
    document.getElementById('addModal').addEventListener('click', function(e) {
      if (e.target.id === 'addModal') hideAddModal();
    });

    // Escキーでモーダルを閉じる
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') hideAddModal();
    });

    // ページ読み込み時にプロジェクト一覧を取得
    loadProjects();
  </script>
</body>
</html>`;
}
