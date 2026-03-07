/**
 * Dashboard JavaScript コード生成
 *
 * ダッシュボード用のスクリプト
 * Goal展開/折りたたみ、ページネーション、フィルター機能
 *
 * @module dashboard-scripts
 */
// 共通モジュールからの再エクスポート
export { getDashboardHeadScript, getReportOverlayScript, } from "./dashboard-scripts-common.js";
/**
 * V2.1 Dashboard用スクリプトを生成
 * Goal展開/折りたたみ機能を提供
 *
 * @returns `<script>` タグを含むHTMLスクリプト文字列
 */
export function getDashboardScript() {
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

    // 検索・絞り込みフィルター状態
    var v2FilterState = {
      search: '',
      priority: '',
      assignee: ''
    };
    var v2SearchDebounceTimer = null;

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
      initSearchFilter();  // 検索・絞り込みセクション初期化
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

    /**
     * 検索・絞り込みセクションの初期化
     */
    function initSearchFilter() {
      console.log('[V2.1] initSearchFilter called');

      var searchBox = document.getElementById('v2-search-box');
      var priorityFilter = document.getElementById('v2-priority-filter');
      var assigneeFilter = document.getElementById('v2-assignee-filter');
      var clearBtn = document.getElementById('v2-filter-clear-btn');

      // 検索実行関数
      function executeSearch() {
        v2GoalsOpenCurrentPage = 0;
        v2GoalsClosedCurrentPage = 0;
        refreshGoalsOpen();
        refreshGoalsClosed();
        updateFilterActiveState();
      }

      // フィルターアクティブ状態を更新
      function updateFilterActiveState() {
        if (searchBox) {
          searchBox.classList.toggle('has-value', !!v2FilterState.search);
        }
        if (priorityFilter) {
          priorityFilter.classList.toggle('active', !!v2FilterState.priority);
        }
        if (assigneeFilter) {
          assigneeFilter.classList.toggle('active', !!v2FilterState.assignee);
        }
      }

      // 検索ボックスの入力イベント（デバウンス付き）
      if (searchBox) {
        searchBox.addEventListener('input', function() {
          v2FilterState.search = searchBox.value.trim();
          // デバウンス: 300ms
          if (v2SearchDebounceTimer) {
            clearTimeout(v2SearchDebounceTimer);
          }
          v2SearchDebounceTimer = setTimeout(function() {
            console.log('[V2.1] Search debounced:', v2FilterState.search);
            executeSearch();
          }, 300);
        });

        // Enterキーで即座に検索
        searchBox.addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            if (v2SearchDebounceTimer) {
              clearTimeout(v2SearchDebounceTimer);
            }
            v2FilterState.search = searchBox.value.trim();
            console.log('[V2.1] Search on Enter:', v2FilterState.search);
            executeSearch();
          }
        });
      }

      // 優先度フィルター
      if (priorityFilter) {
        priorityFilter.addEventListener('change', function() {
          v2FilterState.priority = priorityFilter.value;
          console.log('[V2.1] Priority filter changed:', v2FilterState.priority);
          executeSearch();
        });
      }

      // 担当者フィルター
      if (assigneeFilter) {
        assigneeFilter.addEventListener('change', function() {
          v2FilterState.assignee = assigneeFilter.value;
          console.log('[V2.1] Assignee filter changed:', v2FilterState.assignee);
          executeSearch();
        });
      }

      // クリアボタン
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          console.log('[V2.1] Clear filters');
          v2FilterState.search = '';
          v2FilterState.priority = '';
          v2FilterState.assignee = '';
          if (searchBox) searchBox.value = '';
          if (priorityFilter) priorityFilter.value = '';
          if (assigneeFilter) assigneeFilter.value = '';
          executeSearch();
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

      // 検索・絞り込みパラメータを追加
      if (v2FilterState.search) {
        url += '&search=' + encodeURIComponent(v2FilterState.search);
      }
      if (v2FilterState.priority) {
        url += '&priority=' + encodeURIComponent(v2FilterState.priority);
      }
      if (v2FilterState.assignee) {
        url += '&assignee=' + encodeURIComponent(v2FilterState.assignee);
      }

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

      // 検索・絞り込みパラメータを追加
      if (v2FilterState.search) {
        url += '&search=' + encodeURIComponent(v2FilterState.search);
      }
      if (v2FilterState.priority) {
        url += '&priority=' + encodeURIComponent(v2FilterState.priority);
      }
      if (v2FilterState.assignee) {
        url += '&assignee=' + encodeURIComponent(v2FilterState.assignee);
      }

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

      // 報告書リンク（未登録時はクリック不可＋薄い表示）
      var reportLinkClass = goal.hasReport ? 'report-link' : 'report-link report-link-empty';
      var reportLink = '<a href="/report?task=' + encodeURIComponent(goal.id) + '&project=' + encodeURIComponent(window.v2ProjectPath || '') + '" class="' + reportLinkClass + '" title="統合サマリーを開く">📄</a>';

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

      // 報告書リンク（未登録時はクリック不可＋薄い表示）
      var reportLinkClass = work.hasReport ? 'report-link' : 'report-link report-link-empty';
      var reportLink = '<a href="/report?task=' + encodeURIComponent(work.id) + '&project=' + encodeURIComponent(window.v2ProjectPath || '') + '" class="' + reportLinkClass + '" title="Work報告書を開く">📄</a>';

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

      // 報告書リンク（未登録時はクリック不可＋薄い表示）
      var reportLinkClass = step.hasReport ? 'report-link' : 'report-link report-link-empty';
      var reportLink = '<a href="/report?task=' + encodeURIComponent(step.id) + '&project=' + encodeURIComponent(window.v2ProjectPath || '') + '" class="' + reportLinkClass + '" title="Step報告書を開く">📄</a>';

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

      // トランザクションID生成（自己操作の識別用）
      var txId = generateUUID();
      addPendingTransaction(txId);

      // ボタンを無効化
      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = '⏳';

      var projectPath = window.v2ProjectPath || '';

      // IDE版対応: 相対URLではなく絶対URLを使用（#013-1）
      fetch(serverBaseUrl + '/dashboard/tasks/' + encodeURIComponent(taskId) + '/archive?project=' + encodeURIComponent(projectPath), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Transaction-Id': txId
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

      // IDE版対応: 相対URLではなく絶対URLを使用（#013-1）
      fetch(serverBaseUrl + '/dashboard/tasks/' + encodeURIComponent(taskId) + '/close?project=' + encodeURIComponent(projectPath), {
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
