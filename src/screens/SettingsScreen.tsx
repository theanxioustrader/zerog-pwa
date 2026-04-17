import './SettingsScreen.css';
import type { Conversation } from '../services/api';
import { api } from '../services/api';

interface Props {
  token: string;
  sseStatus: string;
  agentConnected: boolean;
  conversations: Conversation[];
  activeConversation?: string;
  onSelectConversation: (conv: Conversation) => void;
  onLogout: () => void;
  onBack: () => void;
}

export function SettingsScreen({
  sseStatus,
  agentConnected,
  conversations,
  activeConversation,
  onSelectConversation,
  onLogout,
  onBack,
}: Props) {
  const statusColor =
    sseStatus === 'connected'  ? 'var(--green)' :
    sseStatus === 'connecting' ? 'var(--accent-2)' :
    'var(--red)';

  const statusLabel =
    sseStatus === 'connected'  ? 'Live' :
    sseStatus === 'connecting' ? 'Connecting…' :
    sseStatus === 'error'      ? 'Error' : 'Offline';

  const handleSwitchConversation = async (conv: Conversation) => {
    onSelectConversation(conv);
    try { await api.triggerTabToggle(conv.id, conv.name); } catch {}
  };

  return (
    <div className="settings-screen">
      {/* Header */}
      <div className="settings-header">
        <button className="settings-back" onClick={onBack} aria-label="Back">‹</button>
        <div className="settings-header-text">
          <div className="settings-eyebrow">ZEROG REMOTE</div>
          <div className="settings-title">Settings</div>
        </div>
      </div>

      <div className="settings-scroll">

        {/* Agent Connection Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-label">AGENT CONNECTION</span>
            <span className="settings-status-pill" style={{ background: `${statusColor}20`, borderColor: `${statusColor}50`, color: statusColor }}>
              <span className="settings-status-dot" style={{ background: statusColor }}></span>
              {statusLabel}
            </span>
          </div>

          <div className="settings-info-row">
            <span className="settings-info-key">Bridge</span>
            <span className="settings-info-val">zerog-cloud-switchboard.fly.dev</span>
          </div>
          <div className="settings-info-row">
            <span className="settings-info-key">Stream</span>
            <span className="settings-info-val">{sseStatus}</span>
          </div>
          <div className="settings-info-row" style={{ borderBottom: 'none' }}>
            <span className="settings-info-key">Agent</span>
            <span className="settings-info-val" style={{ color: agentConnected ? 'var(--green)' : 'var(--muted)' }}>
              {agentConnected ? 'Working' : 'Idle'}
            </span>
          </div>
        </div>

        {/* Conversations */}
        <div className="settings-section-header">
          <span className="settings-section-label">CONVERSATIONS</span>
          <span className="settings-section-sub">{conversations.length} found</span>
        </div>

        <div className="settings-card">
          {/* Active IDE */}
          <button
            className={`settings-conv-row ${!activeConversation ? 'conv-active' : ''}`}
            onClick={() => onSelectConversation({ id: '', name: 'Active IDE Session', updatedAt: new Date().toISOString() })}
          >
            <div className="settings-conv-icon" style={{ background: 'var(--surface-2)' }}>
              <span>💻</span>
            </div>
            <div className="settings-conv-info">
              <div className="settings-conv-name">Active IDE Session</div>
              <div className="settings-conv-sub">Default — no specific conversation</div>
            </div>
            {!activeConversation && <span className="settings-active-dot"></span>}
          </button>

          {conversations.map((c, idx) => {
            const isActive = activeConversation === c.id;
            const isLast = idx === conversations.length - 1;
            const date = new Date(c.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
            return (
              <button
                key={c.id}
                className={`settings-conv-row ${isActive ? 'conv-active' : ''} ${isLast ? 'row-last' : ''}`}
                onClick={() => handleSwitchConversation(c)}
              >
                <div className="settings-conv-icon" style={{ background: isActive ? 'rgba(99,102,241,0.2)' : 'var(--surface-2)' }}>
                  <span className="settings-conv-icon-text" style={{ color: isActive ? 'var(--accent)' : 'var(--accent-2)' }}>AG</span>
                </div>
                <div className="settings-conv-info">
                  <div className="settings-conv-name" style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}>{c.name}</div>
                  <div className="settings-conv-sub">{date}</div>
                </div>
                {isActive && <span className="settings-active-dot"></span>}
              </button>
            );
          })}
        </div>

        {/* Disconnect */}
        <button className="settings-signout-btn" onClick={onLogout}>
          Disconnect Agent
        </button>

        <div className="settings-build-note">ZeroG Remote · Built for launch 🚀</div>
      </div>
    </div>
  );
}
