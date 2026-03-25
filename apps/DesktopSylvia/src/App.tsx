/**
 * DesktopSylvia - メインアプリケーション
 * 2ペイン構成：左（ダッシュボード） + 右（チャット）
 */

import { useState } from 'react';
import { Sidebar } from './components/sidebar';
import { Dashboard } from './components/dashboard';
import { Chat } from './components/chat';
import './App.css';

type ViewType = 'dashboard' | 'settings';

function App() {
  const [activeView, setActiveView] = useState<ViewType>('dashboard');

  return (
    <div className="app">
      {/* サイドバー（アイコンナビ） */}
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      {/* メインコンテンツ */}
      <main className="main-content">
        {activeView === 'dashboard' && (
          <>
            {/* 左ペイン: ダッシュボード */}
            <Dashboard />

            {/* 右ペイン: チャット */}
            <Chat />
          </>
        )}

        {activeView === 'settings' && (
          <div className="settings-placeholder">
            <h2>設定</h2>
            <p>設定画面は今後実装予定です</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
