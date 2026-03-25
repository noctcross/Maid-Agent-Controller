/**
 * Sidebar - アイコンナビゲーション
 * アプリの主要機能へのアクセスを提供
 */

import './Sidebar.css';

interface SidebarProps {
  activeView: 'dashboard' | 'settings';
  onViewChange: (view: 'dashboard' | 'settings') => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        {/* ロゴ/ホーム */}
        <button
          className={`sidebar-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onViewChange('dashboard')}
          title="ダッシュボード"
        >
          <span className="sidebar-icon">🏠</span>
        </button>
      </div>

      <div className="sidebar-bottom">
        {/* 設定 */}
        <button
          className={`sidebar-btn ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
          title="設定"
        >
          <span className="sidebar-icon">⚙️</span>
        </button>
      </div>
    </aside>
  );
}
