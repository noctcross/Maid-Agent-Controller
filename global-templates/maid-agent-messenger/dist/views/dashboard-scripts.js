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
    function refreshDashboard() {
      if (_vscodeApi) {
        // IDE Webview: extension側にデータ再取得を依頼（fetchがブロックされるため）
        _vscodeApi.postMessage({ command: 'refreshDashboard' });
      } else {
        // ブラウザ: 直接API呼び出し
        fetchTasks();
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
          updateTaskListsWithMeta(event.data, null);
          // V2.1セクションの更新（v2Htmlが含まれている場合）
          if (event.v2Html) {
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
    const serverBaseUrl = (typeof acquireVsCodeApi !== 'undefined')
      ? '${serverUrl}'.replace('0.0.0.0', '127.0.0.1')
      : window.location.origin;

    function updateTaskListsWithMeta(tasks, completedMeta) {
      if (!tasks) return;

      // 現在の展開状態を保存
      saveExpandedStates();

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
      if (v2Html.goals) {
        const goalsContainer = document.getElementById('v2-goals-list');
        if (goalsContainer) {
          goalsContainer.innerHTML = v2Html.goals;
          // Goal展開状態の復元とリスナー設定
          initGoalTree();
        }
        // カウントバッジ更新
        const goalsBadge = document.querySelector('.v2-goals-section .count-badge');
        if (goalsBadge && v2Data && v2Data.v2Goals) {
          goalsBadge.textContent = v2Data.v2Goals.length;
        }
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

      var actionList = phaseItem.querySelector('.action-list');
      if (!actionList) return;

      // 折りたたみ状態を切り替え
      if (phaseItem.classList.contains('collapsed')) {
        // 展開する
        phaseItem.classList.remove('collapsed');
        actionList.style.display = '';
      } else {
        // 折りたたむ
        phaseItem.classList.add('collapsed');
        actionList.style.display = 'none';
      }
    }

    // V2.1初期化関数（DOMContentLoaded対応）
    function initV2Dashboard() {
      console.log('[V2.1] initV2Dashboard called');
      initGoalTree();
      setupGoalTreeEventDelegation();
      initGoalsFilter();
      // ソートボタンのイベントリスナー
      var sortIdBtn = document.getElementById('v2-goals-sort-id');
      var sortUpdBtn = document.getElementById('v2-goals-sort-updated');
      if (sortIdBtn) {
        sortIdBtn.addEventListener('click', function() { sortGoals('id'); });
      }
      if (sortUpdBtn) {
        sortUpdBtn.addEventListener('click', function() { sortGoals('updated'); });
      }
      // 初期フィルタを適用（Open表示）
      setTimeout(function() {
        refreshGoals();
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
        var actionList = phaseItem.querySelector('.action-list');
        if (actionList) {
          actionList.style.display = 'none';
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
     * ステータスフィルタとarchivedチェックボックスの監視
     */
    function initGoalsFilter() {
      console.log('[V2.1] initGoalsFilter called');
      var statusFilter = document.getElementById('v2-goals-status-filter');
      var archivedCheckbox = document.getElementById('v2-goals-show-archived');

      console.log('[V2.1] statusFilter:', statusFilter ? 'found' : 'not found');
      console.log('[V2.1] archivedCheckbox:', archivedCheckbox ? 'found' : 'not found');

      if (statusFilter) {
        statusFilter.addEventListener('change', function() {
          console.log('[V2.1] Status filter changed to:', statusFilter.value);
          refreshGoals();
        });
      }

      if (archivedCheckbox) {
        archivedCheckbox.addEventListener('change', function() {
          console.log('[V2.1] Archived checkbox changed to:', archivedCheckbox.checked);
          refreshGoals();
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
      var goalsList = document.getElementById('v2-goals-list');
      if (!goalsList) return;

      var goalItems = Array.from(goalsList.querySelectorAll('.goal-item'));
      if (goalItems.length === 0) return;

      // ソート状態を更新
      if (sortBy === 'id') {
        goalsSortState = goalsSortState === 'id-desc' ? 'id-asc' : 'id-desc';
      } else {
        goalsSortState = 'updated-desc';
      }

      // ソート実行
      goalItems.sort(function(a, b) {
        if (goalsSortState === 'id-desc' || goalsSortState === 'id-asc') {
          var idA = a.getAttribute('data-id') || '';
          var idB = b.getAttribute('data-id') || '';
          var cmp = compareGoalIds(idA, idB);
          return goalsSortState === 'id-desc' ? -cmp : cmp;
        } else {
          // updated-desc: data-updated属性でソート
          var updA = a.getAttribute('data-updated') || '';
          var updB = b.getAttribute('data-updated') || '';
          // 両方あれば日時で比較、片方だけあれば値がある方を優先、両方なければID降順
          if (updA && updB) {
            return updB.localeCompare(updA);
          } else if (updA && !updB) {
            return -1; // Aを上に
          } else if (!updA && updB) {
            return 1;  // Bを上に
          }
          return -compareGoalIds(a.getAttribute('data-id') || '', b.getAttribute('data-id') || '');
        }
      });

      // DOM再配置
      goalItems.forEach(function(item) {
        goalsList.appendChild(item);
      });

      // ソートボタンの状態更新
      updateGoalsSortButtons();
      console.log('[sortGoals] Sorted by:', goalsSortState);
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
        updBtn.classList.toggle('active', goalsSortState === 'updated-desc');
      }
    }

    /**
     * フィルタ条件に基づいてGoals一覧をフィルタリング
     * クライアントサイドでDOM要素を直接操作
     */
    function refreshGoals() {
      var statusFilter = document.getElementById('v2-goals-status-filter');
      var archivedCheckbox = document.getElementById('v2-goals-show-archived');
      var goalsList = document.getElementById('v2-goals-list');

      if (!goalsList) return;

      var status = statusFilter ? statusFilter.value : 'open';
      var showArchived = archivedCheckbox ? archivedCheckbox.checked : false;

      // クライアントサイドフィルタリング
      var goalItems = goalsList.querySelectorAll('.goal-item');
      var visibleCount = 0;

      goalItems.forEach(function(item) {
        var itemStatus = item.getAttribute('data-status'); // open/closed
        var isArchived = item.getAttribute('data-archived') === 'true';

        // ステータスフィルタ: open/closed/all
        var showByStatus = (status === 'all') || (itemStatus === status);
        // アーカイブフィルタ: チェックONならarchived含む、OFFなら除外
        var showByArchived = showArchived || !isArchived;

        if (showByStatus && showByArchived) {
          item.style.display = '';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });

      // カウントバッジを更新
      var countBadge = goalsList.closest('.card')?.querySelector('.count-badge');
      if (countBadge) {
        countBadge.textContent = String(visibleCount);
      }

      console.log('[refreshGoals] Filter applied: status=' + status + ', showArchived=' + showArchived + ', visible=' + visibleCount);
    }

    // 注: initGoalsFilter と ソートボタンのリスナーは initV2Dashboard() で設定済み
  </script>`;
}
