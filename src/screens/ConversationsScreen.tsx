import { useEffect, useState } from 'react';
import type { Conversation } from '../services/api';
import './ConversationsScreen.css';

interface Props {
  token: string;
  conversations: Conversation[];
  activeConversation?: string;
  agentConnected: boolean;
  onSelectConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ConversationsScreen({
  conversations,
  activeConversation,
  agentConnected,
  onSelectConversation,
  onNewConversation,
  onRefresh,
  onSettings,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    onRefresh();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div className="conv-screen">
      {/* Header */}
      <div className="conv-header">
        <div className="conv-header-left">
          <div className="conv-logo">Z</div>
          <div>
            <div className="conv-title">ZeroG</div>
            <div className="conv-subtitle">
              <span className={`conn-dot ${agentConnected ? 'online' : 'offline'}`}></span>
              {agentConnected ? 'Agent Online' : 'Reconnecting…'}
            </div>
          </div>
        </div>
        <div className="conv-header-actions">
          <button
            className="icon-btn"
            onClick={handleRefresh}
            title="Refresh"
          >
            <span className={`refresh-icon ${refreshing ? 'spinning' : ''}`}>↻</span>
          </button>
          <button className="icon-btn" onClick={onSettings} title="Settings">
            ⚙
          </button>
        </div>
      </div>

      {/* Section label */}
      <div className="conv-section-label">CONVERSATIONS</div>

      {/* List */}
      <div className="conv-list">
        {conversations.length === 0 ? (
          <div className="conv-empty">
            <div className="conv-empty-icon">💬</div>
            <div className="conv-empty-text">No conversations yet</div>
            <div className="conv-empty-sub">Start a new one below</div>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              className={`conv-row ${conv.id === activeConversation ? 'conv-row-active' : ''}`}
              onClick={() => onSelectConversation(conv)}
            >
              <div className="conv-row-avatar">
                <span className="conv-row-avatar-letter">
                  {conv.name?.[0]?.toUpperCase() || 'A'}
                </span>
                {conv.id === activeConversation && (
                  <span className="conv-row-active-dot"></span>
                )}
              </div>
              <div className="conv-row-body">
                <div className="conv-row-name">{conv.name || `Session ${conv.id.slice(0, 6)}`}</div>
                <div className="conv-row-time">{timeAgo(conv.updatedAt)}</div>
              </div>
              <div className="conv-row-chevron">›</div>
            </button>
          ))
        )}
      </div>

      {/* New conversation FAB */}
      <button className="new-conv-fab" onClick={onNewConversation}>
        <span className="fab-icon">+</span>
        <span className="fab-label">New Conversation</span>
      </button>
    </div>
  );
}
