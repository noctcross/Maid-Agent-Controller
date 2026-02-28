/**
 * Dashboard JavaScript コード生成 - 共通モジュール
 *
 * V1/V2共通のユーティリティ関数、状態管理、ページネーション関連のコード
 *
 * @module dashboard-scripts-common
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
    } catch (e) {
      // ブラウザ環境ではacquireVsCodeApiは存在しないため、エラーは無視
    }

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
