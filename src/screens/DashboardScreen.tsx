import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { Conversation } from '../services/api';
import './DashboardScreen.css';

interface Props {
  token: string;
  conversations: Conversation[];
  activeConversation?: string;
  agentConnected: boolean;
  pendingApprovalsCount: number;
  onOpenChat: () => void;
  onSelectConversation: (conv: Conversation) => void;
  onSettings: () => void;
  onApprovals: () => void;
}

function relativeTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const MACROS = [
  { icon: '🔍', label: 'Audit Syntax',    cmd: 'Scan the codebase for any critical syntax errors or circular dependencies.' },
  { icon: '🏗️', label: 'Build App',       cmd: 'Execute the native build sequence for the current project.' },
  { icon: '📊', label: 'Analyze Context', cmd: 'Summarize the current working context and memory.' },
  { icon: '🧹', label: 'Clean Cache',     cmd: 'Wipe all cached modules and restart the underlying dev servers.' },
];

export function DashboardScreen({
  token,
  conversations,
  activeConversation,
  agentConnected,
  pendingApprovalsCount,
  onOpenChat,
  onSelectConversation,
  onSettings,
  onApprovals,
}: Props) {
  const [quickMsg, setQuickMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [macroConfirm, setMacroConfirm] = useState<typeof MACROS[0] | null>(null);

  const handleQuickSend = useCallback(async () => {
    if (!quickMsg.trim() || sending) return;
    const text = quickMsg.trim();
    setQuickMsg('');
    setSending(true);
    try {
      await api.sendMessage(token, text);
      onOpenChat();
    } catch (e: any) {
      alert('Send Failed: ' + (e?.message || 'Could not reach your PC.'));
    }
    setSending(false);
  }, [quickMsg, sending, token, onOpenChat]);

  const runMacro = useCallback(async (macro: typeof MACROS[0]) => {
    setMacroConfirm(null);
    setSending(true);
    try {
      await api.sendMessage(token, macro.cmd);
      onOpenChat();
    } catch (e: any) {
      alert('Macro Failed: ' + (e?.message || 'Could not reach proxy.'));
    }
    setSending(false);
  }, [token, onOpenChat]);

  return (
    <div className="dash-screen">
      {/* Header */}
      <div className="dash-header">
        <div>
          <div className="dash-eyebrow">MISSION CONTROL</div>
          <div className="dash-title">ZeroG Remote</div>
        </div>
        <button className="dash-settings-btn" onClick={onSettings}>⚙</button>
      </div>

      <div className="dash-scroll">
        {/* Status Card */}
        <div className="dash-status-card">
          <div className="dash-status-top">
            <div className={`dash-orb ${agentConnected ? 'orb-online' : 'orb-offline'}`}>
              <span className="dash-orb-icon">{agentConnected ? '⚡' : '○'}</span>
            </div>
            <div className="dash-status-info">
              <div className="dash-status-label">Antigravity Agent</div>
              <div className={`dash-status-badge ${agentConnected ? 'badge-online' : 'badge-offline'}`}>
                <span className={`dash-status-dot ${agentConnected ? 'dot-online' : 'dot-offline'}`}></span>
                <span>{agentConnected ? 'Agent Online' : 'Agent Offline'}</span>
              </div>
            </div>
          </div>
          <div className="dash-divider" />
          <button className="dash-chat-launch" onClick={onOpenChat}>
            <span>💬</span>
            <span className="dash-chat-launch-text">Open Chat</span>
            <span className="dash-chat-launch-arrow">→</span>
          </button>

          {/* Approvals button — always visible, badge shows count */}
          <button
            className={`dash-approvals-btn ${pendingApprovalsCount > 0 ? 'has-pending' : ''}`}
            onClick={onApprovals}
          >
            <span>🔐</span>
            <span className="dash-approvals-text">Pending Approvals</span>
            {pendingApprovalsCount > 0 ? (
              <span className="dash-approvals-badge">{pendingApprovalsCount}</span>
            ) : (
              <span className="dash-approvals-none">None</span>
            )}
          </button>
        </div>

        {/* Quick Send */}
        <div className="dash-section">
          <div className="dash-section-label">QUICK SEND</div>
          <div className="dash-quick-row">
            <input
              className="dash-quick-input"
              placeholder="Send a message to your AI..."
              value={quickMsg}
              onChange={e => setQuickMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickSend()}
              disabled={sending}
            />
            <button
              className={`dash-send-btn ${(!quickMsg.trim() || sending) ? 'disabled' : ''}`}
              onClick={handleQuickSend}
              disabled={!quickMsg.trim() || sending}
            >
              {sending ? <span className="spinner-sm" /> : '↑'}
            </button>
          </div>
        </div>

        {/* Mission Macros */}
        <div className="dash-section">
          <div className="dash-section-label">MISSION MACROS</div>
          <div className="dash-macros">
            {MACROS.map((macro, i) => (
              <button
                key={i}
                className="dash-macro-card"
                onClick={() => setMacroConfirm(macro)}
                disabled={sending || !agentConnected}
              >
                <div className="dash-macro-icon-wrap">
                  <span className="dash-macro-icon">{macro.icon}</span>
                </div>
                <span className="dash-macro-label">{macro.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Agents */}
        <div className="dash-section">
          <div className="dash-section-label">RECENT BACKGROUND AGENTS</div>
          {conversations.length === 0 ? (
            <div className="dash-empty">
              <div className="dash-empty-icon">🛰️</div>
              <div className="dash-empty-text">No background agents.</div>
              <div className="dash-empty-sub">They will appear here when active.</div>
            </div>
          ) : (
            conversations.slice(0, 5).map(c => (
              <button
                key={c.id}
                className={`dash-recent-item ${activeConversation === c.id ? 'recent-active' : ''}`}
                onClick={() => onSelectConversation(c)}
              >
                <div className="dash-recent-role">AI</div>
                <span className="dash-recent-text">{c.name}</span>
                <span className="dash-recent-ts">{relativeTime(new Date(c.updatedAt).getTime())}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Macro confirm overlay */}
      {macroConfirm && (
        <div className="macro-overlay" onClick={() => setMacroConfirm(null)}>
          <div className="macro-dialog" onClick={e => e.stopPropagation()}>
            <div className="macro-dialog-title">{macroConfirm.label}</div>
            <div className="macro-dialog-body">Send this command to your agent?<br/><br/><em>"{macroConfirm.cmd}"</em></div>
            <div className="macro-dialog-btns">
              <button className="macro-btn-cancel" onClick={() => setMacroConfirm(null)}>Cancel</button>
              <button className="macro-btn-run" onClick={() => runMacro(macroConfirm)}>Run Macro</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
