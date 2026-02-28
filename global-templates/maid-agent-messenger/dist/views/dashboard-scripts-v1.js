/**
 * Dashboard JavaScript コード生成 - V1モジュール
 *
 * V1ダッシュボード用のメインスクリプト
 * イベントハンドラ、WebSocket接続、タスク更新関連のコード
 *
 * @deprecated V1は将来廃止予定。新機能はV2に追加すること。
 * @module dashboard-scripts-v1
 */
import { escapeHtml } from "../markdown-utils.js";
import { TIMEOUTS } from "../utils/constants.js";
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
      // V2モードでは検索ボックスが存在しない場合がある
      const searchTerm = searchBox?.value?.toLowerCase() || '';
      const priority = priorityFilter?.value || '';
      const assignee = assigneeFilter?.value || '';

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
          // チーム状態セクションの更新
          if (data.teamStatusHtml) updateTeamStatus(data.teamStatusHtml);
        })
        .catch(function(err) {
          console.error('[fetchTasks] Error:', err);
        });
    }

    // ダッシュボードデータを再取得（IDE/ブラウザ判定）
    // タブ復帰時の連続リクエストを防ぐためのタイムスタンプ
    var lastRefreshTime = 0;
    var REFRESH_THROTTLE_MS = ${TIMEOUTS.REFRESH_THROTTLE}; // 連続リクエストを防止

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
        // スキル候補セクションもV2用のセレクタで更新 (#411)
        if (tasks.skillCandidates) {
          updateTaskSection('[data-section="v2-skill-candidates"]', tasks.skillCandidates);
          // カウントバッジも更新
          var v2SkillCandidatesBadge = document.querySelector('.v2-skill-candidates-section .count-badge');
          if (v2SkillCandidatesBadge) {
            var tempDiv2 = document.createElement('div');
            tempDiv2.innerHTML = tasks.skillCandidates;
            var count2 = tempDiv2.querySelectorAll('.task-item').length;
            v2SkillCandidatesBadge.textContent = String(count2);
          }
        }
        // 改善提案セクションもV2用のセレクタで更新 (#411)
        if (tasks.improvements) {
          updateTaskSection('[data-section="v2-improvements"]', tasks.improvements);
          // カウントバッジも更新
          var v2ImprovementsBadge = document.querySelector('.v2-improvements-section .count-badge');
          if (v2ImprovementsBadge) {
            var tempDiv3 = document.createElement('div');
            tempDiv3.innerHTML = tasks.improvements;
            var count3 = tempDiv3.querySelectorAll('.task-item').length;
            v2ImprovementsBadge.textContent = String(count3);
          }
        }
        console.log('[updateTaskListsWithMeta] V2 mode: updated v2-master-waiting, v2-skill-candidates, v2-improvements sections');
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

    // チーム状態セクションを更新
    function updateTeamStatus(teamStatusHtml) {
      if (!teamStatusHtml) return;

      const teamSection = document.querySelector('.v2-team-status-section .collapsible-content');
      if (teamSection) {
        teamSection.innerHTML = teamStatusHtml;
        // フェードインアニメーション
        const cards = teamSection.querySelectorAll('.v2-team-card');
        cards.forEach(card => {
          card.classList.add('fade-in');
          setTimeout(() => card.classList.remove('fade-in'), 300);
        });
      }

      // バッジの更新（チーム人数）
      const countBadge = document.querySelector('.v2-team-status-section .count-badge');
      if (countBadge) {
        const cardCount = document.querySelectorAll('.v2-team-status-section .v2-team-card').length;
        countBadge.textContent = cardCount;
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
