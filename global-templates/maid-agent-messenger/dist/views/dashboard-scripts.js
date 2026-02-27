/**
 * Dashboard JavaScript コード生成
 *
 * dashboard-html.ts から抽出したJavaScriptコードを生成する関数群。
 * CSP制約のためインラインスクリプトとして埋め込む必要がある。
 *
 * @module dashboard-scripts
 */
import { escapeHtml } from "../markdown-utils.js";
/**
 * ダッシュボードのヘッドスクリプトを生成
 * ユーティリティ関数、状態管理、ページネーション関連のコード
 *
 * @param params - スクリプト生成パラメータ
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export function getDashboardHeadScript(params) {
    const { projectPath, completedTotal } = params;
    return `
  <script>
    // VSCode Webview APIは1回しか呼べないため、初回に取得してキャッシュ
    var _vscodeApi = null;
    try {
      if (typeof acquireVsCodeApi !== 'undefined') {
        _vscodeApi = acquireVsCodeApi();
      }
    } catch (e) {}

    // V2.1 Goals API用プロジェクトパス
    window.v2ProjectPath = '${escapeHtml(projectPath)}';

    // デバウンス関数（連続操作を制御）
    function debounce(func, wait) {
      let timeoutId = null;
      return function(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), wait);
      };
    }

    // チェック操作後のリフレッシュをデバウンス化（300ms）
    // requestCompletedPage は後で定義されるため、関数呼び出しでラップ
    var debouncedRefreshCompletedPage = debounce(function() {
      requestCompletedPage();
    }, 300);

    // WebSocketイベント用のリフレッシュをデバウンス化（300ms）
    // 複数タスク一括操作時の表示巻き戻り防止
    var debouncedRefreshDashboard = debounce(function() {
      refreshDashboard();
    }, 300);

    // --- トランザクションID方式 ---
    // UUID生成（ブラウザ互換）
    function generateUUID() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      // フォールバック（VSCode Webview用）
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    // 保留中のトランザクションID
    var pendingTransactions = new Set();
    var TX_TIMEOUT = 10000; // 10秒後に自動クリーンアップ（サーバー遅延対策）

    function addPendingTransaction(txId) {
      pendingTransactions.add(txId);
      setTimeout(function() {
        pendingTransactions.delete(txId);
      }, TX_TIMEOUT);
    }

    // 楽観的に非表示にしたタスクIDを記憶（DOM更新後に再適用するため）
    var optimisticallyHiddenTasks = new Set();

    // HTMLを表示前に楽観的非表示を適用する（ちらつき防止）
    // ※フィルタ条件はサーバー側で適用済み。ここでは楽観的非表示のみ処理
    function applyOptimisticHidesToHtml(html) {
      if (optimisticallyHiddenTasks.size === 0) {
        return html;
      }

      var temp = document.createElement('div');
      temp.innerHTML = html;

      temp.querySelectorAll('.task-item').forEach(function(item) {
        var taskId = item.dataset.taskId;
        if (taskId && optimisticallyHiddenTasks.has(taskId)) {
          item.style.display = 'none';
        }
      });

      return temp.innerHTML;
    }

    // VSCode Webview用: ファイルをプレビュー付きで開く
    // ブラウザでは通常のリンク動作（/file?path=...）にフォールバック
    function openFile(element, filePath) {
      if (_vscodeApi) {
        _vscodeApi.postMessage({ command: 'openFile', path: filePath });
        return false; // リンクのデフォルト動作をキャンセル
      }
      // ブラウザの場合は通常のリンク動作（/file?path=...）
      return true;
    }

    function toggleReview(event, taskId, newValue) {
      event.stopPropagation();
      var btn = event.target.closest('.review-btn');
      var taskItem = btn ? btn.closest('.task-item') : null;
      var txId = generateUUID();
      addPendingTransaction(txId);

      // 楽観的UI更新（ボタン）
      if (btn) {
        btn.classList.toggle('active', newValue);
        btn.dataset.newValue = (!newValue).toString();
      }

      // フィルタ条件でタスクが消える場合は即座に非表示
      var shouldHide = false;
      if (completedFilterReview === 'yes' && !newValue) {
        shouldHide = true; // 「レビュー済みのみ」でレビューを外す
      } else if (completedFilterReview === 'no' && newValue) {
        shouldHide = true; // 「未レビューのみ」でレビューを付ける
      }
      if (shouldHide && taskItem) {
        taskItem.style.display = 'none';
        optimisticallyHiddenTasks.add(taskId); // DOM更新後も非表示を維持
      }

      if (_vscodeApi) {
        _vscodeApi.postMessage({ command: 'toggleReview', taskId: taskId, reviewed: newValue, txId: txId });
      } else {
        fetch('/dashboard/tasks/' + taskId + '/review', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': '${escapeHtml(projectPath)}', 'X-Transaction-Id': txId },
          body: JSON.stringify({ reviewed: newValue })
        }).then(function() {
          // 成功 - トランザクションIDをクリーンアップ
          // 楽観的更新を信頼し、再取得しない（巻き戻り防止）
          pendingTransactions.delete(txId);
          // debouncedRefreshCompletedPage() は削除 - WebSocketの他者操作時のみ再取得
        }).catch(function() {
          // ロールバック + pending削除
          pendingTransactions.delete(txId);
          optimisticallyHiddenTasks.delete(taskId);
          if (btn) {
            btn.classList.toggle('active', !newValue);
            btn.dataset.newValue = newValue.toString();
          }
          if (taskItem) {
            taskItem.style.display = '';
          }
        });
      }
    }

    function toggleStar(event, taskId, newValue) {
      event.stopPropagation();
      var btn = event.target.closest('.star-btn');
      var taskItem = btn ? btn.closest('.task-item') : null;
      var txId = generateUUID();
      addPendingTransaction(txId);

      // 楽観的UI更新（ボタン）
      if (btn) {
        btn.classList.toggle('active', newValue);
        btn.dataset.newValue = (!newValue).toString();
      }

      // フィルタ条件でタスクが消える場合は即座に非表示
      var shouldHide = false;
      if (completedFilterStar === 'yes' && !newValue) {
        shouldHide = true; // 「スター付きのみ」でスターを外す
      } else if (completedFilterStar === 'no' && newValue) {
        shouldHide = true; // 「スターなしのみ」でスターを付ける
      }
      if (shouldHide && taskItem) {
        taskItem.style.display = 'none';
        optimisticallyHiddenTasks.add(taskId); // DOM更新後も非表示を維持
      }

      if (_vscodeApi) {
        _vscodeApi.postMessage({ command: 'toggleStar', taskId: taskId, starred: newValue, txId: txId });
      } else {
        fetch('/dashboard/tasks/' + taskId + '/star', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Maid-Project-Path': '${escapeHtml(projectPath)}', 'X-Transaction-Id': txId },
          body: JSON.stringify({ starred: newValue })
        }).then(function() {
          // 成功 - トランザクションIDをクリーンアップ
          // 楽観的更新を信頼し、再取得しない（巻き戻り防止）
          pendingTransactions.delete(txId);
          // debouncedRefreshCompletedPage() は削除 - WebSocketの他者操作時のみ再取得
        }).catch(function() {
          // ロールバック + pending削除
          pendingTransactions.delete(txId);
          optimisticallyHiddenTasks.delete(taskId);
          if (btn) {
            btn.classList.toggle('active', !newValue);
            btn.dataset.newValue = newValue.toString();
          }
          if (taskItem) {
            taskItem.style.display = '';
          }
        });
      }
    }

    // ソート状態管理
    var sortState = { pending: 'id', working: 'id', completed: 'id' };

    function toggleSort(section, sortBy) {
      sortState[section] = sortBy;
      // ボタンのアクティブ状態を更新
      var buttons = document.querySelectorAll('.sort-toggle-btn[data-section="' + section + '"]');
      buttons.forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.sort === sortBy);
      });
      // 完了セクションはサーバーサイドソート
      if (section === 'completed') {
        completedCurrentPage = 0;
        requestCompletedPage();
        return;
      }
      // 待機中・進行中はクライアントサイドソート
      sortTaskItems(section, sortBy);
    }

    function sortTaskItems(section, sortBy) {
      var sectionEl = document.querySelector('[data-section="' + section + '"]');
      if (!sectionEl) return;
      var items = Array.from(sectionEl.querySelectorAll('.task-item'));
      if (items.length === 0) return;
      var parent = items[0].parentNode;
      items.sort(function(a, b) {
        if (sortBy === 'id') {
          return compareTaskIds(b.dataset.id || '', a.dataset.id || '');
        } else {
          var aTime = a.dataset.updated || '';
          var bTime = b.dataset.updated || '';
          return bTime.localeCompare(aTime);
        }
      });
      items.forEach(function(item) { parent.appendChild(item); });
    }

    function compareTaskIds(a, b) {
      var partsA = a.split('-');
      var partsB = b.split('-');
      for (var i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        var pa = i < partsA.length ? parseInt(partsA[i], 10) : -1;
        var pb = i < partsB.length ? parseInt(partsB[i], 10) : -1;
        if (isNaN(pa)) pa = -1;
        if (isNaN(pb)) pb = -1;
        if (pa !== pb) return pa - pb;
      }
      return 0;
    }

    // Part 2: 表示件数トグル（セッション中のみ保持）
    var COMPLETED_LIMIT_OPTIONS = [5, 10, 20, 100];
    var COMPLETED_LIMIT_DEFAULT_INDEX = 1; // 初期値: 10
    var completedLimitIndex = COMPLETED_LIMIT_DEFAULT_INDEX;
    var completedCurrentPage = 0;

    function getCompletedLimit() {
      return COMPLETED_LIMIT_OPTIONS[completedLimitIndex];
    }

    function toggleCompletedLimit() {
      completedLimitIndex = (completedLimitIndex + 1) % COMPLETED_LIMIT_OPTIONS.length;
      completedCurrentPage = 0;
      // カウントバッジにリミット表示（totalは requestCompletedPage で更新される）
      var badge = document.querySelector('.completed-count-toggle');
      if (badge) {
        badge.textContent = getCompletedLimit() + '件表示 (' + completedTotalForPagination + ')';
      }
      requestCompletedPage();
    }

    // Part 2.5: チェック・スターフィルター（3状態トグル: all → yes → no → all）
    // 状態: 'all' | 'yes' | 'no'
    var completedFilterReview = 'all';
    var completedFilterStar = 'all';
    var FILTER_CYCLE = ['all', 'yes', 'no'];

    function cycleFilter(type) {
      if (type === 'review') {
        var idx = FILTER_CYCLE.indexOf(completedFilterReview);
        completedFilterReview = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
      } else {
        var idx = FILTER_CYCLE.indexOf(completedFilterStar);
        completedFilterStar = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
      }
      completedCurrentPage = 0;
      // フィルタ変更時は楽観的非表示をクリア（サーバーから最新状態を取得するため）
      optimisticallyHiddenTasks.clear();
      updateFilterButtons();
      hideCompletedNewBadge();
      requestCompletedPage();
    }

    function updateFilterButtons() {
      var reviewBtn = document.getElementById('filterReviewBtn');
      var starBtn = document.getElementById('filterStarBtn');
      if (reviewBtn) {
        reviewBtn.className = 'filter-toggle-btn' + (completedFilterReview === 'yes' ? ' filter-yes' : completedFilterReview === 'no' ? ' filter-no' : '');
        reviewBtn.textContent = completedFilterReview === 'yes' ? '✔あり' : completedFilterReview === 'no' ? '✔なし' : '✔すべて';
      }
      if (starBtn) {
        starBtn.className = 'filter-toggle-btn' + (completedFilterStar === 'yes' ? ' filter-yes' : completedFilterStar === 'no' ? ' filter-no' : '');
        starBtn.textContent = completedFilterStar === 'yes' ? '★あり' : completedFilterStar === 'no' ? '★なし' : '★すべて';
      }
    }

    function isCompletedDefaultView() {
      return completedCurrentPage === 0
        && completedFilterReview === 'all'
        && completedFilterStar === 'all'
        && completedLimitIndex === COMPLETED_LIMIT_DEFAULT_INDEX;
    }

    function showCompletedNewBadge() {
      var badge = document.querySelector('.completed-new-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'completed-new-badge';
        badge.textContent = '新着あり';
        badge.style.cssText = 'background:#ff9800;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;margin-left:8px;cursor:pointer;';
        badge.onclick = function() {
          completedCurrentPage = 0;
          completedFilterReview = 'all';
          completedFilterStar = 'all';
          updateFilterButtons();
          requestCompletedPage();
          badge.remove();
        };
        var header = document.querySelector('.completed-header-row');
        if (header) header.appendChild(badge);
      }
    }

    function hideCompletedNewBadge() {
      var badge = document.querySelector('.completed-new-badge');
      if (badge) badge.remove();
    }

    // Part 3: ページネーション
    var completedTotalForPagination = 0;

    function requestCompletedPage() {
      var limit = getCompletedLimit();
      var offset = completedCurrentPage * limit;
      // フィルタパラメータを構築
      var filterParams = '';
      if (completedFilterReview === 'yes') filterParams += '&reviewed=yes';
      else if (completedFilterReview === 'no') filterParams += '&reviewed=no';
      if (completedFilterStar === 'yes') filterParams += '&starred=yes';
      else if (completedFilterStar === 'no') filterParams += '&starred=no';
      // ソートパラメータを追加
      if (sortState.completed !== 'id') {
        filterParams += '&completedSortField=' + sortState.completed;
      }
      // テキスト検索パラメータを追加
      if (completedSearchTerm) {
        filterParams += '&search=' + encodeURIComponent(completedSearchTerm);
      }

      if (_vscodeApi) {
        _vscodeApi.postMessage({
          command: 'completedPage',
          offset: offset,
          limit: limit,
          reviewed: completedFilterReview !== 'all' ? completedFilterReview : undefined,
          starred: completedFilterStar !== 'all' ? completedFilterStar : undefined,
          completedSortField: sortState.completed !== 'id' ? sortState.completed : undefined,
          search: completedSearchTerm || undefined,
        });
        // 表示設定をextensionに送信（ポーリング時に使用）
        syncCompletedViewState();
      } else {
        // ブラウザ用: 直接APIを呼び出す
        var url = '/dashboard/completed?project=${encodeURIComponent(projectPath)}&offset=' + offset + '&limit=' + limit + filterParams;
        fetch(url)
          .then(function(r) { return r.json(); })
          .then(function(data) {
            updateCompletedSection(data.html, data.total, offset, limit);
          });
      }
    }

    // VSCode Webview用: 表示設定をextensionに送信
    function syncCompletedViewState() {
      if (_vscodeApi) {
        _vscodeApi.postMessage({
          command: 'updateCompletedViewState',
          limit: getCompletedLimit(),
          offset: completedCurrentPage * getCompletedLimit(),
          reviewed: completedFilterReview !== 'all' ? completedFilterReview : undefined,
          starred: completedFilterStar !== 'all' ? completedFilterStar : undefined,
          hash: completedHash,
          completedSortField: sortState.completed !== 'id' ? sortState.completed : undefined
        });
      }
    }

    function updateCompletedSection(html, total, offset, limit) {
      var container = document.querySelector('.completed-tasks-container');
      if (container) {
        // 表示前に楽観的非表示を適用（ちらつき防止）
        container.innerHTML = applyOptimisticHidesToHtml(html);
        restoreExpandedStates();
        attachTaskItemListeners();
      }
      completedTotalForPagination = total;
      // インラインページネーションUI更新
      updateInlinePagination(total, offset, limit);
      // 明示的なページ取得なので新着バッジを非表示
      hideCompletedNewBadge();
      // カウントバッジ更新
      var badge = document.querySelector('.completed-count-toggle');
      if (badge) {
        badge.textContent = limit + '件表示 (' + total + ')';
      }
    }

    function updateInlinePagination(total, offset, limit) {
      var paginationEl = document.getElementById('completedPagination');
      if (!paginationEl) return;
      var totalPages = Math.ceil(total / limit);
      var currentPage = Math.floor(offset / limit);
      if (totalPages <= 1) {
        paginationEl.innerHTML = '<span class="pagination-info">' + total + '件</span>';
      } else {
        paginationEl.innerHTML =
          '<button class="pagination-btn" data-page="' + (currentPage - 1) + '" ' + (currentPage === 0 ? 'disabled' : '') + '>◀</button>' +
          '<span class="pagination-info">' + (currentPage + 1) + '/' + totalPages + '</span>' +
          '<button class="pagination-btn" data-page="' + (currentPage + 1) + '" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>';
      }
    }

    function goCompletedPage(page) {
      if (page < 0) return;
      completedCurrentPage = page;
      requestCompletedPage();
    }

    // 初期表示時にページネーションを表示（件数がページサイズを超える場合）
    function initCompletedPagination() {
      // サーバーから埋め込まれた実際の総件数を使用
      var total = ${completedTotal};
      completedTotalForPagination = total;
      var limit = getCompletedLimit();
      updateInlinePagination(total, 0, limit);
    }
  </script>`;
}
/**
 * ダッシュボードのメインスクリプトを生成
 * イベントハンドラ、WebSocket接続、タスク更新関連のコード
 *
 * @param params - スクリプト生成パラメータ
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export function getDashboardMainScript(params) {
    const { projectPath, serverUrl } = params;
    return `
  <script>
    // task-item内ボタンのリスナーを追加する共通ヘルパー
    function addTaskItemButtonListeners(item) {
      // C-1: レポートリンク (openFile)
      item.querySelectorAll('.report-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
          if (_vscodeApi) {
            e.preventDefault();
            _vscodeApi.postMessage({ command: 'openFile', path: this.dataset.path });
          }
          // ブラウザではデフォルトのhref遷移を許可
        });
      });
      // C-1.5: パスリンク (openFile) - CSP対応でonclick→addEventListenerに移行
      item.querySelectorAll('.path-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
          if (_vscodeApi) {
            e.preventDefault();
            _vscodeApi.postMessage({ command: 'openFile', path: this.dataset.path });
          }
          // ブラウザではデフォルトのhref遷移を許可
        });
      });
      // C-2: レビューボタン (toggleReview)
      item.querySelectorAll('.review-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleReview(e, this.dataset.taskId, this.dataset.newValue === 'true');
        });
      });
      // C-3: スターボタン (toggleStar)
      item.querySelectorAll('.star-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleStar(e, this.dataset.taskId, this.dataset.newValue === 'true');
        });
      });
    }

    // Phase 2: タスク展開機能（初期リスナー設定）
    document.querySelectorAll('.task-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
        if (e.target.closest('a') || e.target.closest('button')) return;
        // スキル候補・改善提案・レビューキューはモーダル表示に統一（アコーディオン無効化）
        if (this.classList.contains('skill-item') || this.classList.contains('improvement-item') || this.classList.contains('review-item')) return;
        this.classList.toggle('expanded');
      });
      addTaskItemButtonListeners(item);
    });

    // Phase 3: 検索機能
    const searchBox = document.getElementById('searchBox');
    const priorityFilter = document.getElementById('priorityFilter');
    const assigneeFilter = document.getElementById('assigneeFilter');

    // 完了タスクの検索状態（debounce関数は冒頭で定義済み）
    var completedSearchTerm = '';

    function filterTasks() {
      const searchTerm = searchBox.value.toLowerCase();
      const priority = priorityFilter.value;
      const assignee = assigneeFilter.value;

      // 進行中タスクはクライアントサイドでフィルタ
      document.querySelectorAll('.task-item').forEach(item => {
        // 完了タスクはサーバーサイド検索で処理
        if (item.closest('.completed-tasks-container')) return;
        const id = item.querySelector('.task-id')?.textContent?.toLowerCase() || '';
        const desc = item.querySelector('.task-desc')?.textContent?.toLowerCase() || '';
        const itemPriority = item.dataset.priority || '';
        const itemAssignee = item.dataset.assignee || '';

        const matchesSearch = !searchTerm || id.includes(searchTerm) || desc.includes(searchTerm);
        const matchesPriority = !priority || itemPriority === priority;
        const matchesAssignee = !assignee || itemAssignee.includes(assignee);

        item.style.display = (matchesSearch && matchesPriority && matchesAssignee) ? '' : 'none';
      });

      // 完了タスクはサーバーサイド検索（デバウンスで呼び出し）
      debouncedCompletedSearch(searchTerm);
    }

    // 完了タスクのサーバーサイド検索
    function searchCompletedTasks(searchTerm) {
      if (completedSearchTerm === searchTerm) return; // 変化なしならスキップ
      completedSearchTerm = searchTerm;
      completedCurrentPage = 0; // 検索時はページをリセット
      requestCompletedPage();
    }

    var debouncedCompletedSearch = debounce(searchCompletedTasks, 300);

    searchBox?.addEventListener('input', filterTasks);
    priorityFilter?.addEventListener('change', filterTasks);
    assigneeFilter?.addEventListener('change', filterTasks);

    // ========================================
    // WebSocket 接続管理
    // ========================================

    let ws = null;
    let wsReconnectAttempts = 0;
    const WS_MAX_RECONNECT_ATTEMPTS = 5;
    const WS_RECONNECT_DELAY = 3000;
    const WS_BACKOFF_FACTOR = 1.5;

    // WebSocket URL を構築
    function getWebSocketUrl() {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = serverBaseUrl.replace(/^https?:\\/\\//, '');
      return wsProtocol + '//' + wsHost + '/dashboard/ws?project=' + encodeURIComponent('${escapeHtml(projectPath)}');
    }

    function connectWebSocket() {
      try {
        const wsUrl = getWebSocketUrl();
        console.log('[WS] Connecting to:', wsUrl);
        ws = new WebSocket(wsUrl);

        ws.onopen = function() {
          console.log('[WS] Connected');
          wsReconnectAttempts = 0;
          // 再接続時は保留中のトランザクションをクリア
          pendingTransactions.clear();
        };

        ws.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketEvent(data);
          } catch (e) {
            console.error('[WS] Parse error:', e);
          }
        };

        ws.onclose = function(event) {
          console.log('[WS] Disconnected:', event.code, event.reason);
          ws = null;
          scheduleReconnect();
        };

        ws.onerror = function(error) {
          console.error('[WS] Error:', error);
        };
      } catch (e) {
        console.error('[WS] Connection failed:', e);
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (wsReconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
        console.log('[WS] Max reconnect attempts reached, real-time updates disabled');
        return;
      }

      wsReconnectAttempts++;
      const delay = WS_RECONNECT_DELAY * Math.pow(WS_BACKOFF_FACTOR, wsReconnectAttempts - 1);
      console.log('[WS] Reconnecting in', delay, 'ms (attempt', wsReconnectAttempts, ')');
      setTimeout(connectWebSocket, delay);
    }

    // タスク一覧を再取得（HTTP API経由）- ブラウザ用
    function fetchTasks() {
      // 現在のフィルタ条件をパラメータに含める
      var params = 'project=' + encodeURIComponent('${escapeHtml(projectPath)}');
      params += '&completedLimit=' + getCompletedLimit();
      params += '&completedOffset=' + (completedCurrentPage * getCompletedLimit());
      if (completedFilterReview !== 'all') {
        params += '&completedReviewed=' + completedFilterReview;
      }
      if (completedFilterStar !== 'all') {
        params += '&completedStarred=' + completedFilterStar;
      }
      if (completedHash) {
        params += '&completedHash=' + encodeURIComponent(completedHash);
      }
      if (sortState.completed !== 'id') {
        params += '&completedSortField=' + sortState.completed;
      }
      if (completedSearchTerm) {
        params += '&completedSearch=' + encodeURIComponent(completedSearchTerm);
      }

      var url = window.location.origin + '/dashboard/data?' + params;
      fetch(url)
        .then(function(response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function(data) {
          if (data.stats) updateStats(data.stats);
          if (data.tasks) updateTaskListsWithMeta(data.tasks, data.completedMeta);
          // V2.1セクションの更新
          if (data.v2Html) {
            updateV2Sections(data.v2Html, data.v2);
          }
        })
        .catch(function(err) {
          console.error('[fetchTasks] Error:', err);
        });
    }

    // ダッシュボードデータを再取得（IDE/ブラウザ判定）
    // タブ復帰時の連続リクエストを防ぐためのタイムスタンプ
    var lastRefreshTime = 0;
    var REFRESH_THROTTLE_MS = 2000; // 2秒以内の連続リクエストを防止

    function refreshDashboard() {
      // スロットリング: 前回のリフレッシュから一定時間経過していない場合はスキップ
      var now = Date.now();
      if (now - lastRefreshTime < REFRESH_THROTTLE_MS) {
        console.log('[refreshDashboard] Throttled (last refresh was', now - lastRefreshTime, 'ms ago)');
        return;
      }
      lastRefreshTime = now;

      console.log('[refreshDashboard] Refreshing dashboard data...');

      if (_vscodeApi) {
        // IDE Webview: extension側にデータ再取得を依頼（fetchがブロックされるため）
        _vscodeApi.postMessage({ command: 'refreshDashboard' });
      } else {
        // ブラウザ: 直接API呼び出し
        // fetchTasks()はupdateTaskListsWithMetaを呼ぶが、V2モード対応済み (#374-11)
        // V2モードでは要対応セクション(v2-master-waiting)のみ更新、V1セクションはスキップ
        fetchTasks();
        // V2 Goals セクションも更新
        if (typeof refreshGoals === 'function') {
          refreshGoals();
        }
      }
    }

    function handleWebSocketEvent(event) {
      switch (event.type) {
        case 'connected':
          console.log('[WS] Session ID:', event.sessionId);
          break;

        case 'stats':
          updateStats(event.data);
          break;

        case 'tasks':
          // V2モード判定: V2専用セクションが存在するかチェック (#374-7)
          var isV2Mode = document.querySelector('[data-section="v2-goals-open"]') !== null;
          if (isV2Mode) {
            if (_vscodeApi) {
              // IDE V2モード: Extension経由でデータを取得（fetchがブロックされるため）(#374-8)
              console.log('[WS] V2 mode (IDE), calling debouncedRefreshDashboard');
              debouncedRefreshDashboard();
            } else {
              // ブラウザ V2モード: Goals系のrefresh関数を直接呼ぶ
              console.log('[WS] V2 mode (browser), calling refreshGoals functions');
              if (typeof refreshGoalsOpen === 'function') {
                refreshGoalsOpen();
              }
              if (typeof refreshGoalsClosed === 'function') {
                refreshGoalsClosed();
              }
              if (typeof refreshGoalsLegacy === 'function') {
                refreshGoalsLegacy();
              }
            }
          } else {
            // V1モード: 従来のupdateTaskListsWithMeta
            updateTaskListsWithMeta(event.data, null);
          }
          // V2.1セクションの更新（v2Htmlが含まれている場合）- ブラウザ版のみ
          if (event.v2Html && !_vscodeApi) {
            updateV2Sections(event.v2Html, event.v2);
          }
          break;

        case 'taskUpdated':
          // タスク更新 → トランザクションID判定
          console.log('[WS] Task updated:', event.taskId, event.field, 'txId:', event.txId);
          if (event.txId && pendingTransactions.has(event.txId)) {
            // 自分の操作 → 楽観的更新済みなのでスキップ
            console.log('[WS] Skipping own transaction:', event.txId);
            pendingTransactions.delete(event.txId);
            break;
          }
          debouncedRefreshDashboard();
          break;

        case 'taskCreated':
          // タスク作成 → トランザクションID判定
          console.log('[WS] Task created:', event.taskId, 'txId:', event.txId);
          if (event.txId && pendingTransactions.has(event.txId)) {
            pendingTransactions.delete(event.txId);
            break;
          }
          debouncedRefreshDashboard();
          break;

        case 'taskAssigned':
          // タスク割り当て → トランザクションID判定
          console.log('[WS] Task assigned:', event.taskId, 'to', event.assignee, 'txId:', event.txId);
          if (event.txId && pendingTransactions.has(event.txId)) {
            pendingTransactions.delete(event.txId);
            break;
          }
          debouncedRefreshDashboard();
          break;

        case 'statusUpdated':
          // ステータス更新 → トランザクションID判定
          console.log('[WS] Status updated:', event.agentId, event.status, 'txId:', event.txId);
          if (event.txId && pendingTransactions.has(event.txId)) {
            pendingTransactions.delete(event.txId);
            break;
          }
          debouncedRefreshDashboard();
          break;

        case 'tasksBatchUpdated':
          // バッチイベント: 自分のtxIdが含まれるイベントを除外して判定
          console.log('[WS] Tasks batch updated:', event.count, 'events');
          var hasOthersEvent = event.events && event.events.some(function(e) {
            if (e.txId && pendingTransactions.has(e.txId)) {
              pendingTransactions.delete(e.txId);
              return false; // 自分のイベント
            }
            return true; // 他者のイベント
          });
          if (hasOthersEvent) {
            debouncedRefreshDashboard();
          }
          break;

        case 'ping':
          // Pong 返信
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          break;

        case 'error':
          console.error('[WS] Server error:', event.message);
          break;

        default:
          console.log('[WS] Unknown event:', event.type);
      }
    }

    // 展開状態を記憶するMap（taskId -> expanded）
    const expandedState = new Map();

    // 完了セクションのハッシュ（差分検知用）
    var completedHash = '';

    // サーバーURLを動的に取得（ブラウザ: location.origin、VSCode Webview: サーバー設定値）
    // 0.0.0.0 はリッスンアドレスであり接続先として不適切なため 127.0.0.1 にfallback
    // window.serverBaseUrl: 他の<script>ブロック（V2 Dashboard Scripts等）からも参照可能にする（#374-7）
    var serverBaseUrl = (typeof acquireVsCodeApi !== 'undefined')
      ? '${serverUrl}'.replace('0.0.0.0', '127.0.0.1')
      : window.location.origin;
    window.serverBaseUrl = serverBaseUrl;

    function updateTaskListsWithMeta(tasks, completedMeta) {
      if (!tasks) return;

      // 現在の展開状態を保存
      saveExpandedStates();

      // V2モード判定 (#374-11)
      var isV2Mode = document.querySelector('[data-section="v2-goals-open"]') !== null;

      if (isV2Mode) {
        // V2モード: V1セクション（pending, working）は存在しないので更新しない
        // 要対応セクションはV2用のセレクタで更新
        if (tasks.masterWaiting !== undefined || tasks.masterReview !== undefined) {
          updateTaskSection('[data-section="v2-master-waiting"]',
            (tasks.masterWaiting || '') + (tasks.masterReview || ''));
          // カウントバッジも更新
          var v2MasterWaitingBadge = document.querySelector('.v2-master-waiting-section .count-badge');
          if (v2MasterWaitingBadge) {
            // HTMLからタスク数をカウント（task-itemクラスの数）
            var tempDiv = document.createElement('div');
            tempDiv.innerHTML = (tasks.masterWaiting || '') + (tasks.masterReview || '');
            var count = tempDiv.querySelectorAll('.task-item').length;
            v2MasterWaitingBadge.textContent = String(count);
          }
        }
        console.log('[updateTaskListsWithMeta] V2 mode: updated v2-master-waiting section');
      } else {
        // V1モード: 従来通り
        // 完了以外のセクションを更新
        if (tasks.pending) {
          updateTaskSection('[data-section="pending"]', tasks.pending);
        }
        if (tasks.working) {
          updateTaskSection('[data-section="working"]', tasks.working);
        }
        if (tasks.masterWaiting !== undefined || tasks.masterReview !== undefined) {
          // ⚠️対応待ちセクション全体を更新
          updateTaskSection('[data-section="master-waiting"]',
            (tasks.masterWaiting || '') + (tasks.masterReview || ''));
        }
        if (tasks.skillCandidates) {
          updateTaskSection('[data-section="skill-candidates"]', tasks.skillCandidates);
        }
        if (tasks.improvements) {
          updateTaskSection('[data-section="improvements"]', tasks.improvements);
        }
      }

      // 完了セクション: ハッシュ比較で変更があった場合のみ更新
      if (completedMeta) {
        if (completedMeta.changed && tasks.completed) {
          // 変更あり: HTMLを更新（表示前に楽観的非表示を適用）
          var completedContainer = document.querySelector('.completed-tasks-container');
          if (completedContainer) {
            completedContainer.innerHTML = applyOptimisticHidesToHtml(tasks.completed);
            restoreExpandedStates();
            attachTaskItemListeners();
          }
          completedTotalForPagination = completedMeta.total;
          updateInlinePagination(completedMeta.total, completedCurrentPage * getCompletedLimit(), getCompletedLimit());
          // カウントバッジ更新
          var badge = document.querySelector('.completed-count-toggle');
          if (badge) {
            badge.textContent = getCompletedLimit() + '件表示 (' + completedMeta.total + ')';
          }
          hideCompletedNewBadge();
        }
        // ハッシュを更新
        completedHash = completedMeta.hash;
        // VSCode Webview: ハッシュをextensionに同期
        syncCompletedViewState();
      }

      // 展開状態を復元
      restoreExpandedStates();

      // イベントリスナーを再設定
      attachTaskItemListeners();

      // ソート状態を再適用
      Object.keys(sortState).forEach(function(section) {
        if (sortState[section] !== 'id' && section !== 'completed') {
          sortTaskItems(section, sortState[section]);
        }
      });

      // フィルタを再適用
      filterTasks();
    }

    // V2.1セクションを更新
    function updateV2Sections(v2Html, v2Data) {
      if (!v2Html) return;

      // Goals セクション
      // サーバーから送られるHTMLは初回ロード時のパラメータ（全件）なので、
      // 現在のフィルタ状態を維持するために refreshGoals() で再取得する
      // ただしIDE版ではfetchがブロックされるため、Extension側でデータ取得済み (#374-8)
      if (v2Html.goals && !_vscodeApi) {
        console.log('[updateV2Sections] Goals update detected, refreshing with current filters (browser mode)');
        refreshGoals();
      } else if (v2Html.goals && _vscodeApi) {
        console.log('[updateV2Sections] Goals update detected, skipping refreshGoals (IDE mode - data from Extension)');
      }

      // Review Queue セクション
      if (v2Html.reviewQueue) {
        const reviewSection = document.querySelector('.v2-review-section .collapsible-content');
        if (reviewSection) {
          reviewSection.innerHTML = v2Html.reviewQueue;
        }
        const reviewBadge = document.querySelector('.v2-review-section .count-badge');
        if (reviewBadge && v2Data && v2Data.v2ReviewQueue) {
          reviewBadge.textContent = v2Data.v2ReviewQueue.length;
        }
      }

      // Artifacts セクション
      if (v2Html.artifacts) {
        const artifactsSection = document.querySelector('.v2-artifacts-section .collapsible-content');
        if (artifactsSection) {
          artifactsSection.innerHTML = v2Html.artifacts;
        }
        const artifactsBadge = document.querySelector('.v2-artifacts-section .count-badge');
        if (artifactsBadge && v2Data && v2Data.v2Artifacts) {
          artifactsBadge.textContent = v2Data.v2Artifacts.length;
        }
      }

      // Stats セクション
      if (v2Html.stats) {
        const statsSection = document.querySelector('.v2-stats-section');
        if (statsSection) {
          const statsContent = statsSection.querySelector('.grid-stats');
          if (statsContent) {
            statsContent.outerHTML = v2Html.stats;
          }
        }
      }
    }

    function updateStats(stats) {
      if (!stats) return;
      const mapping = {
        pendingCount: '.stat-pending .stat-value',
        workingCount: '.stat-working .stat-value',
        masterWaitingCount: '.stat-blocked .stat-value',
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

    // 展開状態を保存（3値管理: 'open' / 'closed' / 未操作）
    function saveExpandedStates() {
      document.querySelectorAll('.task-item').forEach(item => {
        const taskId = item.dataset.id;
        if (!taskId) return;
        if (item.classList.contains('expanded')) {
          expandedState.set(taskId, 'open');
        } else {
          expandedState.set(taskId, 'closed');
        }
      });
    }

    // 展開状態を復元（3値管理: 'open' / 'closed' / 未操作）
    function restoreExpandedStates() {
      document.querySelectorAll('.task-item').forEach(item => {
        const taskId = item.dataset.id;
        if (!taskId) return;
        const state = expandedState.get(taskId);
        if (state === 'open') {
          item.classList.add('expanded');
        } else if (state === 'closed') {
          item.classList.remove('expanded');
        }
        // state === undefined の場合は何もしない（未操作 = 現状維持）
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
      if (tasks.completed) {
        if (isCompletedDefaultView()) {
          // デフォルト表示: 通常通り完了セクションを更新（表示前に楽観的非表示を適用）
          var completedContainer = document.querySelector('.completed-tasks-container');
          if (completedContainer) {
            completedContainer.innerHTML = applyOptimisticHidesToHtml(tasks.completed);
          } else {
            updateTaskSection('[data-section="completed"]', tasks.completed);
          }
          initCompletedPagination();
        } else {
          // カスタム表示: 更新スキップ、「新着あり」バッジを表示
          showCompletedNewBadge();
        }
      }
      if (tasks.masterWaiting !== undefined || tasks.masterReview !== undefined) {
        updateTaskSection('[data-section="master-waiting"]',
          (tasks.masterWaiting || '') + (tasks.masterReview || ''));
      }
      if (tasks.skillCandidates) {
        updateTaskSection('[data-section="skill-candidates"]', tasks.skillCandidates);
      }
      if (tasks.improvements) {
        updateTaskSection('[data-section="improvements"]', tasks.improvements);
      }

      // 展開状態を復元
      restoreExpandedStates();

      // イベントリスナーを再設定
      attachTaskItemListeners();

      // ソート状態を再適用
      Object.keys(sortState).forEach(function(section) {
        if (sortState[section] !== 'id' && section !== 'completed') {
          sortTaskItems(section, sortState[section]);
        }
      });

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
        // 既にリスナーが設定済みならスキップ（重複防止）
        if (item.dataset.hasListener === 'true') return;
        item.dataset.hasListener = 'true';

        item.addEventListener('click', function(e) {
          // フォーム要素やリンクのクリックでは展開/折りたたみしない
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
          if (e.target.closest('a') || e.target.closest('button')) return;
          // スキル候補・改善提案・レビューキューはモーダル表示に統一（アコーディオン無効化）
          if (this.classList.contains('skill-item') || this.classList.contains('improvement-item') || this.classList.contains('review-item')) return;
          this.classList.toggle('expanded');
        });

        addTaskItemButtonListeners(item);
      });
    }

    // WebSocket接続を開始（ブラウザ/VSCode両方で）
    try {
      connectWebSocket();
    } catch (e) {
      console.error('[WS] WebSocket initialization failed:', e);
    }

    // 初期表示: ページネーションとフィルターを初期化
    initCompletedPagination();

    // bfcache（Back/Forward Cache）からの復元時にデータを再取得
    window.addEventListener('pageshow', function(event) {
      if (event.persisted) {
        console.log('[Dashboard] Restored from bfcache, refreshing data...');
        refreshDashboard();
      }
    });

    // スリープ復帰時にデータを再取得（Page Visibility API）
    // iOS Safari / Android Chrome / PC全ブラウザ対応
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        console.log('[Dashboard] Page became visible, refreshing data...');
        refreshDashboard();
      }
    });

    // === addEventListener登録（インラインonclick置換） ===

    // A-1: ソートボタン
    document.querySelectorAll('.sort-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        toggleSort(this.dataset.section, this.dataset.sort);
      });
    });

    // A-2: 表示件数トグル
    var countToggle = document.querySelector('.completed-count-toggle');
    if (countToggle) {
      countToggle.addEventListener('click', toggleCompletedLimit);
    }

    // A-3: フィルターボタン
    document.querySelectorAll('.filter-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        cycleFilter(this.dataset.filter);
      });
    });

    // B-1: ページネーション（イベント委任）
    var paginationRoot = document.getElementById('completedPagination');
    if (paginationRoot) {
      paginationRoot.addEventListener('click', function(e) {
        var btn = e.target.closest('.pagination-btn');
        if (btn && !btn.disabled) {
          var page = parseInt(btn.dataset.page, 10);
          goCompletedPage(page);
        }
      });
    }
  </script>`;
}
/**
 * レポートオーバーレイ用スクリプトを生成
 *
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export function getReportOverlayScript() {
    return `
  <script>
    function showReportOverlay(html, fileName) {
      document.getElementById('reportTitle').textContent = '📄 ' + fileName;
      document.getElementById('reportContent').innerHTML = html;
      document.getElementById('reportOverlay').classList.add('visible');
    }
    function closeReportOverlay() {
      document.getElementById('reportOverlay').classList.remove('visible');
    }
    // A-4: レポートオーバーレイ閉じる（M-1: 第3スクリプトブロック内に配置）
    var closeBtn = document.querySelector('.report-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeReportOverlay);
    }
  </script>`;
}
/**
 * V2.1 Dashboard用スクリプトを生成
 * Goal展開/折りたたみ機能を提供
 *
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export function getV2DashboardScript() {
    return `
  <script>
    // ========================================
    // V2.1 Dashboard Scripts
    // ========================================

    // サーバーURLを取得（getDashboardMainScriptで設定されたグローバル変数を参照）（#374-7）
    var serverBaseUrl = window.serverBaseUrl || window.location.origin;

    // V2.1 Goals ページネーション状態（Open/Closed 別管理）
    // Open（進行中）- ページネーションあり
    var v2GoalsOpenCurrentPage = 0;
    var v2GoalsOpenLimit = 10;
    var v2GoalsOpenTotal = 0;
    var v2GoalsOpenSortField = 'id';
    var v2GoalsOpenSortOrder = 'desc';

    // Closed（完了済み）- ページネーションあり
    var v2GoalsClosedCurrentPage = 0;
    var v2GoalsClosedLimit = 10;
    var v2GoalsClosedTotal = 0;
    var v2GoalsClosedSortField = 'id';
    var v2GoalsClosedSortOrder = 'desc';

    // 後方互換用（古いコードで参照されている場合用）
    var v2GoalsCurrentPage = 0;
    var v2GoalsLimit = 10;
    var v2GoalsTotal = 0;
    var v2GoalsSortField = 'id';
    var v2GoalsSortOrder = 'desc';

    /**
     * Goal展開/折りたたみを切り替える
     * @param {HTMLElement} header - クリックされたgoal-header要素
     */
    function toggleGoal(header) {
      var goalItem = header.closest('.goal-item');
      if (!goalItem) return;

      var toggle = header.querySelector('.goal-toggle');
      var content = goalItem.querySelector('.goal-content');
      // content が null でも toggle の状態は変更する（phases が空の Goal 対応）

      // 折りたたみ状態を切り替え
      if (toggle.classList.contains('collapsed')) {
        // 展開する
        toggle.classList.remove('collapsed');
        if (content) content.style.display = '';
      } else {
        // 折りたたむ
        toggle.classList.add('collapsed');
        if (content) content.style.display = 'none';
      }
    }

    /**
     * Phase展開/折りたたみを切り替える
     * @param {HTMLElement} header - クリックされたphase-header要素
     */
    function togglePhase(header) {
      var phaseItem = header.closest('.phase-item');
      if (!phaseItem) return;

      var stepList = phaseItem.querySelector('.step-list');
      if (!stepList) return;

      // 折りたたみ状態を切り替え
      if (phaseItem.classList.contains('collapsed')) {
        // 展開する
        phaseItem.classList.remove('collapsed');
        stepList.style.display = '';
      } else {
        // 折りたたむ
        phaseItem.classList.add('collapsed');
        stepList.style.display = 'none';
      }
    }

    // V2.1初期化関数（DOMContentLoaded対応）
    function initV2Dashboard() {
      console.log('[V2.1] initV2Dashboard called');
      initGoalTree();
      setupGoalTreeEventDelegation();
      initGoalsFilter();
      initTaskIdClickHandler();
      initArchiveButtons();
      initCloseGoalButtons();
      initSpecialSectionModalClick();

      // 進行中セクションのソートボタン
      var sortOpenIdBtn = document.getElementById('v2-goals-open-sort-id');
      var sortOpenUpdBtn = document.getElementById('v2-goals-open-sort-updated');
      if (sortOpenIdBtn) {
        sortOpenIdBtn.addEventListener('click', function() { sortGoalsOpen('id'); });
      }
      if (sortOpenUpdBtn) {
        sortOpenUpdBtn.addEventListener('click', function() { sortGoalsOpen('updated'); });
      }

      // 進行中セクションの件数制限ボタン
      var limitGroupOpen = document.getElementById('v2-goals-open-limit-group');
      if (limitGroupOpen) {
        limitGroupOpen.addEventListener('click', function(e) {
          var btn = e.target.closest('.v2-toggle-btn');
          if (!btn) return;
          if (btn.classList.contains('active')) return;
          limitGroupOpen.querySelectorAll('.v2-toggle-btn').forEach(function(b) {
            b.classList.remove('active');
          });
          btn.classList.add('active');
          v2GoalsOpenLimit = parseInt(btn.dataset.value, 10) || 10;
          v2GoalsOpenCurrentPage = 0;
          refreshGoalsOpen();
        });
      }

      // 進行中セクションのページネーション
      var paginationRootOpen = document.getElementById('v2-goals-open-pagination');
      if (paginationRootOpen) {
        paginationRootOpen.addEventListener('click', function(e) {
          var btn = e.target.closest('.v2-goals-open-page-btn');
          if (!btn || btn.disabled) return;
          var page = parseInt(btn.dataset.page, 10);
          if (!isNaN(page)) {
            goV2GoalsOpenPage(page);
          }
        });
      }

      // 完了済みセクションのソートボタン
      var sortClosedIdBtn = document.getElementById('v2-goals-closed-sort-id');
      var sortClosedUpdBtn = document.getElementById('v2-goals-closed-sort-updated');
      if (sortClosedIdBtn) {
        sortClosedIdBtn.addEventListener('click', function() { sortGoalsClosed('id'); });
      }
      if (sortClosedUpdBtn) {
        sortClosedUpdBtn.addEventListener('click', function() { sortGoalsClosed('updated'); });
      }

      // 完了済みセクションの件数制限ボタン
      var limitGroup = document.getElementById('v2-goals-closed-limit-group');
      if (limitGroup) {
        limitGroup.addEventListener('click', function(e) {
          var btn = e.target.closest('.v2-toggle-btn');
          if (!btn) return;
          if (btn.classList.contains('active')) return;
          limitGroup.querySelectorAll('.v2-toggle-btn').forEach(function(b) {
            b.classList.remove('active');
          });
          btn.classList.add('active');
          v2GoalsClosedLimit = parseInt(btn.dataset.value, 10) || 10;
          v2GoalsClosedCurrentPage = 0;
          refreshGoalsClosed();
        });
      }

      // 完了済みセクションのページネーション
      var paginationRoot = document.getElementById('v2-goals-closed-pagination');
      if (paginationRoot) {
        paginationRoot.addEventListener('click', function(e) {
          var btn = e.target.closest('.v2-goals-closed-page-btn');
          if (!btn || btn.disabled) return;
          var page = parseInt(btn.dataset.page, 10);
          if (!isNaN(page)) {
            goV2GoalsClosedPage(page);
          }
        });
      }

      // 両セクションを初期化
      setTimeout(function() {
        refreshGoalsOpen();
        refreshGoalsClosed();
      }, 0);
    }

    // DOMContentLoaded: 初期化（既に読み込み済みの場合も対応）
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initV2Dashboard);
    } else {
      initV2Dashboard();
    }

    /**
     * イベント委任パターンでGoalツリーのクリックを処理
     * document全体にリスナーを設定し、動的要素にも対応
     */
    function setupGoalTreeEventDelegation() {
      // 既に設定済みならスキップ
      if (document.body.dataset.goalTreeDelegation === 'true') {
        console.log('[V2.1] Event delegation already set up');
        return;
      }
      document.body.dataset.goalTreeDelegation = 'true';

      document.body.addEventListener('click', function(e) {
        var target = e.target;

        // リンクやボタンのクリックは除外
        if (target.closest('a') || target.closest('button')) return;

        // goal-headerのクリックをチェック
        var goalHeader = target.closest('.goal-header');
        if (goalHeader) {
          console.log('[V2.1] Goal header clicked via delegation');
          e.stopPropagation();
          toggleGoal(goalHeader);
          return;
        }

        // phase-headerのクリックをチェック
        var phaseHeader = target.closest('.phase-header');
        if (phaseHeader) {
          console.log('[V2.1] Phase header clicked via delegation');
          e.stopPropagation();
          togglePhase(phaseHeader);
          return;
        }
      });

      console.log('[V2.1] Event delegation set up on document.body');
    }

    /**
     * Goalツリーを初期化（折りたたみ済みのGoalを非表示に）
     */
    function initGoalTree() {
      console.log('[V2.1] initGoalTree called');

      // goal-headerの存在確認
      var goalHeaders = document.querySelectorAll('.goal-header');
      console.log('[V2.1] Found goal-headers:', goalHeaders.length);

      // .collapsed クラスを持つtoggleの親Goalのcontentを非表示
      var collapsedToggles = document.querySelectorAll('.goal-toggle.collapsed');
      console.log('[V2.1] Found collapsed toggles:', collapsedToggles.length);

      collapsedToggles.forEach(function(toggle) {
        var goalItem = toggle.closest('.goal-item');
        if (goalItem) {
          var content = goalItem.querySelector('.goal-content');
          if (content) {
            content.style.display = 'none';
          }
        }
      });

      // phase-headerのphase-item.collapsedも初期化
      document.querySelectorAll('.phase-item.collapsed').forEach(function(phaseItem) {
        var stepList = phaseItem.querySelector('.step-list');
        if (stepList) {
          stepList.style.display = 'none';
        }
      });
    }

    // V2.1データが動的に更新された場合の再初期化関数
    function reinitGoalTree() {
      console.log('[V2.1] reinitGoalTree called');
      initGoalTree();
    }

    // ========================================
    // V2.1 Goals Filter
    // ========================================

    /**
     * Goalsフィルタの初期化
     * archivedチェックボックスの監視（完了済みセクション用）
     * 注: ページネーション・件数制限はinitV2Dashboard()で設定済み
     */
    function initGoalsFilter() {
      console.log('[V2.1] initGoalsFilter called');
      var archivedCheckbox = document.getElementById('v2-goals-show-archived');

      console.log('[V2.1] archivedCheckbox:', archivedCheckbox ? 'found' : 'not found');

      // アーカイブ表示チェックボックス（完了済みセクション用）
      if (archivedCheckbox) {
        archivedCheckbox.addEventListener('change', function() {
          console.log('[V2.1] Archived checkbox changed to:', archivedCheckbox.checked);
          v2GoalsClosedCurrentPage = 0; // フィルタ変更時はページ1に戻す
          refreshGoalsClosed();
        });
      }
    }

    // Goalsソート状態管理
    var goalsSortState = 'id-desc'; // 'id-desc' | 'id-asc' | 'updated-desc'

    /**
     * Goals一覧をソート
     * @param {string} sortBy - ソート条件（'id' または 'updated'）
     */
    function sortGoals(sortBy) {
      // サーバーサイドソートを使用
      // ソート状態を更新
      if (sortBy === 'id') {
        if (v2GoalsSortField === 'id') {
          // 同じフィールドならasc/desc切り替え
          v2GoalsSortOrder = v2GoalsSortOrder === 'desc' ? 'asc' : 'desc';
        } else {
          v2GoalsSortField = 'id';
          v2GoalsSortOrder = 'desc';
        }
        goalsSortState = v2GoalsSortOrder === 'desc' ? 'id-desc' : 'id-asc';
      } else {
        // 更新日時ソートも同様にasc/desc切り替え
        if (v2GoalsSortField === 'updatedAt') {
          v2GoalsSortOrder = v2GoalsSortOrder === 'desc' ? 'asc' : 'desc';
        } else {
          v2GoalsSortField = 'updatedAt';
          v2GoalsSortOrder = 'desc';
        }
        goalsSortState = v2GoalsSortOrder === 'desc' ? 'updated-desc' : 'updated-asc';
      }

      // ソート変更時はページ1に戻す
      v2GoalsCurrentPage = 0;

      // ソートボタンの状態更新
      updateGoalsSortButtons();
      console.log('[sortGoals] Server-side sort:', v2GoalsSortField, v2GoalsSortOrder);

      // APIを再リクエスト
      refreshGoals();
    }

    /**
     * 現在のソート状態でGoalsをソート（状態変更なし）
     * フィルタ適用後に呼び出してソート順を維持
     */
    function applyCurrentSort() {
      var goalsList = document.getElementById('v2-goals-list');
      if (!goalsList) return;

      var goalItems = Array.from(goalsList.querySelectorAll('.goal-item'));
      if (goalItems.length === 0) return;

      // 現在のソート状態でソート実行
      goalItems.sort(function(a, b) {
        if (goalsSortState === 'id-desc' || goalsSortState === 'id-asc') {
          var idA = a.getAttribute('data-id') || '';
          var idB = b.getAttribute('data-id') || '';
          var cmp = compareGoalIds(idA, idB);
          return goalsSortState === 'id-desc' ? -cmp : cmp;
        } else {
          // updated-desc: 新しい順=降順
          var updA = a.getAttribute('data-updated') || '';
          var updB = b.getAttribute('data-updated') || '';
          if (updA && updB) {
            var timeA = new Date(updA).getTime();
            var timeB = new Date(updB).getTime();
            return timeB - timeA;  // 降順: 新しい方が前
          } else if (updA && !updB) {
            return -1;
          } else if (!updA && updB) {
            return 1;
          }
          return -compareGoalIds(a.getAttribute('data-id') || '', b.getAttribute('data-id') || '');
        }
      });

      // DOM再配置
      goalItems.forEach(function(item) {
        goalsList.appendChild(item);
      });
    }

    /**
     * Goal IDを比較（数字部分を考慮）
     */
    function compareGoalIds(a, b) {
      var partsA = a.split('-');
      var partsB = b.split('-');
      for (var i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        var pa = i < partsA.length ? parseInt(partsA[i], 10) : -1;
        var pb = i < partsB.length ? parseInt(partsB[i], 10) : -1;
        if (isNaN(pa)) pa = -1;
        if (isNaN(pb)) pb = -1;
        if (pa !== pb) return pa - pb;
      }
      return 0;
    }

    /**
     * ソートボタンの表示を更新
     */
    function updateGoalsSortButtons() {
      var idBtn = document.getElementById('v2-goals-sort-id');
      var updBtn = document.getElementById('v2-goals-sort-updated');
      if (idBtn) {
        idBtn.classList.toggle('active', goalsSortState.startsWith('id'));
        idBtn.textContent = goalsSortState === 'id-asc' ? '#↑' : '#↓';
      }
      if (updBtn) {
        updBtn.classList.toggle('active', goalsSortState.startsWith('updated'));
        // 📅↓ = 新しい順（降順）、📅↑ = 古い順（昇順）
        updBtn.textContent = goalsSortState === 'updated-asc' ? '📅↑' : '📅↓';
      }
    }

    /**
     * 進行中（Open）Goals一覧をサーバーから取得（ページネーション対応）
     */
    function refreshGoalsOpen() {
      var offset = v2GoalsOpenCurrentPage * v2GoalsOpenLimit;

      // IDE版対応: 相対URLではなく絶対URLを使用（#374-6）
      var url = serverBaseUrl + '/dashboard/v2/goals?project=' + encodeURIComponent(window.v2ProjectPath || '') +
        '&offset=' + offset +
        '&limit=' + v2GoalsOpenLimit +
        '&status=open' +
        '&archived=false' +
        '&sort=' + v2GoalsOpenSortField +
        '&order=' + v2GoalsOpenSortOrder;

      console.log('[refreshGoalsOpen] Fetching:', url);

      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          updateV2GoalsOpenSection(data.goals, data.total, data.offset, data.limit);
        })
        .catch(function(err) {
          console.error('[refreshGoalsOpen] Error:', err);
        });
    }

    /**
     * 完了済み（Closed）Goals一覧をサーバーから取得（ページネーション対応）
     */
    function refreshGoalsClosed() {
      var archivedCheckbox = document.getElementById('v2-goals-show-archived');
      var showArchived = archivedCheckbox ? archivedCheckbox.checked : false;
      var offset = v2GoalsClosedCurrentPage * v2GoalsClosedLimit;

      // IDE版対応: 相対URLではなく絶対URLを使用（#374-6）
      var url = serverBaseUrl + '/dashboard/v2/goals?project=' + encodeURIComponent(window.v2ProjectPath || '') +
        '&offset=' + offset +
        '&limit=' + v2GoalsClosedLimit +
        '&status=closed' +
        '&archived=' + showArchived +
        '&sort=' + v2GoalsClosedSortField +
        '&order=' + v2GoalsClosedSortOrder;

      console.log('[refreshGoalsClosed] Fetching:', url);

      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          updateV2GoalsClosedSection(data.goals, data.total, data.offset, data.limit);
        })
        .catch(function(err) {
          console.error('[refreshGoalsClosed] Error:', err);
        });
    }

    /**
     * 進行中セクションを更新
     */
    function updateV2GoalsOpenSection(goals, total, offset, limit) {
      var goalsList = document.getElementById('v2-goals-open-list');
      if (!goalsList) return;

      v2GoalsOpenTotal = total;

      if (goals && goals.length > 0) {
        var html = goals.map(function(goal) {
          return renderGoalItem(goal);
        }).join('\\n');
        goalsList.innerHTML = html;
      } else {
        goalsList.innerHTML = '<div class="empty-message">進行中のタスクはありません</div>';
      }

      // カウントバッジを更新
      var countBadge = document.getElementById('v2-goals-open-count');
      if (countBadge) {
        countBadge.textContent = String(total);
      }

      // ページネーションUIを更新
      updateV2GoalsOpenPagination(total, offset, limit);

      initGoalTree();
      console.log('[updateV2GoalsOpenSection] Updated: total=' + total + ', offset=' + offset);
    }

    /**
     * 完了済みセクションを更新
     */
    function updateV2GoalsClosedSection(goals, total, offset, limit) {
      var goalsList = document.getElementById('v2-goals-closed-list');
      if (!goalsList) return;

      v2GoalsClosedTotal = total;

      if (goals && goals.length > 0) {
        var html = goals.map(function(goal) {
          return renderGoalItem(goal);
        }).join('\\n');
        goalsList.innerHTML = html;
      } else {
        goalsList.innerHTML = '<div class="empty-message">完了済みタスクはありません</div>';
      }

      // カウントバッジを更新
      var countBadge = document.getElementById('v2-goals-closed-count');
      if (countBadge) {
        countBadge.textContent = String(total);
      }

      // ページネーションUIを更新
      updateV2GoalsClosedPagination(total, offset, limit);

      initGoalTree();
      console.log('[updateV2GoalsClosedSection] Updated: total=' + total + ', offset=' + offset);
    }

    /**
     * 完了済みセクションのページネーションを更新
     */
    function updateV2GoalsClosedPagination(total, offset, limit) {
      var paginationEl = document.getElementById('v2-goals-closed-pagination');
      if (!paginationEl) return;

      var totalPages = Math.ceil(total / limit);
      var currentPage = Math.floor(offset / limit);

      if (totalPages <= 1) {
        paginationEl.innerHTML = '<span class="pagination-info">' + total + '件</span>';
      } else {
        paginationEl.innerHTML =
          '<button class="pagination-btn v2-goals-closed-page-btn" data-page="' + (currentPage - 1) + '" ' + (currentPage === 0 ? 'disabled' : '') + '>◀</button>' +
          '<span class="pagination-info">' + (currentPage + 1) + '/' + totalPages + '</span>' +
          '<button class="pagination-btn v2-goals-closed-page-btn" data-page="' + (currentPage + 1) + '" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>';
      }
    }

    /**
     * 完了済みセクションのページを変更
     */
    function goV2GoalsClosedPage(page) {
      if (page < 0) return;
      var totalPages = Math.ceil(v2GoalsClosedTotal / v2GoalsClosedLimit);
      if (page >= totalPages) return;
      v2GoalsClosedCurrentPage = page;
      refreshGoalsClosed();
    }

    /**
     * 進行中セクションのページネーションを更新
     */
    function updateV2GoalsOpenPagination(total, offset, limit) {
      var paginationEl = document.getElementById('v2-goals-open-pagination');
      if (!paginationEl) return;

      var totalPages = Math.ceil(total / limit);
      var currentPage = Math.floor(offset / limit);

      if (totalPages <= 1) {
        paginationEl.innerHTML = '<span class="pagination-info">' + total + '件</span>';
      } else {
        paginationEl.innerHTML =
          '<button class="pagination-btn v2-goals-open-page-btn" data-page="' + (currentPage - 1) + '" ' + (currentPage === 0 ? 'disabled' : '') + '>◀</button>' +
          '<span class="pagination-info">' + (currentPage + 1) + '/' + totalPages + '</span>' +
          '<button class="pagination-btn v2-goals-open-page-btn" data-page="' + (currentPage + 1) + '" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>';
      }
    }

    /**
     * 進行中セクションのページを変更
     */
    function goV2GoalsOpenPage(page) {
      if (page < 0) return;
      var totalPages = Math.ceil(v2GoalsOpenTotal / v2GoalsOpenLimit);
      if (page >= totalPages) return;
      v2GoalsOpenCurrentPage = page;
      refreshGoalsOpen();
    }

    /**
     * 進行中セクションのソート
     */
    function sortGoalsOpen(field) {
      if (v2GoalsOpenSortField === field) {
        v2GoalsOpenSortOrder = v2GoalsOpenSortOrder === 'desc' ? 'asc' : 'desc';
      } else {
        v2GoalsOpenSortField = field;
        v2GoalsOpenSortOrder = 'desc';
      }
      v2GoalsOpenCurrentPage = 0;  // ソート変更時はページをリセット
      updateGoalsOpenSortButtons();
      refreshGoalsOpen();
    }

    /**
     * 完了済みセクションのソート
     */
    function sortGoalsClosed(field) {
      if (v2GoalsClosedSortField === field) {
        v2GoalsClosedSortOrder = v2GoalsClosedSortOrder === 'desc' ? 'asc' : 'desc';
      } else {
        v2GoalsClosedSortField = field;
        v2GoalsClosedSortOrder = 'desc';
      }
      updateGoalsClosedSortButtons();
      v2GoalsClosedCurrentPage = 0;
      refreshGoalsClosed();
    }

    /**
     * 進行中セクションのソートボタン表示を更新
     */
    function updateGoalsOpenSortButtons() {
      var idBtn = document.getElementById('v2-goals-open-sort-id');
      var updBtn = document.getElementById('v2-goals-open-sort-updated');
      if (idBtn) {
        idBtn.classList.toggle('active', v2GoalsOpenSortField === 'id');
        idBtn.textContent = v2GoalsOpenSortField === 'id' && v2GoalsOpenSortOrder === 'asc' ? '#↑' : '#↓';
      }
      if (updBtn) {
        updBtn.classList.toggle('active', v2GoalsOpenSortField === 'updatedAt');
        updBtn.textContent = v2GoalsOpenSortField === 'updatedAt' && v2GoalsOpenSortOrder === 'asc' ? '📅↑' : '📅↓';
      }
    }

    /**
     * 完了済みセクションのソートボタン表示を更新
     */
    function updateGoalsClosedSortButtons() {
      var idBtn = document.getElementById('v2-goals-closed-sort-id');
      var updBtn = document.getElementById('v2-goals-closed-sort-updated');
      if (idBtn) {
        idBtn.classList.toggle('active', v2GoalsClosedSortField === 'id');
        idBtn.textContent = v2GoalsClosedSortField === 'id' && v2GoalsClosedSortOrder === 'asc' ? '#↑' : '#↓';
      }
      if (updBtn) {
        updBtn.classList.toggle('active', v2GoalsClosedSortField === 'updatedAt');
        updBtn.textContent = v2GoalsClosedSortField === 'updatedAt' && v2GoalsClosedSortOrder === 'asc' ? '📅↑' : '📅↓';
      }
    }

    /**
     * Goals一覧をサーバーから取得（後方互換用 - 両セクションを更新）
     */
    function refreshGoals() {
      refreshGoalsOpen();
      refreshGoalsClosed();
    }

    /**
     * Goals一覧をサーバーから取得（旧実装 - 使用されなくなったがWebSocket等での呼び出し用に残す）
     */
    function refreshGoalsLegacy() {
      var statusGroup = document.getElementById('v2-goals-status-group');
      var archivedCheckbox = document.getElementById('v2-goals-show-archived');

      // アクティブなトグルボタンからステータスを取得
      var activeStatusBtn = statusGroup ? statusGroup.querySelector('.v2-toggle-btn.active') : null;
      var status = activeStatusBtn ? activeStatusBtn.dataset.value : 'open';
      var showArchived = archivedCheckbox ? archivedCheckbox.checked : false;

      var offset = v2GoalsCurrentPage * v2GoalsLimit;
      // IDE版対応: 相対URLではなく絶対URLを使用（#374-6）
      var url = serverBaseUrl + '/dashboard/v2/goals?project=' + encodeURIComponent(window.v2ProjectPath || '') +
        '&offset=' + offset +
        '&limit=' + v2GoalsLimit +
        '&status=' + status +
        '&archived=' + showArchived +
        '&sort=' + v2GoalsSortField +
        '&order=' + v2GoalsSortOrder;

      console.log('[refreshGoals] Fetching:', url);

      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          updateV2GoalsSection(data.goals, data.total, data.offset, data.limit);
        })
        .catch(function(err) {
          console.error('[refreshGoals] Error:', err);
        });
    }

    /**
     * Goalsセクションを更新
     */
    function updateV2GoalsSection(goals, total, offset, limit) {
      var goalsList = document.getElementById('v2-goals-list');
      if (!goalsList) return;

      v2GoalsTotal = total;

      // HTMLを生成（サーバーから返されたgoals配列をレンダリング）
      if (goals && goals.length > 0) {
        var html = goals.map(function(goal) {
          return renderGoalItem(goal);
        }).join('\\n');
        goalsList.innerHTML = html;
      } else {
        goalsList.innerHTML = '<div class="empty-message">なし</div>';
      }

      // カウントバッジを更新
      var countBadge = document.getElementById('v2-goals-count');
      if (countBadge) {
        countBadge.textContent = String(total);
      }

      // ページネーションUIを更新
      updateV2GoalsPagination(total, offset, limit);

      // Goalツリーを再初期化
      initGoalTree();

      // サーバーサイドでソート済みなのでクライアントサイドソートは不要

      console.log('[updateV2GoalsSection] Updated: total=' + total + ', offset=' + offset + ', displayed=' + goals.length);
    }

    /**
     * GoalアイテムのHTMLを生成（クライアントサイドレンダリング）
     */
    function renderGoalItem(goal) {
      // V2.1: working が正式、active/paused は後方互換
      var statusIcons = {
        working: '🔵', active: '🔵', assigned: '📋', pending: '⏳', paused: '⏸️',
        checkpoint: '🔶', waiting: '⏳', completed: '✅', archived: '📦'
      };
      var statusClasses = {
        working: 'status-active', active: 'status-active', assigned: 'status-assigned', pending: 'status-pending', paused: 'status-paused',
        checkpoint: 'status-checkpoint', waiting: 'status-waiting', completed: 'status-completed', archived: 'status-archived'
      };
      var maidIcons = {
        emma: '☕', sophia: '❄️', lily: '🎀', rose: '🌹',
        alice: '✨', may: '🕊️', flora: '🌿', luna: '🌙'
      };

      // ステータス日本語化マッピング
      var statusTextJp = {
        pending: '未着手',
        assigned: '割当済',
        working: '進行中',
        checkpoint: '確認待ち',
        waiting: '待機中',
        completed: '完了',
        archived: 'アーカイブ'
      };

      // mainStatus=closed または v2Substatus=completed の場合は「完了」を表示
      var effectiveSubstatus = goal.v2Substatus;
      if (goal.mainStatus === 'closed' || goal.v2Substatus === 'completed') {
        effectiveSubstatus = 'completed';
      }

      var statusIcon = goal.displayIcon || statusIcons[effectiveSubstatus] || '❓';
      var statusText = goal.displayStatus || statusTextJp[effectiveSubstatus] || effectiveSubstatus;
      var statusClass = statusClasses[effectiveSubstatus] || '';

      // 担当者HTML
      var assigneesHtml = '';
      if (goal.assignees && goal.assignees.length > 0) {
        var items = goal.assignees.filter(function(a) { return a && a.agentId; }).map(function(a) {
          var icon = maidIcons[a.agentId.toLowerCase()] || '👤';
          return '<span class="assignee-item"><span class="assignee-icon">' + icon + '</span><span class="assignee-name">' + escapeHtmlClient(a.agentId) + '</span></span>';
        }).join(' ');
        if (items) {
          assigneesHtml = '<span class="goal-assignees-inline">' + items + '</span>';
        }
      }
      if (!assigneesHtml) {
        assigneesHtml = '<span class="goal-assignees-inline no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>';
      }

      // 報告書リンク
      var reportLink = '<a href="/report?task=' + encodeURIComponent(goal.id) + '&project=' + encodeURIComponent(window.v2ProjectPath || '') + '" class="report-link" title="統合サマリーを開く">📄</a>';

      // タスク詳細データ（JSON → Base64エンコード）
      var taskInfoJson = JSON.stringify({
        id: goal.id,
        title: goal.title,
        description: goal.description || '',
        status: statusText,
        assignees: (goal.assignees || []).map(function(a) { return a.agentId; }).join(', ') || '担当なし',
        updatedAt: goal.updatedAt || ''
      });
      var taskInfoBase64 = btoa(unescape(encodeURIComponent(taskInfoJson)));

      // Workを再帰的にレンダリング（V2.1: phases → works）
      // Task ソート連動: goalsSortState に基づいて Work もソート
      var worksHtml = '';
      var hasChildren = goal.works && goal.works.length > 0;
      if (hasChildren) {
        var sortedWorks = goal.works.slice().sort(function(a, b) {
          if (goalsSortState === 'id-desc' || goalsSortState === 'id-asc') {
            var cmp = compareGoalIds(a.id || '', b.id || '');
            return goalsSortState === 'id-desc' ? -cmp : cmp;
          } else {
            // updated-desc/asc: 更新日時でソート
            var updA = a.updatedAt || '';
            var updB = b.updatedAt || '';
            if (updA && updB) {
              var timeA = new Date(updA).getTime();
              var timeB = new Date(updB).getTime();
              var cmp = timeA - timeB;
              return goalsSortState === 'updated-desc' ? -cmp : cmp;
            } else if (updA && !updB) {
              return goalsSortState === 'updated-desc' ? -1 : 1;
            } else if (!updA && updB) {
              return goalsSortState === 'updated-desc' ? 1 : -1;
            }
            // フォールバック: ID降順
            return -compareGoalIds(a.id || '', b.id || '');
          }
        });
        worksHtml = '<div class="goal-content"><div class="phase-tree">' +
          sortedWorks.map(function(work) { return renderPhaseItem(work); }).join('\\n') +
          '</div></div>';
      }

      // サブタスク有り: ▼（展開可能）、サブタスク無し: ●（単独タスク）
      var toggleIcon = hasChildren ? '▼' : '●';
      var toggleClass = hasChildren ? 'collapsed' : 'collapsed no-children';

      // 全Work完了判定（手動クローズボタン表示用）
      var allWorksCompleted = hasChildren && goal.works.every(function(w) {
        return w.v2Substatus === 'completed' || w.mainStatus === 'closed';
      });
      var isOpen = goal.mainStatus === 'open';

      // 手動クローズボタン: mainStatus=open かつ 全Work完了の場合のみ表示
      var closeHtml = '';
      if (isOpen && allWorksCompleted) {
        closeHtml = '<button class="close-goal-btn" data-task-id="' + escapeHtmlClient(goal.id) + '" title="Goalを完了にする" onclick="event.stopPropagation()">✅完了</button>';
      }

      // アーカイブ関連: 常にアイコンを表示（列ずれ防止）
      // - アーカイブ済み: クリックで解除（青色）
      // - 完了: クリックでアーカイブ（通常色）
      // - 未完了: グレーアウト（disabled）
      var isArchived = goal.archived === true;
      var isCompleted = goal.v2Substatus === 'completed' || goal.mainStatus === 'closed';
      var archiveHtml;
      if (isArchived) {
        // アーカイブ済み: クリックで解除可能
        archiveHtml = '<button class="archive-btn archived-badge" data-task-id="' + escapeHtmlClient(goal.id) + '" title="アーカイブ済み（クリックで解除）" onclick="event.stopPropagation()">📦</button>';
      } else if (isCompleted) {
        // 完了: クリックでアーカイブ可能
        archiveHtml = '<button class="archive-btn" data-task-id="' + escapeHtmlClient(goal.id) + '" title="アーカイブする" onclick="event.stopPropagation()">📦</button>';
      } else {
        // 未完了: グレーアウト（disabled）
        archiveHtml = '<button class="archive-btn archive-btn-disabled" disabled title="完了後にアーカイブ可能" onclick="event.stopPropagation()">📦</button>';
      }

      return '<div class="goal-item" data-id="' + escapeHtmlClient(goal.id) + '" data-status="' + goal.mainStatus + '" data-substatus="' + goal.v2Substatus + '" data-archived="' + (goal.archived === true || goal.v2Substatus === 'archived') + '" data-updated="' + (goal.updatedAt || '') + '">' +
        '<div class="goal-header">' +
          '<span class="goal-toggle ' + toggleClass + '">' + toggleIcon + '</span>' +
          '<span class="goal-id task-id-clickable" data-task-info="' + taskInfoBase64 + '">#' + escapeHtmlClient(goal.id) + '</span>' +
          '<span class="goal-title">' + escapeHtmlClient(goal.title) + '</span>' +
          '<span class="badge badge-goal">Goal</span>' +
          (goal.size ? '<span class="badge badge-size">' + escapeHtmlClient(goal.size) + '</span>' : '') +
          '<span class="status ' + statusClass + '">' + statusIcon + '<span class="status-text"> ' + escapeHtmlClient(statusText) + '</span></span>' +
          assigneesHtml +
          reportLink +
          closeHtml +
          archiveHtml +
        '</div>' +
        worksHtml +
      '</div>';
    }

    /**
     * WorkアイテムのHTMLを生成（V2.1: Phase → Work）
     */
    function renderPhaseItem(work) {
      // V2.1: working が正式、active/paused は後方互換
      var statusIcons = {
        working: '🔵', active: '🔵', assigned: '📋', pending: '⏳', paused: '⏸️',
        checkpoint: '🔶', waiting: '⏳', completed: '✅', archived: '📦'
      };
      var statusClasses = {
        working: 'status-active', active: 'status-active', assigned: 'status-assigned', pending: 'status-pending', paused: 'status-paused',
        checkpoint: 'status-checkpoint', waiting: 'status-waiting', completed: 'status-completed', archived: 'status-archived'
      };
      var statusTextJp = {
        pending: '未着手', assigned: '割当済', working: '進行中', active: '進行中',
        checkpoint: '確認待ち', waiting: '待機中', completed: '完了', archived: 'アーカイブ'
      };
      var maidIcons = {
        emma: '☕', sophia: '❄️', lily: '🎀', rose: '🌹',
        alice: '✨', may: '🕊️', flora: '🌿', luna: '🌙'
      };

      var statusIcon = statusIcons[work.v2Substatus] || '❓';
      var statusClass = statusClasses[work.v2Substatus] || '';
      var statusText = statusTextJp[work.v2Substatus] || work.v2Substatus;

      // 担当者HTML
      var assigneesHtml = '';
      if (work.assignees && work.assignees.length > 0) {
        var items = work.assignees.filter(function(a) { return a && a.agentId; }).map(function(a) {
          var icon = maidIcons[a.agentId.toLowerCase()] || '👤';
          return '<span class="assignee-item"><span class="assignee-icon">' + icon + '</span><span class="assignee-name">' + escapeHtmlClient(a.agentId) + '</span></span>';
        }).join(' ');
        if (items) {
          assigneesHtml = '<span class="phase-assignees">' + items + '</span>';
        }
      }
      if (!assigneesHtml) {
        assigneesHtml = '<span class="phase-assignees no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>';
      }

      // 報告書リンク
      var reportLink = '<a href="/report?task=' + encodeURIComponent(work.id) + '&project=' + encodeURIComponent(window.v2ProjectPath || '') + '" class="report-link" title="Work報告書を開く">📄</a>';

      // タスク詳細データ（JSON → Base64エンコード）
      var taskInfoJson = JSON.stringify({
        id: work.id,
        title: work.title,
        description: work.description || '',
        status: work.v2Substatus,
        assignees: (work.assignees || []).map(function(a) { return a.agentId; }).join(', ') || '担当なし',
        updatedAt: work.updatedAt || ''
      });
      var taskInfoBase64 = btoa(unescape(encodeURIComponent(taskInfoJson)));

      // Stepをレンダリング（V2.1: actions → steps）
      // Task ソート連動: goalsSortState に基づいて Step もソート
      var stepsHtml = '';
      if (work.steps && work.steps.length > 0) {
        var sortedSteps = work.steps.slice().sort(function(a, b) {
          if (goalsSortState === 'id-desc' || goalsSortState === 'id-asc') {
            var cmp = compareGoalIds(a.id || '', b.id || '');
            return goalsSortState === 'id-desc' ? -cmp : cmp;
          } else {
            // updated-desc/asc: 更新日時でソート
            var updA = a.updatedAt || '';
            var updB = b.updatedAt || '';
            if (updA && updB) {
              var timeA = new Date(updA).getTime();
              var timeB = new Date(updB).getTime();
              var cmp = timeA - timeB;
              return goalsSortState === 'updated-desc' ? -cmp : cmp;
            } else if (updA && !updB) {
              return goalsSortState === 'updated-desc' ? -1 : 1;
            } else if (!updA && updB) {
              return goalsSortState === 'updated-desc' ? 1 : -1;
            }
            // フォールバック: ID降順
            return -compareGoalIds(a.id || '', b.id || '');
          }
        });
        stepsHtml = '<div class="step-list">' +
          sortedSteps.map(function(step, idx, arr) {
            return renderStepItem(step, idx === arr.length - 1);
          }).join('\\n') +
          '</div>';
      }

      return '<div class="phase-item ' + (work.v2Substatus === 'active' ? 'highlight' : '') + '" data-id="' + escapeHtmlClient(work.id) + '">' +
        '<div class="phase-header">' +
          '<span class="phase-id task-id-clickable" data-task-info="' + taskInfoBase64 + '">#' + escapeHtmlClient(work.id) + '</span>' +
          '<span class="phase-name">[' + escapeHtmlClient(work.title) + '] Work</span>' +
          '<span class="status ' + statusClass + '">' + statusIcon + '<span class="status-text"> ' + statusText + '</span></span>' +
          assigneesHtml +
          reportLink +
        '</div>' +
        stepsHtml +
      '</div>';
    }

    /**
     * StepアイテムのHTMLを生成
     */
    function renderStepItem(step, isLast) {
      // V2.1: working が正式、active/paused は後方互換
      var statusIcons = {
        working: '🔵', active: '🔵', assigned: '📋', pending: '⏳', paused: '⏸️',
        checkpoint: '🔶', waiting: '⏳', completed: '✅', archived: '📦'
      };
      var statusTextJp = {
        pending: '未着手', assigned: '割当済', working: '進行中', active: '進行中',
        checkpoint: '確認待ち', waiting: '待機中', completed: '完了', archived: 'アーカイブ'
      };
      var maidIcons = {
        emma: '☕', sophia: '❄️', lily: '🎀', rose: '🌹',
        alice: '✨', may: '🕊️', flora: '🌿', luna: '🌙'
      };

      var statusClass = step.v2Substatus === 'completed' ? 'completed' :
                        step.v2Substatus === 'working' ? 'current' : '';
      var icon = isLast ? '└' : '├';
      var statusBadge = step.v2Substatus === 'working' ? '<span class="current-marker">← 現在ここ</span>' : '';
      var statusIcon = statusIcons[step.v2Substatus] || '⏳';
      var statusText = statusTextJp[step.v2Substatus] || step.v2Substatus;

      // 担当者HTML
      var assigneesHtml = '';
      if (step.assignees && step.assignees.length > 0) {
        var items = step.assignees.filter(function(a) { return a && a.agentId; }).map(function(a) {
          var maidIcon = maidIcons[a.agentId.toLowerCase()] || '👤';
          return '<span class="assignee-item"><span class="assignee-icon">' + maidIcon + '</span><span class="assignee-name">' + escapeHtmlClient(a.agentId) + '</span></span>';
        }).join(' ');
        if (items) {
          assigneesHtml = '<span class="step-assignees">' + items + '</span>';
        }
      }
      if (!assigneesHtml) {
        assigneesHtml = '<span class="step-assignees no-assignee"><span class="assignee-icon">－</span><span class="assignee-name">担当なし</span></span>';
      }

      // タスク詳細データ（JSON → Base64エンコード）
      var taskInfoJson = JSON.stringify({
        id: step.id,
        title: step.title,
        description: step.description || '',
        status: step.v2Substatus,
        assignees: (step.assignees || []).map(function(a) { return a.agentId; }).join(', ') || '担当なし',
        updatedAt: step.updatedAt || ''
      });
      var taskInfoBase64 = btoa(unescape(encodeURIComponent(taskInfoJson)));

      // 報告書リンク
      var reportLink = '<a href="/report?task=' + encodeURIComponent(step.id) + '&project=' + encodeURIComponent(window.v2ProjectPath || '') + '" class="report-link" title="Step報告書を開く">📄</a>';

      return '<div class="step-item ' + statusClass + '">' +
        '<span class="step-icon">' + icon + '</span>' +
        '<span class="step-id task-id-clickable" data-task-info="' + taskInfoBase64 + '">#' + escapeHtmlClient(step.id) + '</span>' +
        '<span class="step-title"> ' + escapeHtmlClient(step.title) + '</span>' +
        '<span class="step-status ' + step.v2Substatus + '">' + statusIcon + '<span class="status-text"> ' + statusText + '</span></span>' +
        assigneesHtml +
        reportLink +
        statusBadge +
      '</div>';
    }

    /**
     * クライアントサイドHTMLエスケープ
     */
    function escapeHtmlClient(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /**
     * タスク詳細ポップアップを表示
     */
    function showTaskDetailPopup(taskInfo) {
      // 既存のオーバーレイを削除
      var existing = document.querySelector('.task-detail-overlay');
      if (existing) {
        existing.remove();
      }

      // 更新日時のフォーマット
      var updatedAtText = taskInfo.updatedAt ? new Date(taskInfo.updatedAt).toLocaleString('ja-JP') : '不明';

      // オーバーレイとポップアップを作成
      var overlay = document.createElement('div');
      overlay.className = 'task-detail-overlay';
      overlay.innerHTML =
        '<div class="task-detail-popup">' +
          '<div class="task-detail-header">' +
            '<span class="task-detail-title">#' + escapeHtmlClient(taskInfo.id) + ' ' + escapeHtmlClient(taskInfo.title) + '</span>' +
            '<button class="task-detail-close" title="閉じる">✕</button>' +
          '</div>' +
          '<div class="task-detail-body">' +
            '<div class="task-detail-row">' +
              '<div class="task-detail-label">説明</div>' +
              '<div class="task-detail-value task-detail-description">' + (escapeHtmlClient(taskInfo.description) || '(なし)') + '</div>' +
            '</div>' +
            '<div class="task-detail-row">' +
              '<div class="task-detail-label">ステータス</div>' +
              '<div class="task-detail-value">' + escapeHtmlClient(taskInfo.status) + '</div>' +
            '</div>' +
            '<div class="task-detail-row">' +
              '<div class="task-detail-label">担当者</div>' +
              '<div class="task-detail-value">' + escapeHtmlClient(taskInfo.assignees) + '</div>' +
            '</div>' +
            '<div class="task-detail-row">' +
              '<div class="task-detail-label">更新日時</div>' +
              '<div class="task-detail-value">' + updatedAtText + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      // 閉じるボタンのイベント
      overlay.querySelector('.task-detail-close').addEventListener('click', function() {
        overlay.remove();
      });

      // オーバーレイ（ポップアップ外）クリックで閉じる
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.remove();
        }
      });

      document.body.appendChild(overlay);
    }

    /**
     * タスクID クリックイベントの初期化（イベント委任）
     * document.bodyに設定することで、全セクション（進行中/完了済み/スキル候補等）に対応
     */
    function initTaskIdClickHandler() {
      // 既に設定済みならスキップ
      if (document.body.dataset.taskIdClickDelegation === 'true') {
        console.log('[initTaskIdClickHandler] Already set up');
        return;
      }
      document.body.dataset.taskIdClickDelegation = 'true';
      console.log('[initTaskIdClickHandler] Setting up click handler on document.body');

      // キャプチャフェーズ(true)でイベントを処理
      // 理由: アコーディオンのクリックハンドラより先に処理して伝播を停止するため
      document.body.addEventListener('click', function(e) {
        var clickable = e.target.closest('.task-id-clickable');
        if (!clickable) return;

        console.log('[initTaskIdClickHandler] Task ID clicked:', clickable.textContent);

        // イベント伝播を停止（アコーディオンとの干渉防止）
        e.stopPropagation();
        e.preventDefault();

        // data-task-info からBase64エンコードされたJSON取得
        var taskInfoBase64 = clickable.getAttribute('data-task-info');
        if (!taskInfoBase64) {
          console.error('[initTaskIdClickHandler] No data-task-info attribute');
          return;
        }

        try {
          // Base64デコード → JSON.parse
          var taskInfoJson = decodeURIComponent(escape(atob(taskInfoBase64)));
          var taskInfo = JSON.parse(taskInfoJson);
          console.log('[initTaskIdClickHandler] Parsed task info:', taskInfo.id);
          showTaskDetailPopup(taskInfo);
        } catch (err) {
          console.error('[initTaskIdClickHandler] Failed to parse task info:', err);
        }
      }, true);  // キャプチャフェーズで処理
    }

    /**
     * アーカイブボタンの初期化（イベントデリゲーション）
     */
    function initArchiveButtons() {
      console.log('[V2.1] initArchiveButtons called');

      // 既に設定済みならスキップ
      if (document.body.dataset.archiveBtnDelegation === 'true') {
        console.log('[V2.1] Archive button delegation already set up');
        return;
      }
      document.body.dataset.archiveBtnDelegation = 'true';

      // キャプチャフェーズ(true)でイベントを処理
      // 理由: アーカイブボタンに onclick="event.stopPropagation()" が設定されており、
      // バブリングフェーズではイベントがここに到達しないため
      document.body.addEventListener('click', function(e) {
        var archiveBtn = e.target.closest('.archive-btn');
        if (!archiveBtn) return;

        // disabled状態のボタンは無視
        if (archiveBtn.disabled || archiveBtn.classList.contains('archive-btn-disabled')) {
          return;
        }

        e.stopPropagation();
        e.preventDefault();

        var taskId = archiveBtn.getAttribute('data-task-id');
        if (!taskId) {
          console.error('[initArchiveButtons] No data-task-id attribute');
          return;
        }

        // 現在のアーカイブ状態を取得（トグル動作）
        var goalItem = archiveBtn.closest('.goal-item');
        var isCurrentlyArchived = goalItem && goalItem.getAttribute('data-archived') === 'true';

        console.log('[initArchiveButtons] Archive button clicked for task:', taskId, 'currently archived:', isCurrentlyArchived);

        // 確認なしで即座にAPIを呼び出し（トグル）
        toggleArchive(taskId, archiveBtn, !isCurrentlyArchived);
      }, true);

      console.log('[V2.1] Archive button delegation set up on document.body');
    }

    /**
     * アーカイブ状態をトグルする（API呼び出し）
     */
    function toggleArchive(taskId, btn, newArchivedState) {
      console.log('[toggleArchive] taskId:', taskId, 'newState:', newArchivedState);

      // ボタンを無効化
      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = '⏳';

      var projectPath = window.v2ProjectPath || '';

      // LAN公開用エンドポイントを使用
      fetch('/dashboard/tasks/' + encodeURIComponent(taskId) + '/archive?project=' + encodeURIComponent(projectPath), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ archived: newArchivedState })
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('API error: ' + response.status);
        }
        return response.json();
      })
      .then(function(data) {
        console.log('[toggleArchive] Success:', data);

        var goalItem = btn.closest('.goal-item');

        if (newArchivedState) {
          // アーカイブ: ボタンをバッジに変更
          btn.classList.add('archived-badge');
          btn.classList.remove('archive-btn');
          btn.title = 'アーカイブ済み（クリックで解除）';
          btn.disabled = false;
          btn.textContent = '📦';
          if (goalItem) {
            goalItem.setAttribute('data-archived', 'true');
          }

          // アーカイブ非表示設定の場合はアイテムを非表示に
          var archivedCheckbox = document.getElementById('v2-goals-show-archived');
          if (archivedCheckbox && !archivedCheckbox.checked && goalItem) {
            goalItem.style.display = 'none';
          }
        } else {
          // アーカイブ解除: バッジをボタンに変更
          btn.classList.remove('archived-badge');
          btn.classList.add('archive-btn');
          btn.title = 'アーカイブする';
          btn.disabled = false;
          btn.textContent = '📦';
          if (goalItem) {
            goalItem.setAttribute('data-archived', 'false');
          }
        }
      })
      .catch(function(err) {
        console.error('[toggleArchive] Error:', err);

        // ボタンを元に戻す
        btn.disabled = false;
        btn.textContent = originalText;
      });
    }

    /**
     * Goalクローズボタンの初期化（イベントデリゲーション）
     */
    function initCloseGoalButtons() {
      console.log('[V2.1] initCloseGoalButtons called');

      // 既に設定済みならスキップ
      if (document.body.dataset.closeGoalBtnDelegation === 'true') {
        console.log('[V2.1] Close goal button delegation already set up');
        return;
      }
      document.body.dataset.closeGoalBtnDelegation = 'true';

      document.body.addEventListener('click', function(e) {
        var closeBtn = e.target.closest('.close-goal-btn');
        if (!closeBtn) return;

        e.stopPropagation();
        e.preventDefault();

        var taskId = closeBtn.getAttribute('data-task-id');
        if (!taskId) {
          console.error('[initCloseGoalButtons] No data-task-id attribute');
          return;
        }

        console.log('[initCloseGoalButtons] Close button clicked for goal:', taskId);
        closeGoal(taskId, closeBtn);
      }, true);

      console.log('[V2.1] Close goal button delegation set up on document.body');
    }

    /**
     * Goalを完了にする（API呼び出し）
     */
    function closeGoal(taskId, btn) {
      console.log('[closeGoal] taskId:', taskId);

      // ボタンを無効化
      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = '⏳';

      var projectPath = window.v2ProjectPath || '';

      // タスク更新APIを呼び出し（/dashboard/tasks/:id/close）
      fetch('/dashboard/tasks/' + encodeURIComponent(taskId) + '/close?project=' + encodeURIComponent(projectPath), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('API error: ' + response.status);
        }
        return response.json();
      })
      .then(function(data) {
        console.log('[closeGoal] Success:', data);

        // セクションを更新（進行中から完了済みへ移動するため両方更新）
        refreshGoalsOpen();
        refreshGoalsClosed();
      })
      .catch(function(err) {
        console.error('[closeGoal] Error:', err);

        // ボタンを元に戻す
        btn.disabled = false;
        btn.textContent = originalText;
      });
    }

    /**
     * スキル候補・改善提案セクションのタスク全体クリックでモーダル表示
     * アコーディオン動作を廃止し、モーダル表示に統一
     */
    function initSpecialSectionModalClick() {
      console.log('[V2.1] initSpecialSectionModalClick called');

      // 既に設定済みならスキップ
      if (document.body.dataset.specialSectionModalDelegation === 'true') {
        console.log('[V2.1] Special section modal delegation already set up');
        return;
      }
      document.body.dataset.specialSectionModalDelegation = 'true';

      // キャプチャフェーズでイベントを処理（アコーディオンより先に処理）
      document.body.addEventListener('click', function(e) {
        // スキル候補・改善提案セクション内の.task-itemをチェック
        var taskItem = e.target.closest('.skill-item, .improvement-item, .review-item');
        if (!taskItem) return;

        // task-id-clickable のクリックは既存ハンドラで処理されるのでスキップ
        if (e.target.closest('.task-id-clickable')) return;

        // リンクやボタンのクリックは除外
        if (e.target.closest('a') || e.target.closest('button')) return;

        console.log('[initSpecialSectionModalClick] Task item clicked:', taskItem.dataset.id);

        // イベント伝播を停止（アコーディオン動作を抑制）
        e.stopPropagation();
        e.preventDefault();

        // タスク内の task-id-clickable から data-task-info を取得
        var clickable = taskItem.querySelector('.task-id-clickable');
        if (!clickable) {
          console.error('[initSpecialSectionModalClick] No task-id-clickable found');
          return;
        }

        var taskInfoBase64 = clickable.getAttribute('data-task-info');
        if (!taskInfoBase64) {
          console.error('[initSpecialSectionModalClick] No data-task-info attribute');
          return;
        }

        try {
          var taskInfoJson = decodeURIComponent(escape(atob(taskInfoBase64)));
          var taskInfo = JSON.parse(taskInfoJson);
          console.log('[initSpecialSectionModalClick] Showing modal for task:', taskInfo.id);
          showTaskDetailPopup(taskInfo);
        } catch (err) {
          console.error('[initSpecialSectionModalClick] Failed to parse task info:', err);
        }
      }, true);  // キャプチャフェーズで処理

      console.log('[V2.1] Special section modal delegation set up on document.body');
    }

    /**
     * V2 Goalsページネーションを更新
     */
    function updateV2GoalsPagination(total, offset, limit) {
      var paginationEl = document.getElementById('v2-goals-pagination');
      if (!paginationEl) return;

      var totalPages = Math.ceil(total / limit);
      var currentPage = Math.floor(offset / limit);

      if (totalPages <= 1) {
        paginationEl.innerHTML = '<span class="pagination-info">' + total + '件</span>';
      } else {
        paginationEl.innerHTML =
          '<button class="pagination-btn v2-goals-page-btn" data-page="' + (currentPage - 1) + '" ' + (currentPage === 0 ? 'disabled' : '') + '>◀</button>' +
          '<span class="pagination-info">' + (currentPage + 1) + '/' + totalPages + '</span>' +
          '<button class="pagination-btn v2-goals-page-btn" data-page="' + (currentPage + 1) + '" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>';
      }
    }

    /**
     * V2 Goalsのページを変更
     */
    function goV2GoalsPage(page) {
      if (page < 0) return;
      var totalPages = Math.ceil(v2GoalsTotal / v2GoalsLimit);
      if (page >= totalPages) return;
      v2GoalsCurrentPage = page;
      refreshGoals();
    }

    // 注: initGoalsFilter と ソートボタンのリスナーは initV2Dashboard() で設定済み
  </script>`;
}
