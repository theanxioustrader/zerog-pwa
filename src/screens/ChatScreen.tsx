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
}) => {
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; base64: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOffline = sseStatus === 'error' || sseStatus === 'disconnected';

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

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
    if ((!input.trim() && !attachment) || sending) return;
    
    const text = input.trim();
    setInput('');
    const currentAttachmentPayload = attachment;
    setAttachment(null);
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
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
          <div className="header-avatar" onClick={() => setShowMenu(true)}>Z</div>
          <div className="header-info" onClick={() => setShowMenu(true)}>
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
        {onSettings && (
          <button className="icon-btn" onClick={onSettings} aria-label="Settings">⚙</button>
        )}
      </header>

      {/* Menu Overlay */}
      {showMenu && (
        <div className="menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="menu-box" onClick={(e) => e.stopPropagation()}>
            <div className="menu-header-row">
              <span className="menu-label">SWITCH CONVERSATION</span>
              <button className="logout-btn" onClick={onLogout}>Logout</button>
            </div>
            
            <button 
              className={`menu-item ${!activeConversation ? 'active' : ''}`}
              onClick={() => { setActiveConversation(undefined); setShowMenu(false); }}
            >
              <span className="menu-icon">💻</span>
              <span className="menu-text">Active IDE Session</span>
            </button>

            {conversations.slice(0, 4).map(c => (
              <button 
                key={c.id}
                className={`menu-item ${activeConversation === c.id ? 'active' : ''}`}
                onClick={() => { 
                  setActiveConversation(c.id); 
                  setShowMenu(false); 
                  api.triggerTabToggle(c.id, c.name).catch(()=>{});
                }}
              >
                <span className="agent-badge">AG</span>
                <span className="menu-text">{c.name}</span>
              </button>
            ))}

            <div className="menu-divider" />

            <button 
              className="menu-item"
              onClick={() => {
                const id = 'convo-' + Date.now();
                setActiveConversation(id);
                api.triggerTabToggle(id, 'New Background Agent').catch(()=>{});
                setConversations([{id, name: 'New Background Agent', updatedAt: new Date().toISOString()}, ...conversations]);
                setShowMenu(false);
              }}
            >
              <span className="menu-icon">✨</span>
              <span className="menu-text">New Background Agent</span>
            </button>
          </div>
        </div>
      )}

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
          <button 
            type="submit" 
            className={`send-btn ${(!input.trim() && !attachment || sending) ? 'disabled' : ''}`}
            disabled={(!input.trim() && !attachment) || sending}
          >
            {sending ? <div className="spinner-small" /> : '↑'}
          </button>
        </form>
      </div>
    </div>
  );
};
