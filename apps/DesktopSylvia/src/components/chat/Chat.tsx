/**
 * Chat - 右ペイン
 * AIとのチャットインターフェース
 */

import { useState } from 'react';
import './Chat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  agent?: string;
}

// モックメッセージ
const MOCK_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'user',
    content: 'UIモックアップを作成して',
    timestamp: new Date('2026-03-10T10:00:00'),
  },
  {
    id: '2',
    role: 'assistant',
    content: 'はい、承知いたしましたよ。DesktopSylvia のUIモックアップを作成いたしますね。\n\n2ペイン構成で、左にダッシュボード、右にチャットエリアを配置する形で進めますね。',
    timestamp: new Date('2026-03-10T10:00:05'),
    agent: 'flora',
  },
  {
    id: '3',
    role: 'user',
    content: 'タスク一覧と通知も表示してね',
    timestamp: new Date('2026-03-10T10:01:00'),
  },
  {
    id: '4',
    role: 'assistant',
    content: 'もちろんですよ。ダッシュボードエリアに以下を含めますね：\n\n• 今日のタスク一覧\n• 予定（カレンダー連携用）\n• 通知\n• Todo\n\n作業を進めていきますね。',
    timestamp: new Date('2026-03-10T10:01:10'),
    agent: 'flora',
  },
];

const AGENT_INFO: Record<string, { name: string; emoji: string; color: string }> = {
  flora: { name: 'フローラ', emoji: '🌿', color: '#228B22' },
  emma: { name: 'エマ', emoji: '☕', color: '#8B5A2B' },
  sophia: { name: 'ソフィア', emoji: '❄️', color: '#4169E1' },
};

export function Chat() {
  const [messages] = useState<Message[]>(MOCK_MESSAGES);
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    // TODO: 実際のメッセージ送信処理
    setInput('');
  };

  return (
    <div className="chat">
      <header className="chat-header">
        <h2 className="chat-title">チャット</h2>
        <div className="chat-status">
          <span className="status-dot online"></span>
          <span className="status-text">接続中</span>
        </div>
      </header>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.role === 'assistant' && msg.agent && (
              <div className="message-agent">
                <span
                  className="agent-badge"
                  style={{ backgroundColor: AGENT_INFO[msg.agent]?.color }}
                >
                  {AGENT_INFO[msg.agent]?.emoji} {AGENT_INFO[msg.agent]?.name}
                </span>
              </div>
            )}
            <div className="message-content">
              {msg.content.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div className="message-time">
              {msg.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="メッセージを入力..."
          className="input-field"
        />
        <button type="submit" className="send-btn" disabled={!input.trim()}>
          送信
        </button>
      </form>
    </div>
  );
}
