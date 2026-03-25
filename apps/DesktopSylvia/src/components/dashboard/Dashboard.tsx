/**
 * Dashboard - 左ペイン
 * タスク/予定/通知/Todo を表示
 */

import './Dashboard.css';

// モックデータ
const MOCK_TASKS = [
  { id: '1', title: 'UIモックアップ作成', status: 'working', assignee: 'flora' },
  { id: '2', title: 'API設計', status: 'pending', assignee: 'sophia' },
  { id: '3', title: 'テスト実装', status: 'completed', assignee: 'emma' },
];

const MOCK_SCHEDULES = [
  { id: '1', title: '定例MTG', time: '14:00', type: 'meeting' },
  { id: '2', title: 'レビュー', time: '16:00', type: 'review' },
];

const MOCK_NOTIFICATIONS = [
  { id: '1', message: 'タスク #056-15 が完了しました', time: '10:15', read: false },
  { id: '2', message: 'ビルドが成功しました', time: '09:30', read: true },
];

const MOCK_TODOS = [
  { id: '1', text: 'ドキュメント更新', done: false },
  { id: '2', text: 'コードレビュー', done: true },
  { id: '3', text: 'バグ修正', done: false },
];

const STATUS_EMOJI: Record<string, string> = {
  working: '🔵',
  pending: '⏸️',
  completed: '✅',
  blocked: '🔴',
};

export function Dashboard() {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">ダッシュボード</h1>
        <span className="dashboard-date">{new Date().toLocaleDateString('ja-JP')}</span>
      </header>

      <div className="dashboard-content">
        {/* タスク一覧 */}
        <section className="dashboard-section">
          <h2 className="section-title">
            <span className="section-icon">📋</span>
            今日のタスク
          </h2>
          <ul className="task-list">
            {MOCK_TASKS.map((task) => (
              <li key={task.id} className="task-item">
                <span className="task-status">{STATUS_EMOJI[task.status]}</span>
                <span className="task-title">{task.title}</span>
                <span className="task-assignee">@{task.assignee}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 予定 */}
        <section className="dashboard-section">
          <h2 className="section-title">
            <span className="section-icon">📅</span>
            予定
          </h2>
          <ul className="schedule-list">
            {MOCK_SCHEDULES.map((schedule) => (
              <li key={schedule.id} className="schedule-item">
                <span className="schedule-time">{schedule.time}</span>
                <span className="schedule-title">{schedule.title}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 通知 */}
        <section className="dashboard-section">
          <h2 className="section-title">
            <span className="section-icon">🔔</span>
            通知
            <span className="notification-badge">1</span>
          </h2>
          <ul className="notification-list">
            {MOCK_NOTIFICATIONS.map((notif) => (
              <li key={notif.id} className={`notification-item ${notif.read ? 'read' : 'unread'}`}>
                <span className="notification-message">{notif.message}</span>
                <span className="notification-time">{notif.time}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Todo */}
        <section className="dashboard-section">
          <h2 className="section-title">
            <span className="section-icon">✓</span>
            Todo
          </h2>
          <ul className="todo-list">
            {MOCK_TODOS.map((todo) => (
              <li key={todo.id} className={`todo-item ${todo.done ? 'done' : ''}`}>
                <input type="checkbox" checked={todo.done} readOnly />
                <span className="todo-text">{todo.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
