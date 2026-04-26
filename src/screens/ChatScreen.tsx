import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';
import type { Message, Conversation } from '../services/api';
import './ChatScreen.css';

interface ChatScreenProps {
  token: string;
  messages: Message[];
  addMessage: (msg: Message) => void;
  sseStatus: string;
  agentConnected: boolean;
  activeConversation?: string;
  setActiveConversation: (id?: string) => void;
  conversations: Conversation[];
  setConversations: (c: Conversation[]) => void;
  bridgeError: string | null;
  setBridgeError: (err: string | null) => void;
  isTyping: boolean;
  setIsTyping: (t: boolean) => void;
  onLogout: () => void;
  onBack?: () => void;
  onSettings?: () => void;
  pendingApprovalsCount?: number;
  onApprovals?: () => void;
  onRefresh?: () => void;
}

const TypingIndicator = () => (
  <div className="message-wrapper agent-wrapper">
    <div className="agent-avatar">Z</div>
    <div className="message-bubble agent-bubble typing-bubble">
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
      <div className="typing-dot"></div>
    </div>
  </div>
);

const MessageBubble = ({ msg }: { msg: Message }) => {
  const isUser = msg.role === 'user';
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.text);
  };

  return (
    <div className={`message-wrapper ${isUser ? 'user-wrapper' : 'agent-wrapper'}`}>
      {!isUser && <div className="agent-avatar">Z</div>}
      <div 
        className={`message-bubble ${isUser ? 'user-bubble' : 'agent-bubble'}`}
        onDoubleClick={handleCopy}
        title="Double click to copy"
      >
        <div className="markdown-body">
          {isUser ? msg.text : <ReactMarkdown>{msg.text}</ReactMarkdown>}
        </div>
        <div className={`message-time ${isUser ? 'user-time' : 'agent-time'}`}>
          {time}
        </div>
      </div>
    </div>
  );
};


// Collapsible workspace group for the conversation switcher menu
const WorkspaceGroup = ({
  workspace, convs, activeConversation, onSelect, showHeader
}: {
  workspace: string;
  convs: Conversation[];
  activeConversation?: string;
  onSelect: (c: Conversation) => void;
  showHeader: boolean;
}) => {
  const [open, setOpen] = useState(true);
  const wsClass = workspace.toLowerCase().replace(/[^a-z]/g, '');
  return (
    <div className="menu-workspace-group">
      {showHeader && (
        <button className="menu-workspace-header" onClick={() => setOpen(o => !o)}>
          <span className={`menu-ws-chip ws-chip-${wsClass}`}>{workspace}</span>
          <span className="menu-ws-count">{convs.length}</span>
          <span className={`menu-ws-chevron ${open ? 'open' : ''}`}>›</span>
        </button>
      )}
      {open && convs.slice(0, 12).map(c => (
        <button
          key={c.id}
          className={`menu-item ${showHeader ? 'menu-item-nested' : ''} ${activeConversation === c.id ? 'active' : ''}`}
          onClick={() => onSelect(c)}
        >
          <span className="agent-badge">AG</span>
          <span className="menu-text">{c.name}</span>
        </button>
      ))}
    </div>
  );
};

export const ChatScreen: React.FC<ChatScreenProps> = ({
  token,
  messages,
  addMessage,
  sseStatus,
  agentConnected,
  activeConversation,
  setActiveConversation,
  conversations,
  setConversations,
  bridgeError,
  setBridgeError,
  isTyping,
  setIsTyping,
  onLogout,
  onBack,
  onSettings,
  pendingApprovalsCount = 0,
  onApprovals,
  onRefresh,
}) => {
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; base64: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const sendingRef = useRef(false); // Synchronous guard — prevents double-send (useState is async and misses rapid calls)

  const isOffline = sseStatus === 'error' || sseStatus === 'disconnected';

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'INJECT_PAYLOAD' && event.data?.text) {
        setInput(event.data.text);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = (event.target?.result as string).split(',')[1];
        setAttachment({ name: file.name, base64: base64String });
      };
      reader.readAsDataURL(file);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attachment) || sendingRef.current) return;
    
    const text = input.trim();
    setInput('');
    const currentAttachmentPayload = attachment;
    setAttachment(null);
    sendingRef.current = true;
    setSending(true);
    
    addMessage({ 
      role: 'user', 
      text: text || (currentAttachmentPayload ? `📎 Attached: ${currentAttachmentPayload.name}` : ''), 
      ts: Date.now() 
    });

    try {
      await api.sendMessage(token, text, activeConversation, currentAttachmentPayload || undefined);
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 30_000); // 30s safety fallback — primary clear is in onReply
    } catch {
      addMessage({ role: 'agent', text: '⚠️ Failed to deliver. Check your connection.', ts: Date.now() });
    }
    sendingRef.current = false;
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoice = () => {
    // Stop if already listening
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input is not supported on this device.');
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev ? prev + ' ' + transcript : transcript);
    };
    rec.onerror = () => { setIsListening(false); };
    rec.onend = () => { setIsListening(false); };
    rec.start();
  };

  const activeName = activeConversation 
    ? conversations.find(c => c.id === activeConversation)?.name || 'Background Agent'
    : 'Active IDE';

  return (
    <div className="chat-container">
      {/* Header */}
      <header className="chat-header">
        <div className="header-left">
          {onBack && (
            <button className="back-btn" onClick={onBack} aria-label="Back">
              ‹
            </button>
          )}
          <div className="header-avatar" onClick={() => { setShowMenu(true); onRefresh?.(); }}>Z</div>
          <div className="header-info" onClick={() => { setShowMenu(true); onRefresh?.(); }}>
            <div className="header-title-row">
              <span className="header-name">{activeName}</span>
              <span className="header-caret">▼</span>
            </div>
            <div className="header-status-row">
              <span className={`status-dot-small ${agentConnected ? 'online' : 'offline'}`}></span>
              <span className="header-status-text">
                {isOffline ? 'Stream offline' : agentConnected ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => setShowMenu(true)} aria-label="Switch conversation">▼</button>
          {onSettings && (
            <button className="icon-btn" onClick={onSettings} aria-label="Settings">⚙</button>
          )}
        </div>
      </header>
      {showMenu && (() => {
        // Group by workspace for multilevel menu
        const groups: Record<string, Conversation[]> = {};
        for (const c of conversations) {
          const ws = c.workspace || 'Other';
          if (!groups[ws]) groups[ws] = [];
          groups[ws].push(c);
        }
        // Always show workspace headers so users always see which workspace they're in
        return (
          <div className="menu-overlay" onClick={() => setShowMenu(false)}>
            <div className="menu-box" onClick={(e) => e.stopPropagation()}>
              <div className="menu-header-row">
                <span className="menu-label">SWITCH CONVERSATION</span>
                <button className="logout-btn" onClick={onLogout}>Logout</button>
              </div>

              {/* Active IDE shortcut */}
              <button
                className={`menu-item ${!activeConversation ? 'active' : ''}`}
                onClick={() => { setActiveConversation(undefined); setShowMenu(false); }}
              >
                <span className="menu-icon">💻</span>
                <span className="menu-text">Active IDE Session</span>
              </button>

              <div className="menu-divider" />

              {/* Workspace groups — headers only shown when 2+ workspaces exist */}
              {Object.entries(groups).map(([workspace, convs]) => (
                <WorkspaceGroup
                  key={workspace}
                  workspace={workspace}
                  convs={convs}
                  activeConversation={activeConversation}
                  showHeader={true}
                  onSelect={(c) => {
                    setActiveConversation(c.id);
                    setShowMenu(false);
                    api.triggerTabToggle(c.id, c.name).catch(() => {});
                  }}
                />
              ))}

              <div className="menu-divider" />

              <button
                className="menu-item"
                onClick={() => {
                  const id = 'convo-' + Date.now();
                  setActiveConversation(id);
                  api.triggerTabToggle(id, 'New Background Agent').catch(() => {});
                  setConversations([{id, name: 'New Background Agent', updatedAt: new Date().toISOString()}, ...conversations]);
                  setShowMenu(false);
                }}
              >
                <span className="menu-icon">✨</span>
                <span className="menu-text">New Background Agent</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Banners */}
      {isOffline && (
        <div className="banner offline-banner">
          ⚠️ Reconnecting to real-time stream...
        </div>
      )}

      {bridgeError && !isOffline && (
        <div className="banner error-banner" onClick={() => setBridgeError(null)}>
          🔴 {bridgeError}
          <div className="banner-dismiss">Click to dismiss</div>
        </div>
      )}

      {/* Approval banner — shows inline in chat without yanking user away */}
      {pendingApprovalsCount > 0 && onApprovals && (
        <button className="approval-banner" onClick={onApprovals}>
          <span className="approval-banner-icon">🔐</span>
          <span className="approval-banner-text">
            {pendingApprovalsCount === 1
              ? 'Approval needed — tap to review'
              : `${pendingApprovalsCount} approvals pending — tap to review`}
          </span>
          <span className="approval-banner-arrow">›</span>
        </button>
      )}

      {/* Message List */}
      <div className="messages-area" ref={listRef}>
        {messages.length === 0 && !isTyping ? (
          <div className="empty-state">
            <div className="empty-orb">⚡</div>
            <h2 className="empty-title">Ready for launch</h2>
            <p className="empty-sub">Your Antigravity agent is standing by.<br/>Send a message to begin.</p>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((msg, idx) => (
              <MessageBubble key={idx} msg={msg} />
            ))}
            {isTyping && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="input-container">
        {attachment && (
          <div className="attachment-preview">
            <span className="attachment-name">📎 {attachment.name}</span>
            <button className="attachment-close" onClick={() => setAttachment(null)}>×</button>
          </div>
        )}
        <form className="input-bar" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
          <button 
            type="button" 
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            +
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            style={{ display: 'none' }} 
          />
          <div className="textarea-wrap">
            <textarea
              className="chat-input"
              placeholder="Message your AI..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              rows={1}
            />
          </div>
          {(!input.trim() && !attachment && !sending) ? (
            <button
              type="button"
              className={`mic-btn ${isListening ? 'mic-active' : ''}`}
              onClick={handleVoice}
              aria-label="Voice input"
            >
              {isListening ? '⏹' : '🎙'}
            </button>
          ) : (
            <button
              type="submit"
              className={`send-btn ${sending ? 'disabled' : ''}`}
              disabled={sending}
            >
              {sending ? <div className="spinner-small" /> : '↑'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
